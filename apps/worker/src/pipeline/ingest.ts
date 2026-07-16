import { createHash } from 'node:crypto';
import { getMapsAdapter } from '@leadfinder/providers';
import { redactObject } from '@leadfinder/security';
import type { ProviderKind } from '@leadfinder/core';
import type { Db } from '../db';
import { auditLog, notify } from '../ledger';
import { log } from '../logger';
import type { Job } from '../queue';
import { enqueueJob, heartbeatJob, rescheduleJob } from '../queue';
import {
  bumpCounts,
  finishStage,
  getRun,
  heartbeatRun,
  saveCheckpoint,
  transitionRun,
} from '../runs';
import { loadCredentials } from '../secrets';
import { handleCancellation } from './run-search';

const PAGE_SIZE = 100;

/**
 * Stage 2 — poll the provider until done, then ingest the dataset in pages.
 * Resumable: checkpoint.offset survives worker restarts; raw-record inserts
 * are idempotent on (run_id, payload_hash).
 */
export async function handleIngest(db: Db, job: Job, masterKey: string): Promise<'done' | 'rescheduled'> {
  const run = await getRun(db, job.run_id!);
  if (!run) throw new Error(`Run ${job.run_id} not found`);

  if (run.status === 'cancellation_requested') {
    await handleCancellation(db, run, masterKey);
    return 'done';
  }
  if (!['running', 'ingesting'].includes(run.status)) {
    log.warn('ingest skipped: unexpected status', { runId: run.id, status: run.status });
    return 'done';
  }

  const adapter = getMapsAdapter(run.provider as ProviderKind);
  const credentials = await loadCredentials(db, run.connection_id, run.provider, masterKey);

  // 1. Verify provider state via the authoritative API (never trust webhooks alone).
  const status = await adapter.getRunStatus(credentials, run.provider_run_id!);
  await heartbeatRun(db, run.id);

  if (status.state === 'running') {
    await rescheduleJob(db, job.id, run.is_fixture ? 500 : 15_000);
    return 'rescheduled';
  }

  const datasetId = run.provider_dataset_id ?? status.datasetId;
  const providerFailed = status.state !== 'succeeded';

  if (providerFailed && !datasetId) {
    await transitionRun(db, run, 'failed', {
      error: status.error ?? `Provider run ${status.state} with no dataset.`,
    });
    await notify(db, {
      orgId: run.organization_id,
      userId: run.created_by,
      type: 'run.failed',
      title: 'Search run failed',
      body: status.error ?? undefined,
      href: `/runs/${run.id}`,
    });
    return 'done';
  }

  if (run.status === 'running') {
    await transitionRun(db, run, 'ingesting');
    await db.query(
      `update public.search_runs set provider_dataset_id = coalesce(provider_dataset_id, $2), provider_meta = provider_meta || $3::jsonb
       where id = $1`,
      [run.id, datasetId ?? null, JSON.stringify(redactObject(status.meta ?? {}))],
    );
    if (providerFailed) {
      await saveCheckpoint(db, run.id, { partial: true, providerState: status.state });
    }
  }

  // 2. Page through the dataset from the checkpoint.
  const retentionDays = await rawRetentionDays(db, run.organization_id);
  let offset = Number(run.checkpoint.offset ?? 0);
  let ingested = 0;
  for (;;) {
    const page = await adapter.fetchDatasetPage(credentials, datasetId!, offset, PAGE_SIZE);
    if (page.total !== undefined && offset === 0) {
      await db.query(`update public.search_runs set discovered_count = $2 where id = $1`, [
        run.id,
        page.total,
      ]);
    }
    if (page.items.length === 0) break;

    for (const [index, item] of page.items.entries()) {
      const payload = JSON.stringify(redactObject(item));
      const hash = createHash('sha256').update(payload).digest('hex');
      const providerRecordId =
        (item as { placeId?: string } | null)?.placeId ?? null;
      await db.query(
        `insert into public.provider_raw_records
           (organization_id, run_id, provider, provider_record_id, ordinal, page_number, payload, payload_hash, retention_until)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' days')::interval)
         on conflict (run_id, payload_hash) do nothing`,
        [
          run.organization_id,
          run.id,
          run.provider,
          providerRecordId,
          offset + index,
          Math.floor(offset / PAGE_SIZE),
          payload,
          hash,
          String(retentionDays),
        ],
      );
      ingested += 1;
    }

    offset += page.items.length;
    await saveCheckpoint(db, run.id, { offset });
    await bumpCounts(db, run.id, { ingested_count: page.items.length });
    await heartbeatRun(db, run.id);
    await heartbeatJob(db, job.id);

    const fresh = await getRun(db, run.id);
    if (fresh?.status === 'cancellation_requested') {
      await handleCancellation(db, fresh, masterKey);
      return 'done';
    }
    if (page.items.length < PAGE_SIZE) break;
  }

  log.info('Dataset ingestion finished', { runId: run.id, ingested, offset });
  await transitionRun(db, run, 'normalizing');
  await finishStage(db, run.id, 'ingesting', 'succeeded');
  await auditLog(db, {
    orgId: run.organization_id,
    action: 'run.ingested',
    entityKind: 'search_run',
    entityId: run.id,
    details: { ingested, offset },
  });
  await enqueueJob(db, {
    kind: 'normalize_run',
    orgId: run.organization_id,
    runId: run.id,
    idempotencyKey: `normalize:${run.id}`,
  });
  return 'done';
}

async function rawRetentionDays(db: Db, orgId: string): Promise<number> {
  const { rows } = await db.query(
    `select raw_payload_retention_days from public.organizations where id = $1`,
    [orgId],
  );
  return Number(rows[0]?.raw_payload_retention_days ?? 30);
}
