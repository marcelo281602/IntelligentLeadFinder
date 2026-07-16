# Data model

Schema lives in `supabase/migrations/` (append-only). 53 tables; every
tenant-owned table has `organization_id uuid NOT NULL` and RLS enabled.
Enums mirror `packages/core/src/types.ts` — keep both in sync.

## Table groups

| Group          | Tables                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Identity       | organizations, user_profiles, organization_memberships, invitations, role_permissions                                       |
| Integrations   | integration_connections, integration_secret_versions (deny-all), integration_health_checks, provider_rate_cards, provider_capabilities, feature_flags, commercial_use_approvals, quota_policies |
| Search & jobs  | search_projects, search_queries, search_runs, search_run_stages, provider_jobs (deny-all), provider_webhook_inbox (deny-all), provider_raw_records |
| Records        | companies, company_dedupe_keys, company_sources, company_emails, company_phones, company_social_profiles, contacts, contact_dedupe_keys, contact_sources, contact_emails, contact_phones |
| Enrichment     | enrichment_requests, enrichment_results, duplicate_candidates, merge_events                                                 |
| Organization   | lists, list_companies, list_contacts, tags, company_tags, contact_tags, notes, custom_field_definitions, custom_field_values |
| Output         | exports, export_items, destination_syncs, destination_sync_items                                                            |
| Metering       | usage_events (unique idempotency_key), cost_ledger (unique run_id)                                                          |
| Compliance     | suppression_entries, data_subject_requests, audit_logs (append-only), security_events, notifications                        |

## Field-truthfulness invariants

- `companies.primary_email` is the **company** email; `contacts.work_email` is
  the **decision-maker** email. They are different columns in different tables
  and the UI labels them accordingly.
- `contacts.personal_linkedin_url` vs `contacts.company_linkedin_url`: distinct
  provider fields (`linkedinProfile` vs `companyLinkedin`), stored separately.
- `email_status` enum: found, verified, unverified, catch_all, inferred,
  invalid, unavailable, provider_error, not_requested. "not_requested" (never
  paid for the lookup) is never conflated with "unavailable" (provider had
  nothing).
- `is_fixture` on companies/contacts/runs — test data is flagged at the row
  level and labeled in every UI surface and exportable as a column.

## Key constraints

- `companies`: unique `(organization_id, google_place_id)` (partial, live rows);
  indexed by org+domain, org+phone-E.164, org+normalized-name.
- `company_dedupe_keys` / `contact_dedupe_keys`: PK `(organization_id, key)` —
  the deterministic entity-resolution index.
- `search_runs.hard_cap_micro_usd` CHECK > 0; unique `(organization_id, idempotency_key)`.
- `provider_raw_records`: unique `(run_id, payload_hash)`, `ordinal` for
  deterministic processing order, `retention_until` enforced by the sweep job.
- Money columns are `bigint` micro-USD. Timestamps are `timestamptz` (UTC).

## Provenance & retention

Every normalized row keeps `company_sources` / `contact_sources` rows
(provider, provider record id, run, retrieval time, permitted use, payload
hash). Raw payloads live in `provider_raw_records` with a short org-configured
retention (default 30 days) and are deleted by `retention_sweep`; normalized
data follows `organizations.data_retention_days`.
