# Yelp via Apify — Actor contract (`memo23/yelp-scraper`)

Status: **implemented, deploy-disabled**. Both gates (`provider_yelp_apify`,
`yelp_legal_approved`) are seeded OFF in migration `0014`. No paid Yelp run has
been executed yet; the real-Actor smoke test is a staging gate.

## Approved Actor

| Item | Value |
| --- | --- |
| Actor | `memo23/yelp-scraper` (community-maintained, Apify Store) |
| Binding | Server-side constant `APPROVED_YELP_ACTOR_ID` (`packages/core/src/rate-cards.ts`) |
| Allowlist enforcement | `YelpApifyAdapter.startRun` throws on any other `sourceId`; tenants never supply an Actor id |
| Input schema verified | 2026-07-18, from the Actor's public input schema |
| Output contract verified | 2026-07-18, from the Actor's README sample (re-validate in the smoke test) |
| Pricing verified | 2026-07-18, https://apify.com/memo23/yelp-scraper/pricing |

## Input we send (server-controlled only)

```json
{
  "startUrls": [{ "url": "https://www.yelp.com/search?find_desc=…&find_loc=…" }],
  "maxItems": <maxResults>,
  "fetchBusinessDetails": true,
  "scrapeReviews": false,
  "maxReviews": <only when reviews enabled>,
  "enrichEmails": false
}
```

- URLs are built ONLY by `buildYelpSearchUrl` from structured form fields and
  must pass `assertApprovedYelpUrl` (https, host `www.yelp.com`, path
  `/search`, no userinfo/port/fragment). Raw URLs are never accepted.
- `proxy`, `maxConcurrency`, `proxyProviders`, storage ids, and callbacks are
  never taken from a browser request.
- `enrichEmails` is pinned `false`: the Actor bills per found email but
  publishes no price for that event — we refuse to estimate against a guess.
  Enabling it requires an admin-verified rate card entry first.
- Every run sends `maxTotalChargeUsd` (the user-confirmed hard cap) and
  `maxItems`; the adapter refuses to start without a positive cap.

## Output mapping (`mapYelpBusiness`)

| Actor field | Normalized field | Notes |
| --- | --- | --- |
| `title` | `canonical_name` | required; row rejected without it |
| `yelp_biz_id` | `yelp_business_id`, `providerRecordId` | dedupe key `place:yelp_apify:<id>` — its own namespace, never mixed with Google place ids |
| `url` | `yelp_url` | kept only when host is `*.yelp.com` |
| `rating` | `rating` | numeric coercion |
| `reviewCount` | `review_count` | parses `"509 reviews"` → `509` |
| `categories` | `categories` / `primary_category` | comma-split |
| `priceLevel` | `price_range` | |
| `phoneNumber` | `primary_phone` | company phone, not a decision-maker phone |
| `website` | `website` / `root_domain` | |
| `fullAddress`,`city`,`state`,`zipcode` | address fields | |
| `hours` | `opening_hours` | |
| `contactEmail` | `companyEmails[0]` | COMPANY contact email only — never a decision-maker email, never "verified" |
| country | `country_code` | not returned by Yelp; derived from the confirmed search location (`MapContext.defaultCountryCode`), never guessed |

Truthfulness rules: no decision-makers, no LinkedIn URLs, no verification
states are ever produced from Yelp data. `isClaimed` is retained in raw
provenance only.

## Rate card (provider `yelp_apify`, scope `memo23/yelp-scraper`)

Per single unit, micro-USD (seeded in `0014`, `yelpApifyRateCard()` in core):

| Event | Price |
| --- | --- |
| `business_result` | 2,750 ($2.75/1k) |
| `review_detail` | 1,500 ($1.50/1k) |
| `actor_start` | 9,000 ($0.009) |
| `review_insights` | 20,000 ($20/1k) — not exposed in tenant UI |
| `ai_analysis` | 50,000 ($50/1k) — not exposed in tenant UI |
| email enrichment | ABSENT — no published price; option disabled |

Estimator: `estimateYelpRunCost` (core) → results + one Actor start
(+ review details when enabled), low/expected/high via fill-rate assumptions,
recommended cap = high + 15% headroom. Reconciliation uses Apify's
authoritative `usageTotalUsd` from the run record (same path as Google Maps).

## Pre-enablement checklist (staging)

1. Apply migrations `0013` + `0014` to staging; flags stay OFF.
2. Flip `provider_yelp_apify` ON in staging only; connect a test Apify token
   through the **Yelp via Apify** card (its own secret — never copied from the
   Google Maps card).
3. "Test token & Actor access" must pass (`getMe` + `GET /acts/memo23~yelp-scraper`).
4. Record the legal/terms review, then flip `yelp_legal_approved`.
5. Run ONE smoke search: `maxResults ≤ 10`, no reviews, cap ≤ $0.50.
6. Validate: returned fields vs this contract, nulls preserved, pagination,
   dedupe (`place:yelp_apify:*` keys), reconcile actual cost, audit rows.
7. Any schema/pricing drift → keep flags OFF, update this doc + rate card
   version, re-approve.

## Kill switch

Flip `provider_yelp_apify` OFF (global feature_flags row): the nav tab
disappears, `/yelp-leads` renders the disabled state, `connectYelpApify` and
`createYelpDraftAndEstimate` both refuse. No other provider is affected; Yelp
history, provenance, and costs are retained.
