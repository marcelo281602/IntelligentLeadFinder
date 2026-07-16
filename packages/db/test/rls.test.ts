import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../src/testing/harness';

/**
 * RLS / tenant-isolation suite. Runs the real migrations on PGlite and
 * exercises policies as the non-superuser `authenticated` role — the same
 * defense-in-depth layer hosted Supabase enforces.
 */

let t: TestDb;
let aliceId: string; // owner of org A
let bobId: string; // owner of org B
let carolId: string; // researcher in org A
let viewerId: string; // viewer in org A
let orgA: string;
let orgB: string;
let companyA: string;
let runA: string;

beforeAll(async () => {
  t = await createTestDb();
  aliceId = await t.createUser('alice@a.test');
  bobId = await t.createUser('bob@b.test');
  carolId = await t.createUser('carol@a.test');
  viewerId = await t.createUser('viewer@a.test');
  orgA = await t.createOrg('Org A', aliceId);
  orgB = await t.createOrg('Org B', bobId);
  await t.addMember(orgA, carolId, 'researcher');
  await t.addMember(orgA, viewerId, 'viewer');

  const company = await t.service(
    `insert into public.companies (organization_id, canonical_name, normalized_name, google_place_id)
     values ($1, 'Acme LLC', 'acme', 'place-123') returning id`,
    [orgA],
  );
  companyA = company.rows[0]!.id as string;

  const query = await t.service(
    `insert into public.search_queries (organization_id, name, config, created_by)
     values ($1, 'Plumbers Berlin', '{}'::jsonb, $2) returning id`,
    [orgA, aliceId],
  );
  const run = await t.service(
    `insert into public.search_runs (organization_id, search_query_id, config_snapshot, provider, created_by, status)
     values ($1, $2, '{}'::jsonb, 'fixture', $3, 'draft') returning id`,
    [orgA, query.rows[0]!.id, aliceId],
  );
  runA = run.rows[0]!.id as string;
}, 120_000);

afterAll(async () => {
  await t.close();
});

describe('cross-tenant isolation', () => {
  it('members read their own org companies', async () => {
    const rows = await t.as(aliceId, `select id from public.companies`);
    expect(rows.rows).toHaveLength(1);
  });

  it('denies reading another org’s companies', async () => {
    const rows = await t.as(bobId, `select id from public.companies`);
    expect(rows.rows).toHaveLength(0);
  });

  it('denies reading another org’s companies even with a known id (IDOR)', async () => {
    const rows = await t.as(bobId, `select id from public.companies where id = $1`, [companyA]);
    expect(rows.rows).toHaveLength(0);
  });

  it('denies reading another org’s search runs by provider job knowledge', async () => {
    const rows = await t.as(bobId, `select id from public.search_runs where id = $1`, [runA]);
    expect(rows.rows).toHaveLength(0);
  });

  it('denies cross-tenant company updates', async () => {
    await t.as(bobId, `update public.companies set canonical_name = 'HACKED' where id = $1`, [
      companyA,
    ]);
    const check = await t.service(`select canonical_name from public.companies where id = $1`, [
      companyA,
    ]);
    expect(check.rows[0]!.canonical_name).toBe('Acme LLC');
  });

  it('denies cross-tenant inserts with a foreign organization_id', async () => {
    await expect(
      t.as(
        bobId,
        `insert into public.search_queries (organization_id, name, config, created_by)
         values ($1, 'sneaky', '{}'::jsonb, $2)`,
        [orgA, bobId],
      ),
    ).rejects.toThrow();
  });

  it('unauthenticated sessions see nothing', async () => {
    await t.db.exec(`set role anon;`);
    try {
      const rows = (await t.db.query(`select id from public.companies`)) as {
        rows: unknown[];
      };
      expect(rows.rows).toHaveLength(0);
    } finally {
      await t.db.exec(`reset role;`);
    }
  });
});

describe('secret protection', () => {
  it('integration_secret_versions is invisible even to the org owner', async () => {
    const conn = await t.service(
      `insert into public.integration_connections (organization_id, provider, label, created_by)
       values ($1, 'apify', 'Main', $2) returning id`,
      [orgA, aliceId],
    );
    await t.service(
      `insert into public.integration_secret_versions (organization_id, connection_id, version, envelope, created_by)
       values ($1, $2, 1, '{"v":1,"kek":"primary","dek":"x","data":"y"}', $3)`,
      [orgA, conn.rows[0]!.id, aliceId],
    );
    const rows = await t.as(aliceId, `select * from public.integration_secret_versions`);
    expect(rows.rows).toHaveLength(0);
  });

  it('provider_jobs (queue) is invisible to all clients', async () => {
    await t.service(
      `insert into public.provider_jobs (organization_id, kind, payload) values ($1, 'run_search', '{}')`,
      [orgA],
    );
    const rows = await t.as(aliceId, `select * from public.provider_jobs`);
    expect(rows.rows).toHaveLength(0);
  });

  it('webhook inbox is invisible to all clients', async () => {
    await t.service(
      `insert into public.provider_webhook_inbox (provider, payload, dedupe_key)
       values ('apify', '{}'::jsonb, 'evt-1')`,
    );
    const rows = await t.as(aliceId, `select * from public.provider_webhook_inbox`);
    expect(rows.rows).toHaveLength(0);
  });
});

