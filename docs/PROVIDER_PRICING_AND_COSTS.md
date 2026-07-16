# Provider pricing & cost controls

Prices below were verified from public provider pages on **2026-07-16**. They
are planning inputs, not constants: the app reads **versioned rate cards** from
`provider_rate_cards` (per-unit micro-USD + estimator assumptions + last-verified
date + source URL). Publish a new version to change prices; old versions are
kept so historical estimates stay explainable.

## Seeded cards

**Apify `compass/crawler-google-places`** (USD per 1,000 units → stored per unit):

| Event                        | Free | Starter | Scale | Business |
| ---------------------------- | ---: | ------: | ----: | -------: |
| place_scraped                | 4.00 | 3.00    | 2.00  | 1.50     |
| filter_applied               | 1.00 | 1.00    | 0.75  | 0.53     |
| place_details                | 2.00 | 2.00    | 1.50  | 1.05     |
| company_contacts             | 2.00 | 2.00    | 1.50  | 1.05     |
| business_lead                | 100  | 5.00    | 5.00  | 4.00     |
| email_verification           | 100  | 4.00    | 3.00  | 2.00     |
| social_profile               | 100  | 8.00    | 7.00  | 6.00     |
| review_scraped / image_scraped | 0.50 | 0.50  | 0.37  | 0.26     |

Source: https://apify.com/compass/crawler-google-places/pricing.
The Free plan is unsuitable for Business Leads / verification (100×).

**Outscraper google-maps**: $3/1,000 places (first 500/mo free) — seeded for
future adapter use. **Fixture**: all zeros.

## Estimator

`estimateRunCost` (packages/core/src/estimator.ts) implements the master
formula with low/expected/high scenarios from card-stored assumptions
(place fill 50/85/100%; lead success 30/60/100%; decisive verification
30/60/100%). Reference case (test-pinned): 1,000 companies on Starter, 1 filter,
1 lead/company, verification → high estimate exactly **$13.00**.

## Hard controls (enforced, not advisory)

1. **Per-run hard cap** — user confirms a USD cap (default: high estimate
   +15%, rounded to cents). Validated server-side against the estimate floor,
   `quota_policies.per_run_cap_micro_usd`, and remaining monthly budget; sent
   to Apify as `maxTotalChargeUsd`. The worker refuses any run without a cap.
2. **Monthly budget** — month-to-date `usage_events` spend blocks new paid
   confirmations at the limit; warning banner at `warn_at_percent` (default 80%).
3. **Raising limits requires re-authentication** and is audit-logged. Running
   jobs keep the cap they were approved with.
4. **Reconciliation** — provider-reported actuals land in `cost_ledger`
   (estimate vs cap vs actual + variance explanation); ledger writes are
   idempotent so retries can never double-charge.

A `markup` concept for a future platform-managed-credit model can be added as a
rate-card field without schema changes (events jsonb).
