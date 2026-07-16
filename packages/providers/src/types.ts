import type { EmailStatus, MicroUsd, PhoneType, ProviderKind, SearchConfig } from '@leadfinder/core';

/**
 * Provider adapter contracts. The rest of the platform only talks to these
 * interfaces — never to provider response shapes directly.
 */

export interface ProviderCredentials {
  /** Decrypted API token. Exists only in server/worker memory. */
  token: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  accountLabel?: string;
  planHint?: string;
  latencyMs: number;
  /** Redacted, user-safe error description. */
  error?: string;
}

export interface StartRunParams {
  credentials: ProviderCredentials;
  config: SearchConfig;
  /** Hard provider cost cap. The adapter must refuse to start without it. */
  hardCapMicroUsd: MicroUsd;
  /** Actor/source identifier override (falls back to the adapter default). */
  sourceId?: string;
  /** Public callback URL (already containing the high-entropy token) or null to poll. */
  callbackUrl?: string | null;
}

export interface StartRunResult {
  providerRunId: string;
  datasetId?: string;
}

export type ProviderRunState =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'aborted'
  | 'timed_out';

export interface ProviderRunStatus {
  state: ProviderRunState;
  datasetId?: string;
  itemCount?: number;
  /** Authoritative provider-reported usage when available. */
  usageTotalMicroUsd?: MicroUsd;
  startedAt?: string;
  finishedAt?: string;
  /** Redacted, user-safe error description. */
  error?: string;
  /** Redacted metadata for the run detail page. */
  meta?: Record<string, unknown>;
}

export interface DatasetPage {
  items: unknown[];
  offset: number;
  limit: number;
  /** Total item count when the provider reports it. */
  total?: number;
}

/** Normalized company shape produced by adapter mappers. */
export interface MappedCompany {
  canonicalName: string;
  subtitle: string | null;
  primaryCategory: string | null;
  categories: string[];
  description: string | null;
  website: string | null;
  companyEmails: string[];
  companyPhones: string[];
  primaryPhone: string | null;
  companyLinkedinUrl: string | null;
  socialProfiles: Record<string, string[]>;
  fullAddress: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  googleFid: string | null;
  googleCid: string | null;
  rating: number | null;
  reviewCount: number | null;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  priceRange: string | null;
  openingHours: unknown;
  providerRecordId: string | null;
  contacts: MappedContact[];
}

/** Normalized decision-maker shape produced by adapter mappers. */
export interface MappedContact {
  providerPersonId: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  jobTitle: string | null;
  headline: string | null;
  departments: string[];
  seniority: string | null;
  workEmail: string | null;
  workEmailStatus: EmailStatus;
  phone: string | null;
  phoneType: PhoneType;
  personalLinkedinUrl: string | null;
  companyLinkedinUrl: string | null;
  personLocation: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  companySize: string | null;
}

export interface MapResult {
  company: MappedCompany;
  /** Items the mapper could not validate (kept for provenance, counted as rejected). */
  warnings: string[];
}

export interface CapabilityManifest {
  provider: ProviderKind;
  companyCollection: boolean;
  companyContactEnrichment: boolean;
  decisionMakerDiscovery: boolean;
  emailVerification: boolean;
  phoneEnrichment: boolean;
  /** Human-readable notes shown on the integration card. */
  notes: string[];
}

/** Google-Maps-style company data source adapter. */
export interface MapsProviderAdapter {
  readonly provider: ProviderKind;
  readonly defaultSourceId: string;
  capabilities(): CapabilityManifest;
  testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult>;
  startRun(params: StartRunParams): Promise<StartRunResult>;
  getRunStatus(
    credentials: ProviderCredentials,
    providerRunId: string,
  ): Promise<ProviderRunStatus>;
  abortRun(credentials: ProviderCredentials, providerRunId: string): Promise<void>;
  fetchDatasetPage(
    credentials: ProviderCredentials,
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<DatasetPage>;
  /** Map one raw dataset item into the normalized shape. Returns null when invalid. */
  mapItem(raw: unknown, context: MapContext): MapResult | null;
}

export interface MapContext {
  /** Whether the confirmed run requested decisive email verification. */
  verificationRequested: boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'auth'
      | 'rate_limit'
      | 'not_found'
      | 'invalid_input'
      | 'provider_unavailable'
      | 'feature_gated'
      | 'unknown',
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
