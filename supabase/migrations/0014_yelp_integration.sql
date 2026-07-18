-- Yelp-via-Apify integration: additive companies columns, rate card, flags.
-- Everything here is backward compatible: new columns are nullable, the new
-- enum value is unused by existing rows, and both feature flags default OFF
-- (deploy-disabled until staging gates + legal review pass).

-- Yelp identifiers live in their own source namespace, never mixed with
-- Google identifiers. Uniqueness per organization is enforced through
-- company_dedupe_keys ('place:yelp_apify:<id>' is unique per org); this
-- index serves lookups.
alter table public.companies add column if not exists yelp_business_id text;
alter table public.companies add column if not exists yelp_url text;
create index if not exists companies_yelp_business_id_idx
  on public.companies (organization_id, yelp_business_id)
  where yelp_business_id is not null;

-- memo23/yelp-scraper pay-per-event rate card, verified 2026-07-18 from
-- https://apify.com/memo23/yelp-scraper/pricing. Prices per SINGLE unit in
-- micro-USD: business result $2.75/1k, review detail $1.50/1k, Actor start
-- $0.009, review insights $20/1k, AI analysis $50/1k. The optional
-- email-enrichment event has NO published price and is deliberately absent:
-- the option stays disabled until an admin verifies and publishes a rate.
insert into public.provider_rate_cards
  (provider, scope, plan_tier, version, currency, last_verified_at, source_url, events, assumptions)
values
  ('yelp_apify', 'memo23/yelp-scraper', 'pay_per_event', 1, 'USD', '2026-07-18',
   'https://apify.com/memo23/yelp-scraper/pricing',
   '{"business_result":2750,"review_detail":1500,"actor_start":9000,"review_insights":20000,"ai_analysis":50000}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}');

-- Independent gates (both required for paid Yelp runs, both default OFF):
--   provider_yelp_apify — feature flag / emergency kill switch
--   yelp_legal_approved — legal & terms-review gate (Yelp restricts scraping;
--   an Actor's availability is not permission — record a documented review
--   before enabling)
insert into public.feature_flags (key, organization_id, enabled, metadata) values
  ('provider_yelp_apify', null, false,
   '{"note":"Separate Yelp-via-Apify integration (memo23/yelp-scraper). OFF until staging gates + smoke test pass. Kill switch: flip off to hide the tab and block new connects/runs instantly."}'),
  ('yelp_legal_approved', null, false,
   '{"note":"Yelp legal/terms-review gate. Record reviewer, date, scope, and countries in commercial_use_approvals or here before enabling paid Yelp runs."}');
