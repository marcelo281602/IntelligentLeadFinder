-- ============================================================================
-- 0007 Seed reference data: rate cards (verified 2026-07-16), feature flags,
--      role-permission documentation rows
-- ============================================================================
-- Rate-card prices are per SINGLE unit in micro-USD (spec pages quote per
-- 1,000 units). E.g. Starter "scraped places" $3.00/1000 = 3000 µUSD/unit.

insert into public.provider_rate_cards
  (provider, scope, plan_tier, version, currency, last_verified_at, source_url, events, assumptions)
values
  ('apify', 'compass/crawler-google-places', 'free', 1, 'USD', '2026-07-16',
   'https://apify.com/compass/crawler-google-places/pricing',
   '{"place_scraped":4000,"filter_applied":1000,"place_details":2000,"company_contacts":2000,"business_lead":100000,"email_verification":100000,"social_profile":100000,"review_scraped":500,"image_scraped":500}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('apify', 'compass/crawler-google-places', 'starter', 1, 'USD', '2026-07-16',
   'https://apify.com/compass/crawler-google-places/pricing',
   '{"place_scraped":3000,"filter_applied":1000,"place_details":2000,"company_contacts":2000,"business_lead":5000,"email_verification":4000,"social_profile":8000,"review_scraped":500,"image_scraped":500}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('apify', 'compass/crawler-google-places', 'scale', 1, 'USD', '2026-07-16',
   'https://apify.com/compass/crawler-google-places/pricing',
   '{"place_scraped":2000,"filter_applied":750,"place_details":1500,"company_contacts":1500,"business_lead":5000,"email_verification":3000,"social_profile":7000,"review_scraped":370,"image_scraped":370}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('apify', 'compass/crawler-google-places', 'business', 1, 'USD', '2026-07-16',
   'https://apify.com/compass/crawler-google-places/pricing',
   '{"place_scraped":1500,"filter_applied":530,"place_details":1050,"company_contacts":1050,"business_lead":4000,"email_verification":2000,"social_profile":6000,"review_scraped":260,"image_scraped":260}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('outscraper', 'google-maps', 'pay_as_you_go', 1, 'USD', '2026-07-16',
   'https://outscraper.com/google-maps-scraper/',
   '{"place_scraped":3000}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}'),
  ('fixture', 'fixture-google-maps', 'free', 1, 'USD', '2026-07-16',
   'internal://fixture',
   '{"place_scraped":0,"filter_applied":0,"place_details":0,"company_contacts":0,"business_lead":0,"email_verification":0,"social_profile":0,"review_scraped":0,"image_scraped":0}',
   '{"placeFillRate":{"low":0.5,"expected":0.85,"high":1},"leadSuccessRate":{"low":0.3,"expected":0.6,"high":1},"verificationDecisiveRate":{"low":0.3,"expected":0.6,"high":1}}');

-- Global feature flags. Apollo stays OFF until commercial_use_approvals has a
-- documented approval row — bring-your-own-key does not remove Apollo's
-- commercial-use restriction for multi-tenant SaaS.
insert into public.feature_flags (key, organization_id, enabled, metadata) values
  ('provider_apify', null, true, '{"note":"Primary Google Maps data source"}'),
  ('provider_fixture', null, true, '{"note":"Deterministic local fixture provider; test data only"}'),
  ('provider_outscraper', null, false, '{"note":"Adapter stub; enable after contract tests + smoke test"}'),
  ('provider_prospeo', null, false, '{"note":"Adapter stub; enable after capability manifest verification"}'),
  ('provider_apollo', null, false, '{"note":"BLOCKED: requires documented commercial-use approval (commercial_use_approvals row) before any production enablement"}'),
  ('destinations_webhook', null, false, '{"note":"Outbound destinations land in a later phase"}'),
  ('destinations_google_sheets', null, false, '{}'),
  ('outreach_module', null, false, '{"note":"No automatic outreach in this release by policy"}');

-- Role-permission documentation rows (authoritative matrix lives in
-- packages/core/src/permissions.ts; keep in sync).
insert into public.role_permissions (role, permission) values
  ('owner','org:manage'),('owner','org:transfer'),('owner','org:delete'),
  ('owner','members:manage'),('owner','members:invite'),('owner','integrations:manage'),
  ('owner','integrations:read'),('owner','searches:run'),('owner','searches:read'),
  ('owner','records:read'),('owner','records:edit'),('owner','enrich:run'),
  ('owner','lists:manage'),('owner','exports:create'),('owner','exports:download'),
  ('owner','destinations:sync'),('owner','usage:read'),('owner','audit:read'),('owner','limits:manage'),
  ('admin','org:manage'),('admin','members:manage'),('admin','members:invite'),
  ('admin','integrations:manage'),('admin','integrations:read'),('admin','searches:run'),
  ('admin','searches:read'),('admin','records:read'),('admin','records:edit'),
  ('admin','enrich:run'),('admin','lists:manage'),('admin','exports:create'),
  ('admin','exports:download'),('admin','destinations:sync'),('admin','usage:read'),
  ('admin','audit:read'),('admin','limits:manage'),
  ('researcher','integrations:read'),('researcher','searches:run'),('researcher','searches:read'),
  ('researcher','records:read'),('researcher','records:edit'),('researcher','enrich:run'),
  ('researcher','lists:manage'),('researcher','usage:read'),
  ('operations','integrations:read'),('operations','searches:read'),('operations','records:read'),
  ('operations','records:edit'),('operations','lists:manage'),('operations','destinations:sync'),
  ('operations','exports:create'),('operations','exports:download'),('operations','usage:read'),
  ('viewer','searches:read'),('viewer','records:read'),('viewer','usage:read');
