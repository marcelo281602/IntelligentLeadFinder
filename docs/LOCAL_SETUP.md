# Local setup

Verified on macOS with Node 24 / npm 11. Docker is **not** required — database
tests run on PGlite; the app runtime uses a hosted Supabase project.

## 1. Prerequisites

- Node.js ≥ 20
- A Supabase project (free tier): https://supabase.com/dashboard → New project.
  Collect: Project URL, anon key, service-role key (Settings → API), and the
  direct Postgres connection string (Settings → Database).

## 2. Install & configure

```bash
npm install
cp .env.example .env
```

Fill `.env`:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- `APP_ENCRYPTION_KEY` → `openssl rand -base64 32`
- `APP_SIGNING_SECRET` → `openssl rand -base64 32`

Next.js loads env from `apps/web/.env.local`:

```bash
ln -s ../../.env apps/web/.env.local
```

In the Supabase dashboard set Auth → URL Configuration → Site URL to
`http://localhost:3000` and add `http://localhost:3000/auth/callback` to the
redirect list.

## 3. Migrate & seed

```bash
npm run db:migrate    # applies supabase/migrations in order, tracked in schema_migrations
npm run db:seed       # demo user + workspace + quotas + fixture provider (refuses APP_ENV=production)
```

Alternative for migrations: `supabase link --project-ref <ref> && supabase db push`.

## 4. Run

```bash
npm run dev           # web → http://localhost:3000
npm run dev:worker    # worker (separate terminal; requires DATABASE_URL)
```

Health check: `curl http://localhost:3000/api/health`.

## 5. Fixture mode end-to-end (no paid calls)

Sign in as the seeded demo user → Lead Finder → provider “Fixture (test
data)” → any search term/location → Review & confirm run → confirm the $0 cap.
Watch the run page progress through ingest/normalize/dedupe (14 raw items → 9
companies, 2 merged duplicates, 3 rejected, 4 decision-makers), then add
records to a list and export CSV/XLSX. Everything is labeled **Test data**.

## 6. Real provider smoke mode (requires approval)

Needs your Apify token connected in Integrations. Keep `maxResults ≤ 10`, cap
≤ $0.50, reviews/images off. This is the gate for calling the Apify
integration production-ready.

## 7. Tests

```bash
npm run test       # all suites, including PGlite migration/RLS/pipeline
npm run test:db    # just the database/RLS suite
```
