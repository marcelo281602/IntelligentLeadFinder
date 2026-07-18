import { serverEnv } from '@leadfinder/config';
import { createPool } from '@leadfinder/db';
import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import { errorSummary, log } from './logger';
import { processQueueTick, runMaintenance } from './engine';

/**
 * LeadFinder standalone worker: a long-running process that drains the job
 * queue continuously. Optional — the same engine also runs serverless via the
 * Vercel Cron route (`/api/cron/worker`). Safe to run multiple instances:
 * claims use SKIP LOCKED, every stage is idempotent, stalled jobs recover by
 * heartbeat.
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function workLoop(slot: number): Promise<void> {
  while (!shuttingDown) {
    try {
      const { processed } = await processQueueTick(db, env, {
        workerId: `${workerId}#${slot}`,
        budgetMs: 25_000,
        maxJobs: 50,
      });
      if (processed === 0) await sleep(env.WORKER_POLL_INTERVAL_MS);
    } catch (error) {
      log.error('Work loop error', { error: errorSummary(error) });
      await sleep(env.WORKER_POLL_INTERVAL_MS);
    }
  }
}

async function maintenanceLoop(): Promise<void> {
  while (!shuttingDown) {
    try {
      await runMaintenance(db);
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
