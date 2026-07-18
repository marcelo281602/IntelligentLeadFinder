import type { Db } from './db';
import { errorSummary, log } from './logger';
import {
  claimJob,
  completeJob,
  enqueueJob,
  failJob,
  recoverStalledJobs,
  type Job,
} from './queue';
import { handleGenerateExport } from './pipeline/export';
import { handleIngest } from './pipeline/ingest';
import { handleNormalize } from './pipeline/normalize';
import { handleReconcile } from './pipeline/reconcile';
import { handleRetentionSweep } from './pipeline/retention';
import { handleRunSearch } from './pipeline/run-search';
import { handleSyncDestination } from './pipeline/sync-destinations';

/**
 * Job engine shared by the standalone worker (long-running loop) and the
 * Vercel Cron route (`/api/cron/worker`, invoked ~once a minute). Because the
 * queue uses FOR UPDATE SKIP LOCKED and every stage is idempotent and
 * checkpointed, either runner processes the same jobs safely — the only
 * difference is cadence.
 */

export interface EngineEnv {
  APP_ENCRYPTION_KEY: string;
}

async function dispatch(db: Db, job: Job, env: EngineEnv): Promise<void | 'done' | 'rescheduled'> {
  switch (job.kind) {
    case 'run_search':
      return handleRunSearch(db, job, env.APP_ENCRYPTION_KEY);
    case 'ingest_dataset':
      // 'rescheduled' means the poll job was set back to pending with a delay
      // (provider still working) and must NOT be marked succeeded.
      return handleIngest(db, job, env.APP_ENCRYPTION_KEY);
    case 'normalize_run':
      return handleNormalize(db, job);
    case 'reconcile_costs':
      return handleReconcile(db, job, env.APP_ENCRYPTION_KEY);
    case 'generate_export':
      return handleGenerateExport(db, job);
    case 'sync_destination':
      return handleSyncDestination(db, job, env.APP_ENCRYPTION_KEY);
    case 'retention_sweep':
      return handleRetentionSweep(db);
    case 'dedupe_run':
    case 'enrich_run':
    case 'test_connection':
      log.warn('Job kind handled inline elsewhere; nothing to do', { jobKind: job.kind });
      return;
  }
}

/** Run one already-claimed job with complete/fail bookkeeping. */
export async function runClaimedJob(db: Db, job: Job, env: EngineEnv): Promise<void> {
  const ctx = { jobId: job.id, jobKind: job.kind, orgId: job.organization_id, runId: job.run_id };
  log.info('Job claimed', ctx);
  try {
    const result = await dispatch(db, job, env);
    if (result !== 'rescheduled') {
      await completeJob(db, job.id);
      log.info('Job succeeded', ctx);
    }
  } catch (error) {
    log.error('Job failed', { ...ctx, error: errorSummary(error) });
    const outcome = await failJob(db, job, error);
    if (outcome === 'dead_letter' && job.run_id && job.organization_id) {
      await db.query(
        `update public.search_runs set status = 'failed', error_summary = $2, completed_at = now()
         where id = $1 and status not in ('completed','cancelled','failed')`,
        [job.run_id, errorSummary(error)],
      );
    }
  }
}

/**
 * Claim and process jobs until the queue is empty, a time budget is exhausted,
 * or a job cap is reached. Returns how many jobs it processed. Designed for the
 * cron route's bounded per-invocation window.
 */
export async function processQueueTick(
  db: Db,
  env: EngineEnv,
  opts: { workerId: string; budgetMs: number; maxJobs?: number },
): Promise<{ processed: number }> {
  const deadline = Date.now() + opts.budgetMs;
  const maxJobs = opts.maxJobs ?? 500;
  let processed = 0;
  while (Date.now() < deadline && processed < maxJobs) {
    let job: Job | null = null;
    try {
      job = await claimJob(db, opts.workerId);
    } catch (error) {
      log.error('Failed to claim job', { error: errorSummary(error) });
      break;
    }
    if (!job) break;
    await runClaimedJob(db, job, env);
    processed += 1;
  }
  return { processed };
}

/** Recover stalled jobs and enqueue the hourly retention sweep. */
export async function runMaintenance(db: Db): Promise<void> {
  const recovered = await recoverStalledJobs(db);
  if (recovered > 0) log.warn(`Recovered ${recovered} stalled job(s)`);
  const hourKey = new Date().toISOString().slice(0, 13);
  await enqueueJob(db, { kind: 'retention_sweep', idempotencyKey: `retention:${hourKey}` });
}
