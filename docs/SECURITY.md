# Security

Target: OWASP ASVS Level 2 baseline with stricter controls on secrets,
multi-tenancy, paid actions, exports, and personal data ("Tier 3" internal
target — not a certification claim).

## Authentication & sessions

Supabase Auth (email/password, email verification, password reset) with
HttpOnly SameSite cookies via `@supabase/ssr`; middleware refreshes sessions
and gates all non-public routes. Rate limits on sign-in/up/reset. Password
re-authentication is required for: raising cost limits, rotating credentials,
disconnecting a provider.

## Authorization & tenant isolation

- Server-side: every mutation runs `requirePermission()` against the role
  matrix in `packages/core/src/permissions.ts`. Active org is derived from
  verified membership — never from client-supplied ids.
- Database: RLS on all tenant tables using SECURITY DEFINER membership helpers
  (`is_org_member`, `has_org_role`). Deny-by-default; client-invisible tables
  (secrets, job queue, webhook inbox, dedupe keys) simply have no policies.
- Tested: cross-tenant read/write denial, IDOR by known id, role escalation,
  non-draft run insertion, secret invisibility — `packages/db/test/rls.test.ts`
  runs the real migrations on PGlite as the non-superuser `authenticated` role.

## Secrets

- Provider tokens: envelope encryption (AES-256-GCM; per-secret DEK wrapped by
  `APP_ENCRYPTION_KEY`), stored in a deny-all table, decrypted only in worker /
  privileged server memory. UI shows a SHA-256 fingerprint prefix only.
- Tokens travel in `Authorization` headers, never query strings.
- Logs pass through `redactObject/redactText` (key patterns, bearer tokens,
  Apify token shapes, JWTs, sensitive URL params).
- `SUPABASE_SERVICE_ROLE_KEY` and `APP_*` secrets are server-only; `.env*` is
  gitignored; `.env.example` contains placeholders only.

## API & web

Strict zod schemas on every boundary; per-user/org in-memory rate limits on
mutations (production hardening: move to Postgres/KV — known limitation);
security headers + strict CSP (no external scripts, frame-ancestors none,
form-action self) in `next.config.ts`; server actions are origin-checked by
Next.js (CSRF); no open redirects (`next` params validated to relative paths);
no dynamic code execution; parameterized SQL everywhere.

## Webhooks

Persist-first inbox with unique dedupe key (replay-safe), 64 KB body cap,
per-IP rate limit, high-entropy URL token compared by hash, run-id
cross-check, and — decisively — provider state is always re-fetched from the
authenticated API before any processing.

## Exports & personal data

Server-side selection snapshot + permission check; formula-injection escaping
in CSV and XLSX; personal-data acknowledgement gate; signed 15-minute download
tokens (HMAC-SHA256, purpose-bound) on 24-hour-expiring exports; files purged
after 7 days; generation, link issuance, and downloads audit-logged.

## Audit

Append-only `audit_logs` (no client insert/update/delete policies): auth
events, invitations, role changes, connection create/test/rotate/disconnect,
limit changes, estimate/confirm/cancel/retry, ingestion, reconciliation,
export request/generate/download/purge, org changes. Details are redacted
before write.

## SSRF

The application never fetches arbitrary business websites itself — website
crawling is delegated to the configured provider. Server-side fetches go only
to api.apify.com and the project's Supabase URL.
