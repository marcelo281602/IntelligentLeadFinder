# CLAUDE.md — LeadFinder repository rules

Authoritative product/security spec: `LEAD_FINDER_SAAS_PRODUCTION_MASTER_PROMPT.md`.
Decision log: `memory.md` (keep it updated). These rules override generic defaults.

## Architecture invariants

- npm-workspaces monorepo. Domain logic lives in `packages/core`; provider I/O in
  `packages/providers`; crypto/redaction in `packages/security`. The web app and
  worker stay thin.
- Migrations are append-only SQL in `supabase/migrations/`. Never edit an applied
  migration — add a new file. Every tenant table: `organization_id NOT NULL` + RLS.
- DB/RLS/pipeline tests run on PGlite (`packages/db/src/testing/harness.ts`) —
  no Docker on this machine. Keep the harness's auth shim in sync with policies.
- The worker claims `provider_jobs` with `FOR UPDATE SKIP LOCKED`. Every pipeline
  stage must stay idempotent and resumable from `search_runs.checkpoint`.
- Money is integer micro-USD everywhere (`usdToMicro`/`microToUsd`).
- Keep `packages/core/src/types.ts` enums in sync with the SQL enums.

## Hard rules (from the master prompt — do not relax)

1. Provider secrets: server-only, envelope-encrypted, never in logs/URLs/client
   code. Secret tables are deny-all under RLS.
2. No paid provider run without a validated hard cost cap sent to the provider.
3. No LinkedIn scraping (including via third-party actors). LinkedIn URLs come
   only from licensed provider data (Apify Business Leads) or manual entry.
4. Apollo stays feature-flagged off until a `commercial_use_approvals` row with
   documented approval exists.
5. Never fabricate company/contact data; keep email/phone verification states
   exactly as returned. Fixture data is always `is_fixture = true` and labeled.
6. Every mutation: auth → org membership → permission (`packages/core`
   permissions matrix) → zod validation → rate limit → audit log.
7. Ask before: remote pushes, deployments, live migrations, paid runs,
   credential rotation, exports of real personal data.

## Workflow

- After meaningful changes run: `npm run typecheck && npm run lint && npm run test`
  and, for web changes, `npm run build --workspace @leadfinder/web`.
- Invoke the `frontend-design` skill before writing new frontend surfaces.
- UI style: calm enterprise instrument — tokens in `apps/web/src/app/globals.css`
  (Bricolage Grotesque display, IBM Plex Sans body, IBM Plex Mono for money/ids,
  `#2f4f7d` primary, cyan accent). No dark sections, no neon, no `transition-all`.
- Pin dependency versions exactly; commit the lockfile.
