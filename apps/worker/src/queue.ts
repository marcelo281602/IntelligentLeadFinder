import type { JobKind } from '@leadfinder/core';
import type { Db } from './db';
import { errorSummary, log } from './logger';

/**
 * Durable Postgres-backed job queue over public.provider_jobs.
 * Claims use FOR UPDATE SKIP LOCKED; retries use exponential backoff with
 * jitter; exhausted jobs move to dead_letter. Portable — no queue vendor.
 */

export interface Job {
  id: string;
  organization_id: string | null;
  run_id: string | null;
  export_id: string | null;
  kind: JobKind;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueueJob(
  db: Db,
  params: {
    kind: JobKind;
    orgId?: string | null;
    runId?: string | null;
    exportId?: string | null;
    payload?: Record<string, unknown>;
    runAfterMs?: number;
    idempotencyKey?: string | null;
    priority?: number;
    maxAttempts?: number;
  },
): Promise<string | null> {
  const { rows } = await db.query(
    `insert into public.provider_jobs
       (kind, organization_id, run_id, export_id, payload, run_after, idempotency_key, priority, max_attempts)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' milliseconds')::interval, $7, $8, $9)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      params.kind,
      params.orgId ?? null,
      params.runId ?? null,
      params.exportId ?? null,
      JSON.stringify(params.payload ?? {}),
      String(params.runAfterMs ?? 0),
      params.idempotencyKey ?? null,
      params.priority ?? 100,
      params.maxAttempts ?? 5,
    ],
  );
  return (rows[0]?.id as string | undefined) ?? null;
}

export async function claimJob(db: Db, workerId: string): Promise<Job | null> {
  const { rows } = await db.query(
    `update public.provider_jobs set
       status = 'running',
       locked_by = $1,
       locked_at = now(),
       heartbeat_at = now(),
       attempts = attempts + 1
     where id = (
       select id from public.provider_jobs
       where status = 'pending' and run_after <= now()
       order by priority asc, run_after asc
       limit 1
       for update skip locked
     )
     returning id, organization_id, run_id, export_id, kind, payload, attempts, max_attempts`,
    [workerId],
  );
  return (rows[0] as unknown as Job | undefined) ?? null;
}

export async function heartbeatJob(db: Db, jobId: string): Promise<void> {
  await db.query(`update public.provider_jobs set heartbeat_at = now() where id = $1`, [jobId]);
}

export async function completeJob(db: Db, jobId: string): Promise<void> {
  await db.query(
    `update public.provider_jobs set status = 'succeeded', locked_by = null, last_error = null where id = $1`,
    [jobId],
  );
}

/** Reschedule a running job (e.g. provider still working — poll again later). */
export async function rescheduleJob(db: Db, jobId: string, delayMs: number): Promise<void> {
  await db.query(
    `update public.provider_jobs set
       status = 'pending',
       locked_by = null,
       attempts = attempts - 1, -- polling again is not a failure
       run_after = now() + ($2 || ' milliseconds')::interval
     where id = $1`,
    [jobId, String(delayMs)],
  );
}

export function backoffMs(attempts: number): number {
  const base = Math.min(60_000 * 2 ** (attempts - 1), 15 * 60_000);
  const jitter = Math.floor(Math.random() * 0.3 * base);
  return base + jitter;
}

export async function failJob(
  db: Db,
  job: Job,
  error: unknown,
): Promise<'retrying' | 'dead_letter'> {
  const summary = errorSummary(error);
  if (job.attempts >= job.max_attempts) {
    await db.query(
      `update public.provider_jobs set status = 'dead_letter', locked_by = null, last_error = $2 where id = $1`,
      [job.id, summary],
    );
    log.error('Job moved to dead letter', { jobId: job.id, jobKind: job.kind, error: summary });
    return 'dead_letter';
  }
  await db.query(
    `update public.provider_jobs set
       status = 'pending',
       locked_by = null,
       last_error = $2,
       run_after = now() + ($3 || ' milliseconds')::interval
     where id = $1`,
    [job.id, summary, String(backoffMs(job.attempts))],
  );
  return 'retrying';
}

/** Requeue jobs whose worker died (stale heartbeat while running). */
export async function recoverStalledJobs(db: Db, staleAfterMs = 5 * 60_000): Promise<number> {
  const { rows } = await db.query(
    `update public.provider_jobs set status = 'pending', locked_by = null
     where status = 'running' and heartbeat_at < now() - ($1 || ' milliseconds')::interval
     returning id`,
    [String(staleAfterMs)],
  );
  return rows.length;
}
