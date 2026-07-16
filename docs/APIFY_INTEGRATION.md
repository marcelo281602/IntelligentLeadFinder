# Apify integration

Actor: `compass/crawler-google-places` (configurable per connection).
Input/output field names were verified against the actor's published
OpenAPI/dataset schema on 2026-07-16 (see `packages/providers/src/apify/schemas.ts`).

## Credential flow

1. Owner/admin pastes the API token in **Settings → Integrations** (HTTPS POST
   to a server action; `integrations:manage` permission).
2. Token is tested first (`GET /v2/users/me`, Bearer header — never a query
   param). Failing tokens are never stored.
3. Envelope encryption (AES-256-GCM, per-secret DEK wrapped by
   `APP_ENCRYPTION_KEY`) → `integration_secret_versions` (deny-all RLS).
4. UI shows only status + SHA-256 fingerprint prefix. Rotation/disconnect
   require the user's password again; old versions get `revoked_at`.

## Run lifecycle

- `POST /v2/acts/compass~crawler-google-places/runs?maxTotalChargeUsd=<cap>&waitForFinish=0`
  with input built by `buildActorInput` from the validated `SearchConfig`:
  `searchStringsArray`, `countryCode/city/state/postalCode` or
  `customGeolocation` ([lng, lat] + radiusKm), `maxCrawledPlacesPerSearch`,
  `language`, `placeMinimumStars`, `website`, `skipClosedPlaces`,
  `categoryFilterWords`, `scrapePlaceDetailPage`, `scrapeContacts`,
  `maximumLeadsEnrichmentRecords`, `leadsEnrichmentDepartments`,
  `verifyLeadsEnrichmentEmails`, `maxReviews`, `maxImages`.
- Postal code is never combined with city (actor constraint). Reviews, images,
  social-profile detail enrichment, and competitor analysis are off unless
  explicitly requested — no surprise charges.
- Completion webhook (`ACTOR.RUN.SUCCEEDED|FAILED|ABORTED|TIMED_OUT`) targets
  `/api/webhooks/apify/<high-entropy token>`; the token is stored only as a
  SHA-256 hash on the run. Apify ad-hoc webhooks are unsigned, so the webhook
  only *nudges* the poller — authoritative state is always re-fetched from
  `GET /v2/actor-runs/{id}`. Polling continues regardless, so a missing webhook
  costs only latency.
- Dataset pages: `GET /v2/datasets/{id}/items?offset&limit&clean=true`,
  100 items/page, checkpointed.

## Field mapping highlights

- Place → company: title, categoryName/categories, address parts, countryCode,
  location.lat/lng, phone/phoneUnformatted (→ E.164), website (→ root domain),
  placeId/fid/cid, totalScore/reviewsCount, closed flags, price, openingHours,
  `emails`/`phones`/`linkedIns`/socials (from `scrapeContacts`).
- `leadsEnrichment[]` → contacts: personId, names, jobTitle, headline,
  departments, seniority, email + `emailVerification.result`
  (ok→verified, catch_all→catch_all, unknown→unverified, invalid|disposable→invalid,
  error→provider_error; no verification requested→found), mobileNumber,
  **linkedinProfile → personal_linkedin_url**, **companyLinkedin →
  company_linkedin_url**, companyName/Website/Size. Leads without any name are
  dropped with a warning — a person is never invented.

## Cost

Versioned rate cards (per-unit micro-USD, seeded from prices verified
2026-07-16) drive low/expected/high estimates; billable filters = min stars,
website presence, category filter, closed-place skip. Reconciliation reads
`usageTotalUsd` from the run ~30s after completion and writes `cost_ledger` +
idempotent `usage_events`.

## Smoke test (required before calling this production-ready)

With the user's token and explicit approval: max 10 places, tiny cap
(~$0.50), no reviews/images, decision-makers optional. Validates real response
schema, pagination, and reconciliation. See docs/TEST_PLAN.md.
