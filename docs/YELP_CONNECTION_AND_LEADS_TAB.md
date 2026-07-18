# Yelp via Apify — separate connection & the Yelp Leads Scraper tab

The Yelp integration is a **separate product integration** inside the Apify
provider family. It is additive: nothing about the existing Apify Google Maps,
Outscraper, or Prospeo integrations changed.

## Separation guarantees

| Concern | How it is separated |
| --- | --- |
| Provider identity | New `provider_kind` enum value `yelp_apify` (migration `0013`) |
| Connection record | Own `integration_connections` row (`provider = 'yelp_apify'`) |
| Secret | Own `integration_secret_versions` envelope. Submitting the same Apify token as the Google Maps card still creates a NEW encrypted secret reference — never aliased, never copied |
| Credential use | Worker `loadCredentials` is connection-id-scoped; a Yelp run can only decrypt the secret of the connection pinned on the run row. Fallback to the Google Maps connection is structurally impossible |
| Run selection | `createYelpDraftAndEstimate` filters `provider = 'yelp_apify'`; an `apify` connection id is rejected with an explicit error, never substituted |
| Rate card / usage / cost | Keyed by provider `yelp_apify` — distinguishable from `apify` in `usage_events`, `cost_ledger`, and run history |
| Rotation / disconnect | Generic per-connection actions; disconnecting Yelp blocks new Yelp runs only and preserves all history and provenance |
| Audit | Every connect/test/rotate/disconnect/estimate/confirm logs with `provider: 'yelp_apify'` and the Actor id |

## Gates (both required for paid runs, both default OFF)

1. `provider_yelp_apify` — feature flag & kill switch. OFF hides the nav tab,
   renders `/yelp-leads` as safely disabled, and blocks `connectYelpApify` +
   `createYelpDraftAndEstimate` server-side.
2. `yelp_legal_approved` — legal/terms-review gate. With the feature ON but
   legal OFF, the tab is visible, connections can be prepared, and the run
   button stays disabled (client and server).

## The tab (`/yelp-leads`, nav label "Yelp Leads Scraper")

Server component reusing the existing design system, auth, and permissions:

- Feature OFF → neutral "not enabled" empty state.
- Disconnected → explanation + **Connect Yelp via Apify** CTA into
  Settings → Integrations (admins) or a read-only hint (other roles).
- Connected → search form: term, country/region/city/postal, max results
  (quota-bounded), advanced drawer (full details ON, reviews OFF + max
  reviews, email enrichment permanently disabled with the honest reason),
  Actor + rate disclosure, then the standard estimate → hard-cap → confirm
  flow on the run page (`/runs/{id}?confirm=1`).
- Recent Yelp runs (`provider = 'yelp_apify'`) and latest Yelp leads
  (`yelp_business_id is not null`) with links into the shared companies,
  lists, exports, and Prospeo-enrichment workflows.
- Viewer roles see results but no run form (`searches:run` enforced
  server-side as everywhere else).

## Run pipeline

Yelp runs ride the existing generic pipeline unchanged: draft → estimate →
awaiting_confirmation → queued (hard cap validated) → `run_search` job →
`YelpApifyAdapter.startRun` (maxTotalChargeUsd + maxItems) → webhook nudge or
polling → paged ingest with checkpoints → normalize (`mapYelpBusiness`) →
dedupe (`place:yelp_apify:<biz id>` namespace + domain/phone/name keys) →
reconcile (authoritative Apify usage) → export/destination sync → audit.
Resume, retry, cancellation, and partial results all behave exactly as for
Google Maps runs because the stages are provider-generic.

## Rollback / emergency disable

1. Flip `provider_yelp_apify` OFF — immediate, no deploy, affects Yelp only.
2. Application rollback: previous builds ignore the new enum value and the
   nullable `companies.yelp_business_id`/`yelp_url` columns — migrations
   `0013`/`0014` are expand-only and never need reversal.
3. Never delete Yelp rows to roll back code; history and provenance stay.

## Deliberate limitations (v1)

- Website-email enrichment disabled (no published event price).
- Review insights / AI analysis not exposed to tenants.
- Yelp market coverage is not asserted; unsupported locations surface as
  provider errors on the run rather than fabricated results.
- `isClaimed` kept in raw provenance only (no normalized column yet).
- Fixture mode does not simulate Yelp-specific states; contract tests use
  redacted fixtures (`packages/providers/test/yelp-contract.test.ts`).
