import pg from 'pg';
import { encryptSecret, secretFingerprint } from '@leadfinder/security';
import { ApifyGoogleMapsAdapter } from '@leadfinder/providers';

/**
 * CLI: connect an Apify token to a workspace from the command line —
 * identical flow to Settings → Integrations (test first, envelope-encrypt,
 * store, audit). Useful for local/dev setup.
 *
 * Usage:
 *   APIFY_TOKEN=... [APIFY_PLAN_TIER=starter] [ORG_SLUG=demo-workspace] \
 *     npm run connect:apify --workspace @leadfinder/db
 *
 * Requires DATABASE_URL and APP_ENCRYPTION_KEY. The token is read from the
 * environment only and never printed or logged.
 */
async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  const databaseUrl = process.env.DATABASE_URL;
  const masterKey = process.env.APP_ENCRYPTION_KEY;
  const planTier = process.env.APIFY_PLAN_TIER ?? 'starter';
  const orgSlug = process.env.ORG_SLUG ?? 'demo-workspace';
  if (!token || !databaseUrl || !masterKey) {
    console.error('APIFY_TOKEN, DATABASE_URL and APP_ENCRYPTION_KEY are required.');
    process.exit(1);
  }
  if (!['free', 'starter', 'scale', 'business'].includes(planTier)) {
    console.error('APIFY_PLAN_TIER must be free|starter|scale|business.');
    process.exit(1);
  }

  // 1. Test before storing — never persist a credential that does not work.
  const adapter = new ApifyGoogleMapsAdapter();
  const test = await adapter.testConnection({ token });
  if (!test.ok) {
    console.error(`Apify rejected the token: ${test.error ?? 'test failed'}`);
    process.exit(1);
  }
  console.log(
    `Token OK — account "${test.accountLabel}"${test.planHint ? ` (plan: ${test.planHint})` : ''}, ${test.latencyMs}ms`,
  );

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const org = await db.query(
      `select o.id, m.user_id as owner_id
       from public.organizations o
       join public.organization_memberships m on m.organization_id = o.id and m.role = 'owner'
       where o.slug = $1 limit 1`,
      [orgSlug],
    );
    if (org.rows.length === 0) {
      console.error(`No organization with slug "${orgSlug}". Run npm run db:seed first.`);
      process.exit(1);
    }
    const { id: orgId, owner_id: ownerId } = org.rows[0] as { id: string; owner_id: string };

    // 2. Encrypt and store (new connection or rotate the existing one).
    const envelope = encryptSecret(token, masterKey);
    const fingerprint = secretFingerprint(token);

    const existing = await db.query(
      `select id from public.integration_connections
       where organization_id = $1 and provider = 'apify' and label = 'Default' and deleted_at is null`,
      [orgId],
    );

    let connectionId: string;
    if (existing.rows.length > 0) {
      connectionId = (existing.rows[0] as { id: string }).id;
    } else {
      const inserted = await db.query(
        `insert into public.integration_connections
           (organization_id, provider, label, status, config, secret_fingerprint, created_by, last_test_at, last_test_ok)
         values ($1, 'apify', 'Default', 'connected', $2, $3, $4, now(), true)
         returning id`,
        [
          orgId,
          JSON.stringify({ actorId: 'compass/crawler-google-places', planTier }),
          fingerprint,
          ownerId,
        ],
      );
      connectionId = (inserted.rows[0] as { id: string }).id;
    }

    const versionRow = await db.query(
      `select coalesce(max(version), 0) + 1 as v from public.integration_secret_versions where connection_id = $1`,
      [connectionId],
    );
    const version = Number((versionRow.rows[0] as { v: string }).v);
    const secret = await db.query(
      `insert into public.integration_secret_versions
         (organization_id, connection_id, version, envelope, created_by)
       values ($1, $2, $3, $4, $5) returning id`,
      [orgId, connectionId, version, envelope, ownerId],
    );
    await db.query(
      `update public.integration_connections set
         active_secret_version_id = $2, secret_fingerprint = $3, status = 'connected',
         config = $4, last_test_at = now(), last_test_ok = true, last_error = null
       where id = $1`,
      [
        connectionId,
        (secret.rows[0] as { id: string }).id,
        fingerprint,
        JSON.stringify({ actorId: 'compass/crawler-google-places', planTier }),
      ],
    );
    await db.query(
      `update public.integration_secret_versions set revoked_at = now()
       where connection_id = $1 and version < $2 and revoked_at is null`,
      [connectionId, version],
    );
    await db.query(
      `insert into public.integration_health_checks (organization_id, connection_id, ok, latency_ms, detail)
       values ($1, $2, true, $3, $4)`,
      [orgId, connectionId, test.latencyMs, `Connected as ${test.accountLabel ?? 'Apify account'} (CLI)`],
    );
    await db.query(
      `insert into public.audit_logs (organization_id, actor_user_id, actor_type, action, entity_kind, entity_id, details)
       values ($1, $2, 'user', $3, 'integration_connection', $4, $5)`,
      [
        orgId,
        ownerId,
        version === 1 ? 'integration.connected' : 'integration.credential_rotated',
        connectionId,
        JSON.stringify({ provider: 'apify', planTier, via: 'cli', version }),
      ],
    );

    console.log(
      `Apify connected to "${orgSlug}" (connection ${connectionId.slice(0, 8)}…, secret v${version}, fp ${fingerprint}).`,
    );
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
