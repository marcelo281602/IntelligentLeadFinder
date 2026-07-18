# Production deployment

**Do not execute without explicit approval.** This document is the plan.

## Topology

- **Web**: Vercel (`apps/web`; root directory = repo root, build command
  `npm run build --workspace @leadfinder/web`, output `apps/web/.next`).
- **Background jobs — two interchangeable options (same engine):**
  1. **Serverless (default, no extra host):** the `/api/cron/worker` route runs
     the job engine on a bounded per-invocation budget. Trigger it every minute.
     On Vercel **Pro**, use native cron (`vercel.json` → `* * * * *`). On
     **Hobby** (native cron is daily-only, functions cap ~10s), trigger it from
     **Supabase pg_cron + pg_net** instead: `npm run cron:setup --workspace
     @leadfinder/db` (reads `CRON_SECRET` + `CRON_TARGET_URL`). `vercel.json`
     keeps a daily cron as a backstop.
  2. **Standalone worker (for heavy/low-latency loads):** any always-on Node ≥ 20
     host, `npm run start --workspace @leadfinder/worker`. Same engine, continuous.
     Both are safe together — the queue is SKIP-LOCKED and idempotent.
- **Database/Auth**: Supabase production project (Pro tier for PITR backups).
  **Serverless DB connection MUST use the transaction pooler** (IPv4):
  `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
  The direct `db.<ref>.supabase.co:5432` host is IPv6-only and unreachable from
  Vercel serverless (ENOTFOUND). Migrations from a machine with IPv6 may keep
  the direct URL.
- **Export storage**: Supabase Storage private bucket `exports` (auto-created).
  Files are served only via 60-second signed URLs. No local disk in production.
- **CRON_SECRET**: gates `/api/cron/worker` (Bearer). Required in production.

## Environment variables

Web (Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, `APP_SIGNING_SECRET`,
`NEXT_PUBLIC_APP_URL` (https canonical domain), `APP_ENV=production`.
Worker adds: `DATABASE_URL` (pooled connection string),
`WORKER_CONCURRENCY`, `EXPORT_STORAGE_DIR` (until object storage lands).
Generate fresh 32-byte keys for production; never copy from staging.

## Deploy sequence

1. Freeze: green CI on the release commit; staging verified per docs/STAGING.md.
2. **Migrations first**: `DATABASE_URL=<prod> npm run db:migrate` (additive-only
   migrations make old code safe against the new schema).
3. Deploy worker (drains gracefully on SIGTERM; new instance resumes from
   checkpoints).
4. Deploy web on Vercel.
5. Supabase Auth: production Site URL + `/auth/callback` redirect; enable MFA
   options; review email templates and SMTP sender.
6. Post-deploy smoke: `/api/health` 200; sign-in; fixture run end-to-end;
   export download; audit entries present.
7. Enable monitoring/alerts (see OPERATIONS_RUNBOOK.md) and verify backup
   schedule (PITR) is active.

## DNS / domains

Point the canonical domain at Vercel; set `NEXT_PUBLIC_APP_URL` to it before
the first paid run (Apify webhook URLs embed it). HSTS via Vercel defaults.

## Callbacks

No provider-side registration needed: webhook URLs are generated per run as
`https://<domain>/api/webhooks/apify/<token>` and passed at run start.

## Never in production

`npm run db:seed` refuses `APP_ENV=production`. Preview deployments must not
receive production secrets.
