import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

/**
 * Development seed: demo user + organization + quota policy + fixture
 * provider connection. Idempotent — safe to re-run. Fixture data is always
 * flagged is_fixture and never mixed with real provider data.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
 * Never run against production.
 */
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@leadfinder.local';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'demo-password-change-me';

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!url || !serviceKey || !databaseUrl) {
    console.error(
      'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are required.',
    );
    process.exit(1);
  }
  if (process.env.APP_ENV === 'production') {
    console.error('Refusing to seed a production environment.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Demo auth user (email pre-confirmed for local development).
  let userId: string;
  const created = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Demo User' },
  });
  if (created.data.user) {
    userId = created.data.user.id;
    console.log(`Created demo user ${DEMO_EMAIL}`);
  } else {
    const list = await supabase.auth.admin.listUsers();
    const existing = list.data.users.find((u) => u.email === DEMO_EMAIL);
    if (!existing) throw created.error ?? new Error('Could not create or find demo user');
    userId = existing.id;
    console.log(`Demo user already exists: ${DEMO_EMAIL}`);
  }

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    // 2. Demo organization + owner membership.
    const org = await db.query(
      `insert into public.organizations (name, slug, default_country_code, created_by)
       values ('Demo Workspace', 'demo-workspace', 'US', $1)
       on conflict (slug) do update set updated_at = now()
       returning id`,
      [userId],
    );
    const orgId = org.rows[0].id as string;
    await db.query(
      `insert into public.organization_memberships (organization_id, user_id, role, can_export)
       values ($1, $2, 'owner', true)
       on conflict (organization_id, user_id) do nothing`,
      [orgId, userId],
    );
    await db.query(
      `update public.user_profiles set active_organization_id = $1 where id = $2`,
      [orgId, userId],
    );

    // 3. Sensible default quotas for local development.
    await db.query(
      `insert into public.quota_policies
         (organization_id, monthly_budget_micro_usd, per_run_cap_micro_usd, max_results_per_run, updated_by)
       values ($1, 100000000, 25000000, 1000, $2)
       on conflict (organization_id) do nothing`,
      [orgId, userId],
    );

    // 4. Fixture provider connection (no credential required, zero cost).
    await db.query(
      `insert into public.integration_connections
         (organization_id, provider, label, status, config, created_by, last_test_at, last_test_ok)
       values ($1, 'fixture', 'Fixture (test data)', 'connected',
               '{"actorId":"fixture-google-maps","planTier":"free"}', $2, now(), true)
       on conflict (organization_id, provider, label) do nothing`,
      [orgId, userId],
    );

    console.log('Seed complete.');
    console.log(`  Sign in with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.log(`  Organization: Demo Workspace (${orgId})`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
