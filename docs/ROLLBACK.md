# Rollback

## Web (Vercel)

Instant: promote the previous deployment in the Vercel dashboard (or
`vercel rollback`). Server actions are versioned with the deployment, so a web
rollback is self-contained.

## Worker

Redeploy the previous image/commit. Safe at any time: jobs are idempotent and
checkpointed; a killed worker's jobs are recovered by the stale-heartbeat
sweep and resume where they left off. To pause all processing without a
rollback: scale the worker to zero — runs stay queued.

## Database

Migrations are additive-only; **roll forward** with a new migration rather
than down-migrating. Old application code keeps working against a newer
schema (columns are added, not repurposed). Catastrophic recovery: Supabase
PITR restore to a new project → repoint `DATABASE_URL`/keys → verify → cut
over (documented RTO target: < 1 h; RPO: PITR granularity, ~2 min on Pro).

## Provider jobs during an incident

- Pause new paid runs: set global feature flag `provider_apify` to false
  (blocks new confirmations; running jobs finish under their approved caps).
- Cancel a specific run: run page → Cancel (aborts provider-side, keeps
  partial data).
- Poison job: it dead-letters after 5 attempts and flags the run failed;
  requeue by setting the job row back to `pending` after the fix.

## Credential compromise

1. Rotate the provider token in Settings → Integrations (re-auth required) —
   old secret versions are revoked immediately.
2. If `APP_ENCRYPTION_KEY` leaks: generate a new key, decrypt-re-encrypt all
   active `integration_secret_versions` envelopes with a one-off script, then
   ask every org to rotate provider tokens as defense in depth.
3. If `SUPABASE_SERVICE_ROLE_KEY` leaks: regenerate in Supabase dashboard,
   update web+worker env, redeploy — old key dies instantly.

## Feature flags as kill switches

`provider_*`, `destinations_*`, `outreach_module` rows in `feature_flags`
(global, `organization_id IS NULL`) can disable functionality without deploys.

## Incident communication

See INCIDENT_RESPONSE.md — rollback decisions and timings are logged in the
incident record and, where tenants are affected, in-app notifications are
posted.
