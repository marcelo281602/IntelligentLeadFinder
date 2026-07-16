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

1. **Apify API token** for the ≤10-record, low-cap smoke test (Provider Completion gate).
2. **Hosted Supabase project** (URL, anon key, service-role key, DB password) — creating one is an external action.
3. **Apollo commercial-use approval** — integration stays off without documented terms.
4. **Deployment approval** — Vercel project, worker host, production env vars.
