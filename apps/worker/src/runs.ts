import { assertTransition, type RunStatus } from '@leadfinder/core';
import type { Db } from './db';
import { one } from './db';

/** Search-run row subset used by the pipeline. */
export interface RunRow {
  id: string;
  organization_id: string;
  status: RunStatus;
  config_snapshot: Record<string, unknown>;
  provider: string;
  connection_id: string | null;
  provider_run_id: string | null;
  provider_dataset_id: string | null;
  rate_card_id: string | null;
  hard_cap_micro_usd: string | number | null;
  estimate_expected_micro_usd: string | number | null;
  checkpoint: Record<string, unknown>;
  is_fixture: boolean;
  created_by: string;
  discovered_count: number;
  ingested_count: number;
  accepted_count: number;
  duplicate_count: number;
  rejected_count: number;
  enriched_count: number;
  failed_count: number;
}

export async function getRun(db: Db, runId: string): Promise<RunRow | null> {
  return one<RunRow>(db, `select * from public.search_runs where id = $1`, [runId]);
}

/**
 * Validated state transition + stage bookkeeping, in one place. Throws on an
 * illegal transition so a buggy path can never corrupt run state.
 */
export async function transitionRun(
  db: Db,
  run: Pick<RunRow, 'id' | 'organization_id' | 'status'>,
  to: RunStatus,
  extra: { error?: string | null; stage?: string } = {},
): Promise<void> {
  assertTransition(run.status, to);
  await db.query(
    `update public.search_runs set
       status = $2::public.run_status,
       current_stage = coalesce($3, current_stage),
       error_summary = coalesce($4, error_summary),
       last_heartbeat_at = now(),
       started_at = case when $2 = 'starting' then now() else started_at end,
       completed_at = case when $2 in ('completed','partially_completed','cancelled','failed') then now() else completed_at end
     where id = $1`,
    [run.id, to, extra.stage ?? to, extra.error ?? null],
  );
  await db.query(
    `insert into public.search_run_stages (organization_id, run_id, stage, status)
     values ($1, $2, $3, 'running')`,
    [run.organization_id, run.id, extra.stage ?? to],
  );
  run.status = to;
}

export async function finishStage(
  db: Db,
  runId: string,
  stage: string,
  status: 'succeeded' | 'failed',
  error?: string,
): Promise<void> {
  await db.query(
    `update public.search_run_stages set status = $3, finished_at = now(), error = $4
     where id = (
       select id from public.search_run_stages
       where run_id = $1 and stage = $2 and status = 'running'
       order by started_at desc limit 1
     )`,
    [runId, stage, status, error ?? null],
  );
}

export async function heartbeatRun(db: Db, runId: string): Promise<void> {
  await db.query(`update public.search_runs set last_heartbeat_at = now() where id = $1`, [runId]);
}

export async function bumpCounts(
  db: Db,
  runId: string,
  deltas: Partial<
    Record<
      | 'discovered_count'
      | 'ingested_count'
      | 'accepted_count'
      | 'duplicate_count'
      | 'rejected_count'
      | 'enriched_count'
      | 'failed_count',
      number
    >
  >,
): Promise<void> {
  const entries = Object.entries(deltas).filter(([, v]) => v && v !== 0);
  if (entries.length === 0) return;
  const sets = entries.map(([col], i) => `${col} = ${col} + $${i + 2}`).join(', ');
  await db.query(`update public.search_runs set ${sets} where id = $1`, [
    runId,
    ...entries.map(([, v]) => v),
  ]);
}

export async function saveCheckpoint(
  db: Db,
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `update public.search_runs set checkpoint = checkpoint || $2::jsonb where id = $1`,
    [runId, JSON.stringify(patch)],
  );
}

export async function isCancellationRequested(db: Db, runId: string): Promise<boolean> {
  const row = await one<{ status: RunStatus }>(
    db,
    `select status from public.search_runs where id = $1`,
    [runId],
  );
  return row?.status === 'cancellation_requested';
}
