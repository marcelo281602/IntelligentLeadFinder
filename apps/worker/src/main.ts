import { serverEnv } from '@leadfinder/config';
import { createPool } from '@leadfinder/db';
import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import { errorSummary, log } from './logger';
import { claimJob, completeJob, enqueueJob, failJob, recoverStalledJobs, type Job } from './queue';
import { handleGenerateExport } from './pipeline/export';
import { handleIngest } from './pipeline/ingest';
import { handleNormalize } from './pipeline/normalize';
import { handleReconcile } from './pipeline/reconcile';
import { handleRetentionSweep } from './pipeline/retention';
import { handleRunSearch } from './pipeline/run-search';

/**
 * LeadFinder worker: durable job processing over Postgres.
 * Safe to run multiple instances — claims use SKIP LOCKED, every stage is
 * idempotent and resumable, and stalled jobs are recovered by heartbeat.
 */

const env = serverEnv();
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is required for the worker.');
  process.exit(1);
}

const pool = createPool(env.DATABASE_URL, env.WORKER_CONCURRENCY + 2);
const db: Db = pool;
const workerId = `worker-${randomUUID().slice(0, 8)}`;
let shuttingDown = false;

async function dispatch(job: Job): Promise<void> {
  switch (job.kind) {
    case 'run_search':
      return handleRunSearch(db, job, env.APP_ENCRYPTION_KEY);
    case 'ingest_dataset':
      await handleIngest(db, job, env.APP_ENCRYPTION_KEY);
      return;
    case 'normalize_run':
      return handleNormalize(db, job);
    case 'reconcile_costs':
      return handleReconcile(db, job, env.APP_ENCRYPTION_KEY);
    case 'generate_export':
      return handleGenerateExport(db, job, env.EXPORT_STORAGE_DIR);
    case 'retention_sweep':
      return handleRetentionSweep(db);
    case 'dedupe_run':
    case 'enrich_run':
    case 'test_connection':
      log.warn('Job kind handled inline elsewhere; nothing to do', { jobKind: job.kind });
      return;
  }
}

async function workLoop(slot: number): Promise<void> {
  while (!shuttingDown) {
    let job: Job | null = null;
    try {
      job = await claimJob(db, `${workerId}#${slot}`);
    } catch (error) {
      log.error('Failed to claim job', { error: errorSummary(error) });
    }
    if (!job) {
      await sleep(env.WORKER_POLL_INTERVAL_MS);
      continue;
    }
    const ctx = { jobId: job.id, jobKind: job.kind, orgId: job.organization_id, runId: job.run_id };
    log.info('Job claimed', ctx);
    try {
      const result = (await dispatch(job)) as unknown;
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maintenanceLoop(): Promise<void> {
  while (!shuttingDown) {
    try {
      const recovered = await recoverStalledJobs(db);
      if (recovered > 0) log.warn(`Recovered ${recovered} stalled job(s)`);
      const hourKey = new Date().toISOString().slice(0, 13);
      await enqueueJob(db, { kind: 'retention_sweep', idempotencyKey: `retention:${hourKey}` });
    } catch (error) {
      log.error('Maintenance loop error', { error: errorSummary(error) });
    }
    await sleep(60_000);
  }
}

async function main(): Promise<void> {
  log.info(`LeadFinder worker starting`, {
    workerId,
    env: env.APP_ENV,
    providerMode: env.PROVIDER_MODE,
    concurrency: env.WORKER_CONCURRENCY,
  });
  await db.query('select 1'); // readiness check
  const loops = Array.from({ length: env.WORKER_CONCURRENCY }, (_v, i) => workLoop(i));
  loops.push(maintenanceLoop());
  await Promise.all(loops);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`Received ${signal}; finishing current jobs...`);
    shuttingDown = true;
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}

main().catch((error) => {
  log.error('Worker crashed', { error: errorSummary(error) });
  process.exit(1);
});
