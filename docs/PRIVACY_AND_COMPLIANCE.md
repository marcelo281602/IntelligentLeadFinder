# Privacy & compliance

This platform is a research/organization tool for business data. It does not
send outreach of any kind, and that is a product decision enforced in code
(no sending module exists; `outreach_module` flag is off).

## Data handled

- **Company data**: public business listings (names, addresses, phones,
  websites, ratings) via contracted providers.
- **Personal data**: decision-maker names, titles, work emails, phones,
  LinkedIn URLs — only when a workspace explicitly enables and pays for
  Business Leads enrichment from the provider's licensed dataset.

## Principles implemented

| Principle           | Implementation                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Minimization        | Enrichment is opt-in per search with per-company contact caps; reviews/images/social detail off by default   |
| Purpose limitation  | `permitted_use` recorded on every source row; acceptable-use acknowledgement at onboarding                   |
| Provenance          | Provider, record id, run, retrieval time, payload hash on every company/contact source                       |
| Retention           | Raw payloads: org-configured, default 30 days (hourly sweep). Normalized data: `data_retention_days`. Export files purged after 7 days |
| Access & export logging | Audit events for record exports, download links, downloads                                                |
| Suppression         | `suppression_entries` (email/domain/company) filter future ingestion                                          |
| DSR support         | `data_subject_requests` table + admin UI hooks; deletion workflow operates via soft-delete + retention sweep  |
| Honest labeling     | Verification states are provider-reported; nulls stay null; fixture data is always flagged                    |

## Provider terms (review before commercial launch)

- Google Maps content reaches us via Apify/Outscraper — their terms plus
  Google's restrictions on scraping/bulk storage apply downstream. Legal
  review for target countries is a launch gate (see RELEASE_CHECKLIST).
- LinkedIn: no scraping, no login automation, no session cookies — URLs come
  only from the provider's licensed data or manual entry.
- Apollo: blocked until documented commercial terms permit multi-tenant SaaS
  use (`commercial_use_approvals`).

## What we do NOT claim

No GDPR/CCPA certification is claimed. A lawful basis assessment, DPA with
providers, privacy policy, and country-specific direct-marketing review are
the operator's responsibility before real personal data is processed at scale.
Any future outreach module requires a separate compliance workstream
(CAN-SPAM, TCPA, GDPR/ePrivacy, CASL, PECR) before it is built.