describe('role boundaries', () => {
  it('researcher can create search queries', async () => {
    const rows = await t.as(
      carolId,
      `insert into public.search_queries (organization_id, name, config, created_by)
       values ($1, 'Carol search', '{}'::jsonb, $2) returning id`,
      [orgA, carolId],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('viewer cannot create search queries', async () => {
    await expect(
      t.as(
        viewerId,
        `insert into public.search_queries (organization_id, name, config, created_by)
         values ($1, 'Viewer search', '{}'::jsonb, $2)`,
        [orgA, viewerId],
      ),
    ).rejects.toThrow();
  });

  it('viewer cannot update companies', async () => {
    await t.as(viewerId, `update public.companies set canonical_name = 'nope' where id = $1`, [
      companyA,
    ]);
    const check = await t.service(`select canonical_name from public.companies where id = $1`, [
      companyA,
    ]);
    expect(check.rows[0]!.canonical_name).toBe('Acme LLC');
  });

  it('researcher cannot manage integrations', async () => {
    await expect(
      t.as(
        carolId,
        `insert into public.integration_connections (organization_id, provider, label, created_by)
         values ($1, 'apify', 'Carol conn', $2)`,
        [orgA, carolId],
      ),
    ).rejects.toThrow();
  });

  it('members cannot escalate their own role', async () => {
    await t.as(
      carolId,
      `update public.organization_memberships set role = 'owner' where user_id = $1`,
      [carolId],
    );
    const check = await t.service(
      `select role from public.organization_memberships where user_id = $1 and organization_id = $2`,
      [carolId, orgA],
    );
    expect(check.rows[0]!.role).toBe('researcher');
  });

  it('runs cannot be inserted with a non-draft status from the client', async () => {
    const query = await t.as(
      carolId,
      `select id from public.search_queries where created_by = $1 limit 1`,
      [carolId],
    );
    await expect(
      t.as(
        carolId,
        `insert into public.search_runs (organization_id, search_query_id, config_snapshot, provider, created_by, status)
         values ($1, $2, '{}'::jsonb, 'fixture', $3, 'queued')`,
        [orgA, query.rows[0]!.id, carolId],
      ),
    ).rejects.toThrow();
  });
});

describe('audit log append-only', () => {
  it('owner reads own-org audit logs; researcher cannot', async () => {
    await t.service(
      `insert into public.audit_logs (organization_id, actor_user_id, action) values ($1, $2, 'test.event')`,
      [orgA, aliceId],
    );
    const asOwner = await t.as(aliceId, `select action from public.audit_logs`);
    expect(asOwner.rows.length).toBeGreaterThan(0);
    const asResearcher = await t.as(carolId, `select action from public.audit_logs`);
    expect(asResearcher.rows).toHaveLength(0);
  });

  it('clients cannot insert, update, or delete audit rows', async () => {
    await expect(
      t.as(
        aliceId,
        `insert into public.audit_logs (organization_id, action) values ($1, 'forged')`,
        [orgA],
      ),
    ).rejects.toThrow();
    const before = await t.service(`select count(*)::int as n from public.audit_logs`);
    await t.as(aliceId, `delete from public.audit_logs`);
    const after = await t.service(`select count(*)::int as n from public.audit_logs`);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});

describe('data constraints', () => {
  it('google place id is unique per org but reusable across orgs', async () => {
    await expect(
      t.service(
        `insert into public.companies (organization_id, canonical_name, normalized_name, google_place_id)
         values ($1, 'Dup', 'dup', 'place-123')`,
        [orgA],
      ),
    ).rejects.toThrow();
    const ok = await t.service(
      `insert into public.companies (organization_id, canonical_name, normalized_name, google_place_id)
       values ($1, 'Other org same place', 'other', 'place-123') returning id`,
      [orgB],
    );
    expect(ok.rows).toHaveLength(1);
  });

  it('usage ledger rejects duplicate idempotency keys (no double-charge)', async () => {
    await t.service(
      `insert into public.usage_events (organization_id, feature, cost_micro_usd, idempotency_key)
       values ($1, 'place_scraped', 3000, 'run-1:reconcile')`,
      [orgA],
    );
    await expect(
      t.service(
        `insert into public.usage_events (organization_id, feature, cost_micro_usd, idempotency_key)
         values ($1, 'place_scraped', 3000, 'run-1:reconcile')`,
        [orgA],
      ),
    ).rejects.toThrow();
  });

  it('cost ledger is one row per run', async () => {
    await t.service(
      `insert into public.cost_ledger (organization_id, run_id, provider, estimated_micro_usd)
       values ($1, $2, 'fixture', 1000)`,
      [orgA, runA],
    );
    await expect(
      t.service(
        `insert into public.cost_ledger (organization_id, run_id, provider, estimated_micro_usd)
         values ($1, $2, 'fixture', 999)`,
        [orgA, runA],
      ),
    ).rejects.toThrow();
  });

  it('hard cap must be positive when present', async () => {
    await expect(
      t.service(`update public.search_runs set hard_cap_micro_usd = 0 where id = $1`, [runA]),
    ).rejects.toThrow();
  });

  it('rate cards are readable by authenticated users', async () => {
    const rows = await t.as(aliceId, `select provider, plan_tier from public.provider_rate_cards`);
    expect(rows.rows.length).toBeGreaterThanOrEqual(6);
  });

  it('apollo stays feature-flagged off by default', async () => {
    const rows = await t.as(
      aliceId,
      `select enabled from public.feature_flags where key = 'provider_apollo' and organization_id is null`,
    );
    expect(rows.rows[0]!.enabled).toBe(false);
  });
});
