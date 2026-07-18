-- Enable the Prospeo contact-enrichment provider.
-- Contract tests: packages/providers/test/prospeo-contract.test.ts (request
-- datapoint validation, exact verification-state preservation, zero-cost
-- NO_MATCH / free repeat-enrichment billing, X-KEY header hygiene).
-- Prices per SINGLE unit in micro-USD, verified 2026-07-18 from
-- https://prospeo.io/pricing: email = 1 credit, mobile = 10 credits.
-- Free 75 credits/mo ($0 marginal), Basic $39/1k, Pro $99/5k,
-- Business $199/20k, Corporate $369/50k.

insert into public.provider_rate_cards
  (provider, scope, plan_tier, version, currency, last_verified_at, source_url, events, assumptions)
values
  ('prospeo', 'enrich-person', 'free', 1, 'USD', '2026-07-18',
   'https://prospeo.io/pricing',
   '{"email_enrichment":0,"mobile_enrichment":0}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('prospeo', 'enrich-person', 'basic', 1, 'USD', '2026-07-18',
   'https://prospeo.io/pricing',
   '{"email_enrichment":39000,"mobile_enrichment":390000}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('prospeo', 'enrich-person', 'pro', 1, 'USD', '2026-07-18',
   'https://prospeo.io/pricing',
   '{"email_enrichment":19800,"mobile_enrichment":198000}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('prospeo', 'enrich-person', 'business', 1, 'USD', '2026-07-18',
   'https://prospeo.io/pricing',
   '{"email_enrichment":9950,"mobile_enrichment":99500}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('prospeo', 'enrich-person', 'corporate', 1, 'USD', '2026-07-18',
   'https://prospeo.io/pricing',
   '{"email_enrichment":7380,"mobile_enrichment":73800}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}');

update public.feature_flags
set enabled = true,
    metadata = '{"note":"Enabled 2026-07-18 after contract tests; DB-gated enrichment stage pending — connections and credential tests only until then"}'::jsonb
where key = 'provider_prospeo'
  and organization_id is null;
