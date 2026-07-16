# LeadFinder

Multi-tenant lead intelligence SaaS: collect business data from Google Maps via
bring-your-own-key providers (Apify primary), optionally enrich decision-makers,
review with deterministic deduplication, organize into lists, and export CSV/XLSX —
with hard cost caps, idempotent usage ledgers, RLS tenant isolation, and full audit
trails.

## Monorepo layout

| Path                 | Purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `apps/web`           | Next.js 15 dashboard + authenticated server actions/API                    |
| `apps/worker`        | Durable background worker (Postgres `SKIP LOCKED` queue)                   |
| `packages/config`    | Typed env parsing + centralized brand configuration                        |
| `packages/core`      | Domain models, run state machine, cost estimator, normalizers, dedupe      |
| `packages/security`  | Envelope encryption, redaction, signed expiring tokens                     |
| `packages/providers` | Provider adapters: Apify (contract-tested), fixture, gated stubs           |
| `packages/db`        | Migration runner, seed, PGlite test harness, RLS test suite                |
| `supabase/migrations`| SQL schema — 53 tables, RLS on every tenant table                          |
| `docs/`              | Architecture, security, deployment, and operations documentation           |

## Quick start (local)

Prerequisites: Node.js ≥ 20, a hosted Supabase project (free tier works — Docker is
NOT required; tests run on PGlite).

```bash
# 1. Install
npm install

# 2. Configure — copy and fill in Supabase values + generated secrets
cp .env.example .env
# APP_ENCRYPTION_KEY:  openssl rand -base64 32
# APP_SIGNING_SECRET:  openssl rand -base64 32

# 3. Apply migrations to your Supabase project
DATABASE_URL=postgres://... npm run db:migrate

# 4. Seed a demo user + workspace + fixture provider
npm run db:seed

# 5. Run (two terminals)
npm run dev          # web on http://localhost:3000
npm run dev:worker   # background worker
```

Sign in with the seeded demo user (`demo@leadfinder.local` / printed password),
open **Lead Finder**, pick the **Fixture (test data)** provider, and run the whole
flow — search → estimate → confirm cap → queue → ingest → dedupe → review →
list → export — with zero paid calls. Fixture records are always labeled
**Test data**.

Next.js reads env from `apps/web/.env.local`; the worker reads the repo-root
`.env`. Keeping a single root `.env` and symlinking `apps/web/.env.local` to it
also works.

## Commands

```bash
npm run typecheck   # tsc across all workspaces
npm run lint        # eslint (packages + web)
npm run test        # vitest everywhere, incl. PGlite migration/RLS/pipeline suites
npm run build       # production build
npm run db:migrate  # apply supabase/migrations to DATABASE_URL
npm run db:seed     # local/dev seed (refuses production)
npm run format:fix  # prettier
```

## Non-negotiables baked in

- Provider credentials are entered only in **Settings → Integrations**, tested,
  envelope-encrypted (AES-256-GCM), and never returned or logged.
- Every paid run requires a user-confirmed **hard cost cap**, forwarded to the
  provider (`maxTotalChargeUsd`) — no cap, no run.
- Organization isolation via server checks **and** Postgres RLS (tested).
- Company email ≠ decision-maker email; personal LinkedIn ≠ company LinkedIn;
  verification states are exactly what the provider reported. Missing data
  stays missing.
- No LinkedIn scraping. No automated outreach. Apollo is disabled until a
  documented commercial-use approval exists.

See `docs/` for architecture, security, deployment, and operations details, and
`memory.md` for the running decision log.
