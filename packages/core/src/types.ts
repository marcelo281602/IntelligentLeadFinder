/**
 * Shared domain types. These mirror the Postgres enums defined in the
 * migrations — keep both in sync (see supabase/migrations).
 */

export const ORG_ROLES = ['owner', 'admin', 'researcher', 'operations', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const RUN_STATUSES = [
  'draft',
  'estimating',
  'awaiting_confirmation',
  'queued',
  'starting',
  'running',
  'ingesting',
  'normalizing',
  'deduplicating',
  'enriching',
  'export_ready',
  'completed',
  'partially_completed',
  'cancellation_requested',
  'cancelled',
  'failed',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const EMAIL_STATUSES = [
  'found',
  'verified',
  'unverified',
  'catch_all',
  'inferred',
  'invalid',
  'unavailable',
  'provider_error',
  'not_requested',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const PHONE_TYPES = ['company', 'direct', 'mobile', 'unknown'] as const;
export type PhoneType = (typeof PHONE_TYPES)[number];

export const LEAD_STATUSES = [
  'new',
  'reviewing',
  'qualified',
  'not_a_fit',
  'contacted_externally',
  'suppressed',
  'archived',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PROVIDER_KINDS = [
  'apify',
  'yelp_apify',
  'outscraper',
  'apollo',
  'prospeo',
  'fixture',
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_CATEGORY = {
  apify: 'data_source',
  // Separate Yelp-via-Apify integration: its own connections, secrets, rate
  // cards, and runs. Same Apify platform, never the same connection record.
  yelp_apify: 'data_source',
  outscraper: 'data_source',
  apollo: 'enrichment',
  prospeo: 'enrichment',
  fixture: 'data_source',
} as const satisfies Record<ProviderKind, 'data_source' | 'enrichment'>;

export const JOB_KINDS = [
  'run_search',
  'ingest_dataset',
  'normalize_run',
  'dedupe_run',
  'enrich_run',
  'reconcile_costs',
  'generate_export',
  'sync_destination',
  'test_connection',
  'retention_sweep',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const DESTINATION_KINDS = ['google_sheets', 'webhook', 'n8n', 'make', 'zapier'] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const DESTINATION_LABELS: Record<DestinationKind, string> = {
  google_sheets: 'Google Sheets',
  webhook: 'Webhook',
  n8n: 'n8n',
  make: 'Make',
  zapier: 'Zapier',
};

export const JOB_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead_letter',
  'cancelled',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * Verification / availability state for any externally sourced field.
 * "not_requested" means the user never paid for the lookup; "unavailable"
 * means the provider was asked and had nothing. Never conflate the two.
 */
export type FieldAvailability = 'present' | 'unavailable' | 'provider_error' | 'not_requested';

/** Default editable decision-maker title presets (Module 3). */
export const DEFAULT_DECISION_MAKER_TITLES = [
  'Owner',
  'Founder',
  'Co-Founder',
  'President',
  'Chief Executive Officer',
  'Managing Partner',
  'General Manager',
  'Director of Operations',
  'Operations Manager',
  'Marketing Director',
  'Head of Marketing',
  'Sales Director',
] as const;

/** Micro-USD: 1_000_000 µUSD = 1 USD. All money math uses integers. */
export type MicroUsd = number;

export const MICRO_USD_PER_USD = 1_000_000;

export function usdToMicro(usd: number): MicroUsd {
  return Math.round(usd * MICRO_USD_PER_USD);
}

export function microToUsd(micro: MicroUsd): number {
  return micro / MICRO_USD_PER_USD;
}

/** Format micro-USD for display, e.g. 12_340_000 -> "$12.34". */
export function formatMicroUsd(micro: MicroUsd): string {
  const usd = microToUsd(micro);
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: usd < 1 ? 4 : 2,
  });
}
