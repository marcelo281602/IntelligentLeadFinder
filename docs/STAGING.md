# Staging environment

Staging mirrors production topology with fully separate resources. Never share
credentials, databases, or provider keys across environments.

## Components

| Component  | Staging resource                                              |
| ---------- | -------------------------------------------------------------- |
| Web        | Vercel project (staging) or preview deployments without prod secrets |
| Worker     | One small always-on Node host (Railway/Render/Fly) running `npm run start --workspace @leadfinder/worker` |
| Database   | Dedicated Supabase project (staging)                            |
| Provider   | User's Apify token on a low-budget account; fixture provider for most testing |

## Setup order

1. Create the staging Supabase project; run `npm run db:migrate` against its
   `DATABASE_URL`; run `npm run db:seed` (allowed: APP_ENV=staging).
2. Set env vars from `.env.example` on both web and worker hosts with
   `APP_ENV=staging`, fresh `APP_ENCRYPTION_KEY`/`APP_SIGNING_SECRET`
   (never reuse production values), and `NEXT_PUBLIC_APP_URL` set to the
   staging domain (webhooks + auth callbacks depend on it).
3. Supabase Auth: set staging Site URL and `/auth/callback` redirect.
4. Deploy web + worker; check `GET /api/health`.
5. Run the fixture E2E checklist (docs/TEST_PLAN.md).
6. With explicit approval: run the ≤10-record Apify smoke test — staging is
   the designated place for it.

## Promotion rule

Changes reach production only after: green CI, fixture E2E on staging, and —
for provider-touching changes — a staging smoke test. Migrations are applied
to staging first, always.
