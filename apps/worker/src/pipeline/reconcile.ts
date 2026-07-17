import { formatMicroUsd } from '@leadfinder/core';
import { getMapsAdapter } from '@leadfinder/providers';
import type { ProviderKind } from '@leadfinder/core';
import type { Db } from '../db';
import { auditLog, notify, recordUsage } from '../ledger';
import { log } from '../logger';
import { enqueueJob, type Job } from '../queue';
import { finishStage, getRun, transitionRun } from '../runs';
import { loadCredentials } from '../secrets';

/**
 * Stage 4 — reconcile estimated vs. provider-reported actual cost, write the
 * usage ledger idempotently, and settle the run's final state.
 */
export async function handleReconcile(db: Db, job: Job, masterKey: string): Promise<void> {
  const run = await getRun(db, job.run_id!);
  if (!run) throw new Error(`Run ${job.run_id} not found`);
  if (run.status !== 'export_ready') {
    log.warn('reconcile skipped: unexpected status', { runId: run.id, status: run.status });
    return;
  }

  // Fetch authoritative usage after provider totals stabilize.
  let actualMicroUsd = 0;
  try {
    const adapter = getMapsAdapter(run.provider as ProviderKind);
    const credentials = await loadCredentials(db, run.connection_id, run.provider, masterKey);
    const status = await adapter.getRunStatus(credentials, run.provider_run_id!);
    actualMicroUsd = status.usageTotalMicroUsd ?? 0;
  } catch (error) {
    log.warn('Could not fetch provider usage; storing zero and flagging', {
      runId: run.id,
      error: String(error),
    });
  }

  const estimated = Number(run.estimate_expected_micro_usd ?? 0);
  const variance = actualMicroUsd - estimated;
  const explanation =
    actualMicroUsd === 0 && run.provider !== 'fixture'
      ? 'Provider usage unavailable at reconciliation time.'
      : variance === 0
        ? 'Actual cost matched the expected estimate.'
        : variance < 0
          ? 'Actual cost below estimate: fewer places or successful enrichments than assumed.'
          : 'Actual cost above expected estimate (within the approved hard cap): more successful enrichments than assumed.';

  await db.query(
    `insert into public.cost_ledger
       (organization_id, run_id, provider, estimated_micro_usd, capped_micro_usd, actual_micro_usd, variance_micro_usd, variance_explanation, reconciled_at)
     values ($1, $2, $3::public.provider_kind, $4, $5, $6, $7, $8, now())
     on conflict (run_id) do update set
       actual_micro_usd = excluded.actual_micro_usd,
       variance_micro_usd = excluded.variance_micro_usd,
       variance_explanation = excluded.variance_explanation,
       reconciled_at = now()`,
    [
      run.organization_id,
      run.id,
      run.provider,
      estimated,
      run.hard_cap_micro_usd,
      actualMicroUsd,
      variance,
      explanation,
    ],
  );
  await db.query(
    `update public.search_runs set actual_cost_micro_usd = $2, cost_reconciled_at = now() where id = $1`,
    [run.id, actualMicroUsd],
  );

  // Idempotent ledger entries — a retried reconcile can never double-charge.
  await recordUsage(db, {
    orgId: run.organization_id,
    runId: run.id,
    userId: run.created_by,
    provider: run.provider,
    feature: 'provider_cost',
    quantity: 1,
    unit: 'run',
    costMicroUsd: actualMicroUsd,
    idempotencyKey: `${run.id}:provider_cost`,
  });
  await recordUsage(db, {
    orgId: run.organization_id,
    runId: run.id,
    userId: run.created_by,
    provider: run.provider,
    feature: 'companies_collected',
    quantity: run.accepted_count,
    unit: 'company',
    idempotencyKey: `${run.id}:companies_collected`,
  });
  if (run.enriched_count > 0) {
    await recordUsage(db, {
      orgId: run.organization_id,
      runId: run.id,
      userId: run.created_by,
      provider: run.provider,
      feature: 'decision_makers_found',
      quantity: run.enriched_count,
      unit: 'contact',
      idempotencyKey: `${run.id}:decision_makers_found`,
    });
  }

  const partial = Boolean(run.checkpoint.partial) || run.failed_count > 0;
  await transitionRun(db, run, partial ? 'partially_completed' : 'completed');
  await finishStage(db, run.id, 'export_ready', 'succeeded');

  await notify(db, {
    orgId: run.organization_id,
    userId: run.created_by,
    type: partial ? 'run.partially_completed' : 'run.completed',
    title: partial ? 'Search partially completed' : 'Search completed',
    body: `${run.accepted_count} companies (${run.duplicate_count} duplicates merged). Cost: ${formatMicroUsd(actualMicroUsd)}.`,
    href: `/runs/${run.id}`,
  });
  await auditLog(db, {
    orgId: run.organization_id,
    action: 'run.reconciled',
    entityKind: 'search_run',
    entityId: run.id,
    details: { estimated, actualMicroUsd, variance, partial },
  });

  // Auto-sync: push this run's new leads to every auto-sync destination so the
  // client's Google Sheet / webhook stays current without a manual export.
  if (run.accepted_count > 0) {
    const { rows: destinations } = await db.query(
      `select id from public.destinations
       where organization_id = $1 and auto_sync = true and status <> 'disconnected' and deleted_at is null`,
      [run.organization_id],
    );
    for (const destination of destinations) {
      await enqueueJob(db, {
        kind: 'sync_destination',
        orgId: run.organization_id,
        runId: run.id,
        idempotencyKey: `dest:${destination.id as string}:${run.id}`,
        payload: { destinationId: destination.id, runId: run.id },
        runAfterMs: run.is_fixture ? 200 : 2000,
      });
    }
  }
}
