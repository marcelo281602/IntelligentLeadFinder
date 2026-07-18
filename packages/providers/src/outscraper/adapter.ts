import type { SearchConfig } from '@leadfinder/core';
import { OutscraperClient } from './client';
import {
  outscraperArchiveSchema,
  outscraperPlaceSchema,
  outscraperSubmitSchema,
  type OutscraperPlace,
  type OutscraperSearchPayload,
} from './schemas';
import {
  ProviderError,
  type CapabilityManifest,
  type ConnectionTestResult,
  type DatasetPage,
  type MapContext,
  type MapResult,
  type MappedCompany,
  type MapsProviderAdapter,
  type ProviderCredentials,
  type ProviderRunStatus,
  type StartRunParams,
  type StartRunResult,
} from '../types';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Build the Outscraper search query string from a validated SearchConfig. */
export function buildOutscraperPayload(config: SearchConfig): OutscraperSearchPayload {
  const location = config.locations[0];
  if (!location) throw new ProviderError('Search has no location.', 'invalid_input', false);
  // Outscraper recommends "term, city, country" free-text queries.
  const locationText = [location.city, location.region, location.countryCode]
    .filter(Boolean)
    .join(', ');
  const query = locationText ? `${config.searchTerm}, ${locationText}` : config.searchTerm;

  const payload: OutscraperSearchPayload = {
    query: [query],
    language: config.language,
    region: location.countryCode,
    organizationsPerQueryLimit: config.maxResults,
    dropDuplicates: true,
    async: true,
  };
  if (location.latitude !== undefined && location.longitude !== undefined) {
    payload.coordinates = `${location.latitude},${location.longitude}`;
  }
  return payload;
}

export function mapOutscraperPlace(raw: unknown): MapResult | null {
  const parsed = outscraperPlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item: OutscraperPlace = parsed.data;

  const status = (item.business_status ?? '').toUpperCase();
  const categories = item.subtypes
    ? item.subtypes.split(',').map((c) => c.trim()).filter(Boolean)
    : item.type
      ? [item.type]
      : [];

  const company: MappedCompany = {
    canonicalName: item.name,
    subtitle: null,
    primaryCategory: item.type ?? item.category ?? null,
    categories,
    description: null,
    website: item.site ?? null,
    companyEmails: item.email_1 ? [item.email_1] : [],
    companyPhones: item.phone ? [item.phone] : [],
    primaryPhone: item.phone ?? null,
    companyLinkedinUrl: item.linkedin ?? null,
    socialProfiles: {},
    fullAddress: item.full_address ?? null,
    street: item.street ?? null,
    neighborhood: item.borough ?? null,
    city: item.city ?? null,
    region: item.state ?? item.us_state ?? null,
    postalCode: item.postal_code !== null && item.postal_code !== undefined ? String(item.postal_code) : null,
    countryCode: item.country_code ? item.country_code.toUpperCase() : null,
    latitude: toNumber(item.latitude),
    longitude: toNumber(item.longitude),
    googlePlaceId: item.place_id ?? null,
    googleMapsUrl: item.location_link ?? null,
    googleFid: null,
    googleCid: item.google_id ?? null,
    rating: toNumber(item.rating),
    reviewCount: toNumber(item.reviews),
    permanentlyClosed: status.includes('PERMANENTLY'),
    temporarilyClosed: status.includes('TEMPORARILY'),
    priceRange: null,
    openingHours: null,
    providerRecordId: item.place_id ?? item.google_id ?? null,
    contacts: [],
  };
  return { company, warnings: [] };
}

/** Flatten Outscraper's array-per-query data into a single place list. */
function flattenData(data: unknown[] | null | undefined): unknown[] {
  if (!Array.isArray(data)) return [];
  if (data.length > 0 && Array.isArray(data[0])) {
    return (data as unknown[][]).flat();
  }
  return data;
}

export class OutscraperMapsAdapter implements MapsProviderAdapter {
  readonly provider = 'outscraper' as const;
  readonly defaultSourceId = 'google-maps';

  capabilities(): CapabilityManifest {
    return {
      provider: 'outscraper',
      companyCollection: true,
      companyContactEnrichment: false,
      decisionMakerDiscovery: false,
      emailVerification: false,
      phoneEnrichment: false,
      notes: [
        'Lower-cost Google Maps business data (flat per-place pricing)',
        'No decision-maker discovery — pair with an enrichment provider for contacts',
      ],
    };
  }

  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const ok = await new OutscraperClient({ apiKey: credentials.token }).validateKey();
      return {
        ok,
        accountLabel: ok ? 'Outscraper account' : undefined,
        latencyMs: Date.now() - started,
        error: ok ? undefined : 'Outscraper rejected the API key.',
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof ProviderError ? error.message : 'Connection test failed.',
      };
    }
  }

  async startRun(params: StartRunParams): Promise<StartRunResult> {
    if (!Number.isInteger(params.hardCapMicroUsd) || params.hardCapMicroUsd <= 0) {
      throw new ProviderError(
        'Refusing to start an Outscraper run without a positive hard cost cap.',
        'invalid_input',
        false,
      );
    }
    // Outscraper has no server-side spend cap; cost is bounded by the item
    // limit (flat per-place pricing), which was validated against the hard cap
    // at confirmation time.
    const payload = buildOutscraperPayload(params.config);
    const submit = outscraperSubmitSchema.parse(
      await new OutscraperClient({ apiKey: params.credentials.token }).submitSearch(payload),
    );
    return { providerRunId: submit.id, datasetId: submit.id };
  }

  async getRunStatus(
    credentials: ProviderCredentials,
    providerRunId: string,
  ): Promise<ProviderRunStatus> {
    const archive = outscraperArchiveSchema.parse(
      await new OutscraperClient({ apiKey: credentials.token }).getRequest(providerRunId),
    );
    const status = archive.status.toLowerCase();
    const pending = status === 'pending' || status === 'in progress' || status === 'running';
    const failed = status.includes('fail') || status.includes('error');
    const items = flattenData(archive.data).length;
    return {
      state: pending ? 'running' : failed ? 'failed' : 'succeeded',
      datasetId: providerRunId,
      itemCount: pending ? undefined : items,
      // Outscraper does not return per-request billing; cost is reconciled
      // deterministically from the rate card at the ledger stage.
      usageTotalMicroUsd: undefined,
      finishedAt: pending ? undefined : new Date().toISOString(),
      error: failed ? `Outscraper task ${archive.status}` : undefined,
      meta: { status: archive.status },
    };
  }

  async abortRun(): Promise<void> {
    // Outscraper async tasks run to completion; there is no abort endpoint.
    // The pipeline settles local run state regardless.
  }

  async fetchDatasetPage(
    credentials: ProviderCredentials,
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<DatasetPage> {
    const archive = outscraperArchiveSchema.parse(
      await new OutscraperClient({ apiKey: credentials.token }).getRequest(datasetId),
    );
    const all = flattenData(archive.data);
    return { items: all.slice(offset, offset + limit), offset, limit, total: all.length };
  }

  mapItem(raw: unknown, _context: MapContext): MapResult | null {
    return mapOutscraperPlace(raw);
  }
}
