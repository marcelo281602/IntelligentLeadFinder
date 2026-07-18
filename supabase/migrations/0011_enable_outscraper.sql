-- Enable the Outscraper Google Maps provider.
-- The adapter now has contract tests (packages/providers/test/outscraper-contract.test.ts)
-- covering request/response mapping, auth-header handling, and cap enforcement.
-- Rate card google-maps/pay_as_you_go was seeded in 0007 and stays authoritative.

update public.feature_flags
set enabled = true,
    metadata = '{"note":"Enabled 2026-07-18 after contract tests; flat $3/1k pay-as-you-go rate card seeded in 0007"}'::jsonb
where key = 'provider_outscraper'
  and organization_id is null;
