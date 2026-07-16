import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '@leadfinder/db/testing/harness';
import { searchConfigSchema, usdToMicro } from '@leadfinder/core';
import type { Db } from '../src/db';
import { claimJob, enqueueJob, failJob, type Job } from '../src/queue';
import { handleIngest } from '../src/pipeline/ingest';
import { handleNormalize } from '../src/pipeline/normalize';
import { handleReconcile } from '../src/pipeline/reconcile';
import { handleRunSearch } from '../src/pipeline/run-search';

/**
 * End-to-end fixture pipeline on real Postgres (PGlite):
 * queued run → provider start → poll → paginated ingest → normalize →
 * dedupe → contacts → reconcile → completed, with counts, ledger, and audit.
 */

const MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

let t: TestDb;
let db: Db;
let ownerId: string;
let orgId: string;
let runId: string;

const config = searchConfigSchema.parse({
  name: 'Fixture Plumbers',
  searchTerm: 'plumber',
  maxResults: 14,
  locations: [{ countryCode: 'US', city: 'Austin', region: 'Texas' }],
  decisionMakers: { enabled: true, maxContactsPerCompany: 1, verifyWorkEmail: true },
});

async function processQueue(maxJobs = 25): Promise<void> {
  for (let i = 0; i < maxJobs; i += 1) {
    let job = (await claimJob(db, 'test-worker')) as Job | null;
    if (!job) {
      // Delayed jobs (poll backoff) may not be eligible yet — wait for them.
      const pending = (
        await db.query(
          `select count(*)::int as n from public.provider_jobs where status = 'pending'`,
        )
      ).rows[0] as { n: number };
      if (pending.n === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
      job = (await claimJob(db, 'test-worker')) as Job | null;
      if (!job) continue;
    }
    try {
      switch (job.kind) {
        case 'run_search':
          await handleRunSearch(db, job, MASTER_KEY);
          break;
        case 'ingest_dataset':
          await handleIngest(db, job, MASTER_KEY);
          break;
        case 'normalize_run':
          await handleNormalize(db, job);
          break;
        case 'reconcile_costs':
          await handleReconcile(db, job, MASTER_KEY);
          break;
        default:
          break;
      }
      await db.query(`update public.provider_jobs set status = 'succeeded' where id = $1`, [
        job.id,
      ]);
    } catch (error) {
      await failJob(db, job, error);
      throw error;
    }
  }
}

beforeAll(async () => {
  t = await createTestDb();
  db = { query: (text, params) => t.service(text, params) };
  ownerId = await t.createUser('owner@pipeline.test');
  orgId = await t.createOrg('Pipeline Org', ownerId);

  const query = await t.service(
    `insert into public.search_queries (organization_id, name, config, created_by)
     values ($1, 'Fixture Plumbers', $2, $3) returning id`,
    [orgId, JSON.stringify(config), ownerId],
  );
  const run = await t.service(
    `insert into public.search_runs
       (organization_id, search_query_id, status, config_snapshot, provider, hard_cap_micro_usd,
        estimate_expected_micro_usd, confirmed_by, confirmed_at, idempotency_key, is_fixture, created_by)
     values ($1, $2, 'queued', $3, 'fixture', $4, $5, $6, now(), 'test-idem-1', true, $6)
     returning id`,
    [orgId, query.rows[0]!.id, JSON.stringify(config), usdToMicro(1), 0, ownerId],
  );
  runId = run.rows[0]!.id as string;

  await enqueueJob(db, {
    kind: 'run_search',
    orgId,
    runId,
    idempotencyKey: `start:${runId}`,
  });
  await processQueue();
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe('fixture pipeline end to end', () => {
  it('completes the run through the full state machine', async () => {
    const run = (await t.service(`select * from public.search_runs where id = $1`, [runId]))
      .rows[0]!;
    expect(run.status).toBe('completed');
    expect(run.provider_run_id).toBeTruthy();
    expect(run.cost_reconciled_at).toBeTruthy();
  });

  it('records stage history for observability', async () => {
    const stages = (
      await t.service(
        `select stage, status from public.search_run_stages where run_id = $1 order by started_at`,
        [runId],
      )
    ).rows.map((r) => r.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['starting', 'running', 'ingesting', 'normalizing', 'deduplicating']),
    );
  });

  it('ingested all fixture items as raw records with retention deadlines', async () => {
    const raw = (
      await t.service(
        `select count(*)::int as n, min(retention_until) as ret from public.provider_raw_records where run_id = $1`,
        [runId],
      )
    ).rows[0]!;
    expect(raw.n).toBe(14);
    expect(raw.ret).toBeTruthy();
  });

  it('normalizes with correct accept/duplicate/reject accounting', async () => {
    const run = (
      await t.service(
        `select accepted_count, duplicate_count, rejected_count, enriched_count, ingested_count
         from public.search_runs where id = $1`,
        [runId],
      )
    ).rows[0]!;
    // 14 items: 9 unique open businesses, 2 duplicates (placeId + domain/phone),
    // 2 closed (post-filtered), 1 malformed.
    expect(run.ingested_count).toBe(14);
    expect(run.accepted_count).toBe(9);
    expect(run.duplicate_count).toBe(2);
    expect(run.rejected_count).toBe(3);
    expect(run.enriched_count).toBe(4);
  });

  it('deduplicates by place id and by domain/phone', async () => {
    const companies = (
      await t.service(
        `select canonical_name from public.companies where organization_id = $1 and deleted_at is null`,
        [orgId],
      )
    ).rows.map((r) => r.canonical_name);
    expect(companies).toHaveLength(9);
    expect(companies.filter((n) => String(n).startsWith('BrightPipe'))).toHaveLength(1);
    expect(companies.filter((n) => String(n).startsWith('Hill Country'))).toHaveLength(1);
  });

  it('stores decision-makers with separated personal and company LinkedIn URLs', async () => {
    const contacts = (
      await t.service(
        `select full_name, work_email, work_email_status, personal_linkedin_url, company_linkedin_url
         from public.contacts where organization_id = $1 order by full_name`,
        [orgId],
      )
    ).rows;
    expect(contacts).toHaveLength(4);

    const maria = contacts.find((c) => c.full_name === 'Maria Delgado')!;
    expect(maria.work_email).toBe('maria.delgado@brightpipe.example');
    expect(maria.work_email_status).toBe('verified');
    expect(maria.personal_linkedin_url).toBe('https://www.linkedin.com/in/maria-delgado-fixture');
    expect(maria.company_linkedin_url).toBe('https://www.linkedin.com/company/brightpipe-plumbing');

    const james = contacts.find((c) => c.full_name === 'James Okafor')!;
    expect(james.work_email_status).toBe('catch_all');

    const priya = contacts.find((c) => c.full_name === 'Priya Natarajan')!;
    expect(priya.work_email).toBeNull();
    expect(priya.work_email_status).toBe('unavailable');
    expect(priya.personal_linkedin_url).toBeNull();
    expect(priya.company_linkedin_url).toBe('https://www.linkedin.com/company/barton-pipeworks');

    const dana = contacts.find((c) => c.full_name === 'Dana Whitfield')!;
    expect(dana.work_email_status).toBe('unverified'); // verification result: unknown
  });

  it('flags every record as fixture data', async () => {
    const counts = (
      await t.service(
        `select
           (select count(*)::int from public.companies where organization_id = $1 and is_fixture = false) as real_companies,
           (select count(*)::int from public.contacts where organization_id = $1 and is_fixture = false) as real_contacts`,
        [orgId],
      )
    ).rows[0]!;
    expect(counts.real_companies).toBe(0);
    expect(counts.real_contacts).toBe(0);
  });

  it('writes an idempotent usage ledger and cost reconciliation', async () => {
    const usage = (
      await t.service(
        `select feature, quantity::int as quantity from public.usage_events where run_id = $1 order by feature`,
        [runId],
      )
    ).rows;
    expect(usage.map((u) => u.feature)).toEqual([
      'companies_collected',
      'decision_makers_found',
      'provider_cost',
    ]);
    const ledger = (
      await t.service(
        `select actual_micro_usd::int as actual from public.cost_ledger where run_id = $1`,
        [runId],
      )
    ).rows[0]!;
    expect(ledger.actual).toBe(0); // fixture provider is free

    // Re-running reconcile must not duplicate ledger rows.
    await enqueueJob(db, {
      kind: 'reconcile_costs',
      orgId,
      runId,
      idempotencyKey: `reconcile2:${runId}`,
    });
    await processQueue();
    const after = (
      await t.service(`select count(*)::int as n from public.usage_events where run_id = $1`, [
        runId,
      ])
    ).rows[0]!;
    expect(after.n).toBe(3);
  });

  it('writes audit records for the run lifecycle', async () => {
    const actions = (
      await t.service(`select action from public.audit_logs where organization_id = $1`, [orgId])
    ).rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'run.provider_started',
        'run.ingested',
        'run.normalized',
        'run.reconciled',
      ]),
    );
  });

  it('provenance rows exist for merged duplicates too', async () => {
    const sources = (
      await t.service(`select count(*)::int as n from public.company_sources where run_id = $1`, [
        runId,
      ])
    ).rows[0]!;
    // 9 accepted + 2 merged duplicates, minus 1: the exact placeId duplicate is
    // the same provider record re-scraped in the same run, so provenance is
    // deduplicated by (org, provider, provider_record_id, run) by design.
    expect(sources.n).toBe(10);

    const mergedDup = (
      await t.service(
        `select count(*)::int as n from public.company_sources s
         join public.companies c on c.id = s.company_id
         where s.run_id = $1 and c.canonical_name = 'Hill Country Drain Experts'`,
        [runId],
      )
    ).rows[0]!;
    expect(mergedDup.n).toBe(2); // both locations' provenance attached to one company
  });
});
