import { getMapsAdapter } from '@leadfinder/providers';
import type { ProviderKind } from '@leadfinder/core';
import type { Db } from '../db';
import { auditLog, notify } from '../ledger';
import { log } from '../logger';
import type { Job } from '../queue';
import { enqueueJob } from '../queue';
import { finishStage, getRun, transitionRun } from '../runs';
import { loadCredentials } from '../secrets';

/**
 * Stage 1 — start the provider run.
 * Idempotent: if a provider run id is already persisted (e.g. the worker died
 * after starting the run), it is never started again — duplicate-start
 * protection for paid jobs.
 */
export async function handleRunSearch(db: Db, job: Job, masterKey: string): Promise<void> {
  const run = await getRun(db, job.run_id!);
  if (!run) throw new Error(`Run ${job.run_id} not found`);
  if (!['queued', 'starting'].includes(run.status)) {
    log.warn('run_search skipped: unexpected status', { runId: run.id, status: run.status });
    return;
  }
  if (run.status === 'queued') {
    await transitionRun(db, run, 'starting');
  }

  const hardCap = Number(run.hard_cap_micro_usd ?? 0);
  if (!Number.isInteger(hardCap) || hardCap <= 0) {
    await transitionRun(db, run, 'failed', {
      error: 'Run has no hard cost cap — refusing to start a paid provider job.',
    });
    await finishStage(db, run.id, 'starting', 'failed', 'missing hard cap');
    return;
  }

  const adapter = getMapsAdapter(run.provider as ProviderKind);
  const credentials = await loadCredentials(db, run.connection_id, run.provider, masterKey);

  if (!run.provider_run_id) {
    const callbackUrl = (job.payload.callbackUrl as string | undefined) ?? null;
    const result = await adapter.startRun({
      credentials,
      config: run.config_snapshot as never,
      hardCapMicroUsd: hardCap,
      sourceId: (job.payload.sourceId as string | undefined) ?? undefined,
      callbackUrl,
    });
    // Persist provider identifiers immediately — before anything can fail.
    await db.query(
      `update public.search_runs set provider_run_id = $2, provider_dataset_id = coalesce($3, provider_dataset_id)
       where id = $1`,
      [run.id, result.providerRunId, result.datasetId ?? null],
    );
    run.provider_run_id = result.providerRunId;
    await auditLog(db, {
      orgId: run.organization_id,
      action: 'run.provider_started',
      entityKind: 'search_run',
      entityId: run.id,
      details: { provider: run.provider, providerRunId: result.providerRunId, hardCapMicroUsd: hardCap },
    });
  }

  await transitionRun(db, run, 'running');
  await finishStage(db, run.id, 'starting', 'succeeded');

  await enqueueJob(db, {
    kind: 'ingest_dataset',
    orgId: run.organization_id,
    runId: run.id,
    idempotencyKey: `ingest:${run.id}`,
    runAfterMs: run.is_fixture ? 500 : 10_000,
  });
}

/** Handle a cancellation request: abort provider-side, settle final state. */
export async function handleCancellation(
  db: Db,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  masterKey: string,
): Promise<void> {
  try {
    if (run.provider_run_id) {
      const adapter = getMapsAdapter(run.provider as ProviderKind);
      const credentials = await loadCredentials(db, run.connection_id, run.provider, masterKey);
      await adapter.abortRun(credentials, run.provider_run_id);
    }
  } catch (error) {
    log.warn('Provider abort failed; settling local state anyway', {
      runId: run.id,
      error: String(error),
    });
  }
  const to = run.accepted_count > 0 ? 'partially_completed' : 'cancelled';
  await transitionRun(db, run, to);
  await notify(db, {
    orgId: run.organization_id,
    userId: run.created_by,
    type: 'run.cancelled',
    title: 'Search run cancelled',
    body: run.accepted_count > 0 ? `${run.accepted_count} records were kept.` : undefined,
    href: `/runs/${run.id}`,
  });
  await auditLog(db, {
    orgId: run.organization_id,
    action: 'run.cancelled',
    entityKind: 'search_run',
    entityId: run.id,
  });
}
