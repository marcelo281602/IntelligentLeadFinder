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

## 2026-07-17 (live-run findings + platform batch)

| Decision |
| --- |
| First real Apify run (Plumbers/CA, cap $1.61) exposed 3 bugs, all fixed: (1) `categoryFilterWords` has a restricted vocabulary → never sent anymore; categories are free local post-filters. (2) Worker dispatcher swallowed `'rescheduled'` from handleIngest → poll jobs died after one poll; return value now propagated (fixture tests can't catch this — fixture never reschedules). (3) "Has company email" without contact enrichment rejects 100% of results → UI now couples the two checkboxes. |
| Operator recovery pattern established: paid raw records are re-normalizable at zero provider cost (relax snapshot post-filter + reset rawCursor + fresh normalize/reconcile jobs + audit `run.operator_renormalized`). Plumbers run recovered: 14 companies, 4 decision-makers, $0.49 actual. |
| Migration 0009: `organizations.plan` (trial/active/suspended) + `trial_ends_at` (14-day default). Expired trial/suspended → paid confirmations blocked (fixture unaffected); banner ≤3 days. Only super-admins manage plans (audited). |
| Super-admin console at /admin (Platform health + Clients tab). Super-admin = `user_profiles.is_super_admin`; marcelo281602@gmail.com granted. Reads via service client behind requireSuperAdmin — RLS untouched. |
| Signup default = pre-confirmed account + immediate session (admin.createUser). `AUTH_EMAIL_VERIFICATION=required` restores the email-verification flow; Resend integration planned. |
| PWA shipped: manifest route, generated PNG icons (scripted, zero-dep), pass-through service worker (no caching of authed data), beforeinstallprompt install button. Middleware allows manifest/sw/icons. |
| Apify "pagination" reality: the actor cannot resume at an offset across runs — each run rescrapes from the top of search results and bills every scraped place again. Cost-safe daily patterns: (a) segment by location (different city/zip per day), (b) one larger run instead of N small ones, (c) dedupe already guarantees no duplicate records in-app. A "continuation runs" helper is roadmapped, not yet built. |
| Outscraper/Prospeo/Apollo full adapters: NEXT work block (docs-verified endpoints, contract tests, connect/test UI; Apollo stays commercially gated regardless). |

## 2026-07-18 (destinations + client deliverables)

| Decision |
| --- |
| Migration 0010: `destinations` (standing sync targets: google_sheets/webhook/n8n/make/zapier, encrypted shared secret, auto_sync flag) + `destination_deliveries` (unique per destination+entity → a lead can never be appended twice) + `sync_destination` job kind. |
| Google Sheets integration = client-deployed Apps Script web app (no OAuth scopes, no Google Cloud project needed): LeadFinder POSTs `{columns, rows, secret}` signed with `X-LeadFinder-Signature` (HMAC-SHA256); the script verifies the shared secret and appends rows. Secret is generated client-side, embedded in the copied script, encrypted at rest server-side. |
| Auto-sync trigger lives at end of reconcile: every completed run enqueues one `sync_destination` job per auto_sync destination (idempotency `dest:<destId>:<runId>`). Manual "Sync now" pushes all not-yet-delivered leads. Sheets cells are formula-injection-escaped; raw webhooks get raw values. |
| Delivery SSRF guard: HTTPS only, loopback/private ranges refused, redirects refused, 20s timeout. fetch failures surface `.cause.code` (ENOTFOUND etc.), not just "TypeError". |
| Live E2E verified on hosted Supabase: 9 fixture leads → postman-echo (httpbin.org DNS is blocked in this sandbox), deliveries=9, re-sync appended 0 (idempotent). Test destination soft-deleted after. |
| Client deliverables in `deliverables/`: LeadFinder-Client-Handoff.pdf (4pp: access, workflow, Apify BYO-key, cost controls, Sheets setup, trial) and LeadFinder-vs-Apify-Why-It-Wins.pdf (3pp: engine-vs-car positioning, side-by-side table, 5 value props). Branded reportlab, entity-render verified. |

## 2026-07-18 (Vercel Cron serverless — no separate worker host)

| Decision |
| --- |
| Worker engine extracted to `@leadfinder/worker/engine` (dispatch/processQueueTick/runMaintenance), imported by BOTH the standalone worker (main.ts, now a thin loop) and a new `/api/cron/worker` Next route. Works because the queue is SKIP-LOCKED + every stage idempotent/checkpointed — cadence is the only difference. |
| Exports moved off local disk → Supabase Storage private bucket `exports` (survives serverless; local disk is per-invocation ephemeral). Download route redirects to a 60s signed URL; retention purges from Storage; bucket auto-created lazily. |
| Vercel account is HOBBY: native cron limited to once/day + functions cap ~10s. So: vercel.json cron = daily backstop only; the real per-minute trigger is **Supabase pg_cron + pg_net** pinging the endpoint 2×/min (free, self-contained, no Pro plan, no Railway). Endpoint gated by CRON_SECRET (Bearer), tick budget 8s to fit the 10s cap. `npm run cron:setup --workspace @leadfinder/db` installs it (reads CRON_SECRET + CRON_TARGET_URL from env; secret never committed). |
| CRITICAL serverless fix: Supabase DIRECT connection (`db.<ref>.supabase.co:5432`) is IPv6-only → Vercel serverless (IPv4) gets ENOTFOUND. Vercel `DATABASE_URL` must use the TRANSACTION POOLER: `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`. This project's region = **ap-southeast-2** (found by probing). Local .env keeps the direct URL for migrations (Mac has IPv6). |
| Verified: cron endpoint 401s without secret, processes with it (`{ok:true,processed:N}`); Mac worker OFF; pg_cron drives a full fixture run to completion via Vercel alone. |

## 2026-07-18 (paid Apify smoke test PASSED)
| Real Apify smoke run: "coffee shop" Austin, 10 places, no enrichment, cap $0.50. Result: 10 ingested / 10 accepted / 0 rejected, real businesses (Summer Moon Coffee 2031 reviews, Austin Grind, Dame Café…). Actual cost $0.0502 = 10 base scrapes ($0.04) + 10 closed-place billable filter ($0.01) — validates estimator's billable-filter model against reality. Apify integration now fully production-validated end-to-end. Minor cosmetic bug: reconcile variance_explanation says "more successful enrichments" even when enrichment was off — fix in providers pass. |
| HONEST CORRECTION to marketing "it remembers → saves credits": Apify bills at SCRAPE time (per scraped place) BEFORE our dedup runs, so re-running the same search DOES re-charge the base scrape. Dedup gives (a) permanently clean DB (100% true), (b) never re-paying for ENRICHMENT you already own — but only once enrichment is a separate DB-gated step (Prospeo/Apollo, being built). Base-scrape credits are NOT saved by dedup. Cost-smart pattern = scrape different areas daily (low overlap). Enrichment ($0.10/lead on Free) is 25× base scrape ($0.004) — that's where memory saves real money. Fix vs-Apify PDF wording after providers. |

## Outscraper API (verified from python SDK, 2026-07-18)
| Base `https://api.app.outscraper.com`; auth header `X-API-KEY`. Google Maps: `POST /google-maps-search` JSON `{query:[...], language, region, organizationsPerQueryLimit:limit, skipPlaces:skip, coordinates, dropDuplicates, async:true, enrichment:[], fields}`. Async → response has request `id`; poll `GET /requests/{id}` until `status != 'Pending'` (Success/Finished), results in `data` (array-per-query). No server-side $ cap → enforce cost via `limit` (flat per-place pricing is deterministic, safer than Apify outcome-based). Connection test: `GET /requests/<dummy>` (401=bad key, 404=ok, no scrape cost). |

## 2026-07-18 (Outscraper adapter LIVE — second Google Maps source)
| Decision |
| --- |
| `packages/providers/src/outscraper/` (schemas/client/adapter) implements the full `MapsProviderAdapter` contract. Key in `X-API-KEY` header only (never URL). `startRun` refuses without a positive hard cap; cost bounded by `organizationsPerQueryLimit` (flat $3/1k, deterministic). `validateKey` = GET /requests/<dummy> (401 bad key, 404 authenticated) — free connection test. No abort endpoint (no-op; pipeline settles local state). 12 contract tests in `outscraper-contract.test.ts`. |
| Rate card lookup generalized: `rateCardKeyFor(provider, config)` in `apps/web/src/lib/estimate.ts` — Apify → actorId+planTier, Outscraper → fixed `google-maps`/`pay_as_you_go` (card seeded in 0007). Both `search.ts` and lead-finder page use it; lead-finder dropdown now includes outscraper connections. |
| Reconcile fallback for providers that report no per-run billing: when `usageTotalMicroUsd` undefined, cost = `ingested_count × rate_card.events.place_scraped` from the run's versioned `rate_card_id` (honest explanation stored). Also fixed the cosmetic "more successful enrichments" wording → "more billable events". |
| `connectOutscraper` action mirrors Apify (test-before-store, envelope encrypt, deny-all secret table, audit) + double-gates on the global `provider_outscraper` flag. Migration 0011 flips that flag (column is `metadata`, not `payload`). Integrations page: full Outscraper connect/rotate/disconnect card; planned-provider grid now Prospeo + Apollo only. |
| Positioning: Outscraper = cheap volume company data ($3/1k vs Apify $4/1k free tier, and no outcome-based add-on charges); Apify = richer data + Business Leads enrichment. Clients can connect both and pick per-run. |
