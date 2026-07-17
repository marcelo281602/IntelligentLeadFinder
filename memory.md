# memory.md — LeadFinder decision log

Running log of confirmed decisions, assumptions, progress, and blockers.
Update this file whenever a durable decision is made.

## Confirmed decisions

| Date       | Decision                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-07-16 | Greenfield build per master prompt; npm workspaces (no pnpm on machine).                                            |
| 2026-07-16 | Pinned mature dependency lines: Next 15.5.20, React 19.2.7, TS 5.9.3, Tailwind 4.3.2, Zod 3.25.76, ESLint 9, Vitest 3 — newest majors (TS 7, ESLint 10, Next 16) deliberately skipped for compatibility per spec's "don't blindly upgrade" rule. |
| 2026-07-16 | No Docker on the dev machine → local Supabase stack impossible. DB/RLS/pipeline tests run on PGlite (real Postgres WASM) with a documented auth shim; runtime targets hosted Supabase. |
| 2026-07-16 | Package layout adaptation: spec's `packages/ui` folded into `apps/web/src/components`; `packages/testing` fixtures live in `packages/providers`; harness in `packages/db/src/testing`. |
| 2026-07-16 | Durable queue = Postgres table `provider_jobs` with `FOR UPDATE SKIP LOCKED` (portable; no queue vendor lock-in), heartbeats, exponential backoff + jitter, dead-letter status. |
| 2026-07-16 | Money = integer micro-USD (1e6 = $1). Rate cards versioned in DB; seeds carry prices verified 2026-07-16 from public Apify/Outscraper pages. |
| 2026-07-16 | Apify actor input/output field names verified against the actor's published OpenAPI/dataset schema (searchStringsArray, maxCrawledPlacesPerSearch, scrapeContacts, maximumLeadsEnrichmentRecords, verifyLeadsEnrichmentEmails, leadsEnrichment[].linkedinProfile vs .companyLinkedin, emailVerification.result enum, …). |
| 2026-07-16 | Added `invalid` to email_status enum: Apify verification can return invalid/disposable and mislabeling it would violate truthfulness rules. |
| 2026-07-16 | Billable-filter counting matches actor reality: min stars, website presence, category filter, closed-place skip are provider-billed; phone/email/review-count filters are free local post-filters. |
| 2026-07-16 | `provider_raw_records.ordinal` added: normalization processes records in dataset order so merge outcomes are deterministic (uuid ordering was nondeterministic). |
| 2026-07-16 | Fixture dataset uses distinct reserved `.example` domains — shared `.example.com` subdomains collide with root-domain dedupe (correct behavior, wrong fixtures). |
| 2026-07-16 | Webhooks: Apify ad-hoc webhooks are unsigned → high-entropy token in URL path, stored as SHA-256 hash, replay-safe inbox, authoritative state always re-fetched from the Apify API. |
| 2026-07-16 | Re-authentication (password) required for: raising cost limits, credential rotation, disconnecting a provider. |
| 2026-07-16 | User request for Yelp scraper: approved as future feature-flagged adapter after the vertical slice. LinkedIn scraper request: refused — master prompt hard rule; LinkedIn URLs only via licensed Business Leads data or manual entry. |
| 2026-07-16 | v1 search uses the first location per run (actor takes one location per run); multi-location fan-out is a documented follow-up. |
| 2026-07-16 | Invitation emails not sent (no SMTP configured): invite link shown once to the inviter to share out-of-band. |

## Assumptions

- Initial capacity ~10,000 company records/month; PAGE_SIZE 100 ingestion, batch-50 normalization is comfortably sufficient.
- Apify Starter is the default plan tier for estimates until the org selects otherwise on the connection.
- Export files: local disk in dev (`EXPORT_STORAGE_DIR`), private object storage in production (documented, not yet wired).
- Estimator assumptions (fill 50/85/100%, lead success 30/60/100%, decisive verification 30/60/100%) are stored on the rate card and shown with every estimate.

## Progress

- [x] Monorepo scaffold, lint/format/typecheck toolchain
- [x] Core domain: state machine, estimator, normalizers, dedupe, CSV safety (59 tests)
- [x] Security: envelope crypto, signed tokens, redaction (16 tests)
- [x] 53-table schema + RLS, PGlite harness, cross-tenant/IDOR/role suite (24 tests)
- [x] Apify adapter contract-tested against verified schema + fixture provider (24 tests)
- [x] Worker: durable queue + resumable pipeline, fixture E2E on real Postgres (10 tests)
- [x] Web app: all 12 nav routes + auth + onboarding + webhook/download/health APIs; production build green
- [x] Docs set, CI workflow
- [ ] Real Apify smoke test (blocked: needs user's Apify token + approval, ≤10 records)
- [ ] Hosted Supabase project + live end-to-end auth flow (blocked: needs user-created project)
- [ ] Staging/production deployment (blocked: requires explicit approval)

## Blockers (require the user)

1. ~~Hosted Supabase project~~ **RESOLVED 2026-07-17**: project `dyblidzhtgisnjjgwahd` connected; 7 migrations applied; demo workspace seeded; live fixture run completed through the real worker (9/2/3/4 counts verified). Credentials live only in gitignored `.env`.
2. ~~Apify token~~ **PARTIALLY RESOLVED 2026-07-17**: token tested (account `expert_puppet`, FREE plan) and stored envelope-encrypted via `npm run connect:apify`. The ≤10-record **paid smoke run still awaits explicit user approval**. Note: FREE plan makes Business Leads enrichment ~20× pricier — first smoke should skip enrichment (~$0.04 for 10 places).
3. ~~Publishable/anon key~~ **RESOLVED 2026-07-17**: legacy anon key configured; full browser E2E passed locally AND in production.
4. ~~GitHub push~~ **RESOLVED 2026-07-17**: pushed to marcelo281602/IntelligentLeadFinder via repo-scoped PAT (not persisted).
5. **DEPLOYED 2026-07-17**: web live at https://intelligent-lead-finder.vercel.app (Vercel project intelligent-lead-finder, team adverts-ai, rootDirectory apps/web, 8 prod env vars). Health check green; production sign-in + dashboard verified. CAVEAT: the worker currently runs on the dev Mac against the same Supabase — runs only progress while it's up. Proper worker host (Railway/Render/Fly) is the next infra step.
6. **Supabase Auth URLs**: add https://intelligent-lead-finder.vercel.app as Site URL + /auth/callback redirect in the Supabase dashboard for email verification/reset flows (password sign-in already works).
7. (superseded) **Supabase publishable key missing** (`sb_publishable_…`, Dashboard → Settings → API keys) — required for browser sign-in; server-side flows all work without it.
4. **GitHub push blocked**: keychain credential is account `Eriin2816`, which lacks write access to `marcelo281602/IntelligentLeadFinder` (remote `origin` already configured). Fix: add Eriin2816 as collaborator OR supply a repo-scoped PAT for marcelo281602.
5. **Apollo commercial-use approval** — integration stays off without documented terms.
6. **Deployment approval** — Vercel project, worker host, production env vars.
8. **Security follow-up**: DB password, sb_secret key, Apify token, and the GitHub PAT were shared in chat — rotate all four after setup settles; change the demo user password (demo-password-change-me).
