import {
  DEFAULT_APIFY_ACTOR_ID,
  microToUsd,
  type EmailStatus,
  type SearchConfig,
} from '@leadfinder/core';
import { ApifyClient } from './client';
import {
  apifyRunSchema,
  apifyUserSchema,
  placeItemSchema,
  type ApifyGoogleMapsInput,
  type ApifyLead,
  type ApifyPlaceItem,
} from './schemas';
import {
  ProviderError,
  type CapabilityManifest,
  type ConnectionTestResult,
  type DatasetPage,
  type MapContext,
  type MapResult,
  type MappedCompany,
  type MappedContact,
  type MapsProviderAdapter,
  type ProviderCredentials,
  type ProviderRunStatus,
  type StartRunParams,
  type StartRunResult,
} from '../types';

/** Map a 1–5 numeric minimum rating onto the actor's star-filter enum. */
export function minRatingToStars(
  minRating: number | undefined,
): ApifyGoogleMapsInput['placeMinimumStars'] {
  if (minRating === undefined) return undefined;
  if (minRating >= 4.5) return 'fourAndHalf';
  if (minRating >= 4) return 'four';
  if (minRating >= 3.5) return 'threeAndHalf';
  if (minRating >= 3) return 'three';
  if (minRating >= 2.5) return 'twoAndHalf';
  if (minRating >= 2) return 'two';
  return '';
}

/**
 * Build verified actor input from a validated SearchConfig. Only the first
 * location is used per run (multi-location searches fan out to one run per
 * location at the orchestration layer; v1 restricts the UI to one location).
 */
export function buildActorInput(config: SearchConfig): ApifyGoogleMapsInput {
  const location = config.locations[0];
  if (!location) throw new ProviderError('Search has no location.', 'invalid_input', false);

  const input: ApifyGoogleMapsInput = {
    searchStringsArray: [config.searchTerm],
    maxCrawledPlacesPerSearch: config.maxResults,
    language: config.language,
    countryCode: location.countryCode.toLowerCase(),
  };
  if (location.city) input.city = location.city;
  if (location.region) input.state = location.region;
  // The actor warns against combining postal code with city.
  if (location.postalCode && !location.city) input.postalCode = location.postalCode;
  if (location.latitude !== undefined && location.longitude !== undefined && location.radiusKm) {
    input.customGeolocation = {
      type: 'Point',
      coordinates: [location.longitude, location.latitude],
      radiusKm: location.radiusKm,
    };
  }

  const filters = config.filters;
  const stars = minRatingToStars(filters.minRating);
  if (stars) input.placeMinimumStars = stars;
  if (filters.requireWebsite) input.website = 'withWebsite';
  if (filters.excludeTemporarilyClosed && filters.excludePermanentlyClosed) {
    input.skipClosedPlaces = true;
  }
  if (filters.includeCategories.length > 0) input.categoryFilterWords = filters.includeCategories;

  if (config.includePlaceDetails) input.scrapePlaceDetailPage = true;
  if (config.includeCompanyContacts) input.scrapeContacts = true;

  const dm = config.decisionMakers;
  if (dm.enabled) {
    input.maximumLeadsEnrichmentRecords = dm.maxContactsPerCompany;
    if (dm.targetDepartments.length > 0) input.leadsEnrichmentDepartments = dm.targetDepartments;
    if (dm.verifyWorkEmail) input.verifyLeadsEnrichmentEmails = true;
  }

  if (config.reviewsPerPlace > 0) input.maxReviews = config.reviewsPerPlace;
  if (config.imagesPerPlace > 0) input.maxImages = config.imagesPerPlace;
  return input;
}

/**
 * Truthful email-status mapping from the actor's verification result.
 * No verification requested → the email is merely "found".
 */
export function mapEmailStatus(lead: ApifyLead, verificationRequested: boolean): EmailStatus {
  if (!lead.email) return verificationRequested ? 'unavailable' : 'not_requested';
  const result = lead.emailVerification?.result;
  if (!verificationRequested || result === undefined) return 'found';
  switch (result) {
    case 'ok':
      return 'verified';
    case 'catch_all':
      return 'catch_all';
    case 'unknown':
      return 'unverified';
    case 'invalid':
    case 'disposable':
      return 'invalid';
    case 'error':
      return 'provider_error';
    default:
      return 'unverified';
  }
}

function mapLead(lead: ApifyLead, verificationRequested: boolean): MappedContact | null {
  const fullName =
    lead.fullName ?? [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim();
  if (!fullName) return null; // never fabricate a person
  return {
    providerPersonId: lead.personId ?? null,
    firstName: lead.firstName ?? null,
    lastName: lead.lastName ?? null,
    fullName,
    jobTitle: lead.jobTitle ?? null,
    headline: lead.headline ?? null,
    departments: lead.departments ?? [],
    seniority: lead.seniority ?? null,
    workEmail: lead.email ?? null,
    workEmailStatus: mapEmailStatus(lead, verificationRequested),
    phone: lead.mobileNumber ?? null,
    phoneType: lead.mobileNumber ? 'mobile' : 'unknown',
    // Personal profile and employer page are distinct provider fields —
    // they are stored separately and never conflated.
    personalLinkedinUrl: lead.linkedinProfile ?? null,
    companyLinkedinUrl: lead.companyLinkedin ?? null,
    personLocation: [lead.city, lead.state, lead.country].filter(Boolean).join(', ') || null,
    companyName: lead.companyName ?? null,
    companyWebsite: lead.companyWebsite ?? null,
    companySize: lead.companySize ?? null,
  };
}

export function mapPlaceItem(raw: unknown, verificationRequested: boolean): MapResult | null {
  const parsed = placeItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item: ApifyPlaceItem = parsed.data;
  const warnings: string[] = [];

  const contacts: MappedContact[] = [];
  for (const lead of item.leadsEnrichment ?? []) {
    const mapped = mapLead(lead, verificationRequested);
    if (mapped) contacts.push(mapped);
    else warnings.push('Skipped a lead without any name fields');
  }

  const socialProfiles: Record<string, string[]> = {};
  const socials: Array<[string, string[] | null | undefined]> = [
    ['instagram', item.instagrams],
    ['facebook', item.facebooks],
    ['twitter', item.twitters],
    ['youtube', item.youtubes],
    ['tiktok', item.tiktoks],
  ];
  for (const [network, urls] of socials) {
    if (urls && urls.length > 0) socialProfiles[network] = urls;
  }

  const company: MappedCompany = {
    canonicalName: item.title,
    subtitle: item.subTitle ?? null,
    primaryCategory: item.categoryName ?? null,
    categories: item.categories ?? [],
    description: item.description ?? null,
    website: item.website ?? null,
    companyEmails: item.emails ?? [],
    companyPhones: [
      ...(item.phoneUnformatted ? [item.phoneUnformatted] : []),
      ...(item.phones ?? []),
    ],
    primaryPhone: item.phoneUnformatted ?? item.phone ?? null,
    companyLinkedinUrl: item.linkedIns?.[0] ?? null,
    socialProfiles,
    fullAddress: item.address ?? null,
    street: item.street ?? null,
    neighborhood: item.neighborhood ?? null,
    city: item.city ?? null,
    region: item.state ?? null,
    postalCode: item.postalCode ?? null,
    countryCode: item.countryCode ? item.countryCode.toUpperCase() : null,
    latitude: item.location?.lat ?? null,
    longitude: item.location?.lng ?? null,
    googlePlaceId: item.placeId ?? null,
    googleMapsUrl: item.url ?? null,
    googleFid: item.fid ?? null,
    googleCid: item.cid ?? null,
    rating: item.totalScore ?? null,
    reviewCount: item.reviewsCount ?? null,
    permanentlyClosed: item.permanentlyClosed ?? false,
    temporarilyClosed: item.temporarilyClosed ?? false,
    priceRange: item.price ?? null,
    openingHours: item.openingHours ?? null,
    providerRecordId: item.placeId ?? null,
    contacts,
  };
  return { company, warnings };
}

export class ApifyGoogleMapsAdapter implements MapsProviderAdapter {
  readonly provider = 'apify' as const;
  readonly defaultSourceId = DEFAULT_APIFY_ACTOR_ID;

  capabilities(): CapabilityManifest {
    return {
      provider: 'apify',
      companyCollection: true,
      companyContactEnrichment: true,
      decisionMakerDiscovery: true,
      emailVerification: true,
      phoneEnrichment: true,
      notes: [
        'Google Maps business data via the maintained actor',
        'Business Leads enrichment is opt-in and billed per successful lead',
      ],
    };
  }

  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const me = apifyUserSchema.parse(await new ApifyClient({ token: credentials.token }).getMe());
      const plan =
        typeof me.plan === 'string'
          ? me.plan
          : ((me.plan as { id?: string } | undefined)?.id ?? '');
      return {
        ok: true,
        accountLabel: me.username ?? 'Apify account',
        planHint: plan || undefined,
        latencyMs: Date.now() - started,
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
        'Refusing to start an Apify run without a positive hard cost cap.',
        'invalid_input',
        false,
      );
    }
    const input = buildActorInput(params.config);
    const client = new ApifyClient({ token: params.credentials.token });
    const webhooks = params.callbackUrl
      ? [
          {
            eventTypes: [
              'ACTOR.RUN.SUCCEEDED',
              'ACTOR.RUN.FAILED',
              'ACTOR.RUN.ABORTED',
              'ACTOR.RUN.TIMED_OUT',
            ],
            requestUrl: params.callbackUrl,
          },
        ]
      : undefined;
    const run = apifyRunSchema.parse(
      await client.startActorRun({
        actorId: params.sourceId ?? this.defaultSourceId,
        input,
        maxTotalChargeUsd: microToUsd(params.hardCapMicroUsd).toFixed(2),
        webhooks,
      }),
    );
    return { providerRunId: run.id, datasetId: run.defaultDatasetId };
  }

  async getRunStatus(
    credentials: ProviderCredentials,
    providerRunId: string,
  ): Promise<ProviderRunStatus> {
    const client = new ApifyClient({ token: credentials.token });
    const run = apifyRunSchema.parse(await client.getRun(providerRunId));
    const stateMap: Record<string, ProviderRunStatus['state']> = {
      READY: 'running',
      RUNNING: 'running',
      'TIMING-OUT': 'running',
      ABORTING: 'running',
      SUCCEEDED: 'succeeded',
      FAILED: 'failed',
      ABORTED: 'aborted',
      'TIMED-OUT': 'timed_out',
    };
    return {
      state: stateMap[run.status] ?? 'running',
      datasetId: run.defaultDatasetId,
      usageTotalMicroUsd:
        run.usageTotalUsd !== null && run.usageTotalUsd !== undefined
          ? Math.round(run.usageTotalUsd * 1_000_000)
          : undefined,
      startedAt: run.startedAt ?? undefined,
      finishedAt: run.finishedAt ?? undefined,
      error: run.status === 'FAILED' ? (run.statusMessage ?? 'Actor run failed') : undefined,
      meta: { status: run.status, statusMessage: run.statusMessage ?? null },
    };
  }

  async abortRun(credentials: ProviderCredentials, providerRunId: string): Promise<void> {
    await new ApifyClient({ token: credentials.token }).abortRun(providerRunId);
  }

  async fetchDatasetPage(
    credentials: ProviderCredentials,
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<DatasetPage> {
    const client = new ApifyClient({ token: credentials.token });
    const { items, total } = await client.getDatasetItems(datasetId, offset, limit);
    return { items, offset, limit, total };
  }

  mapItem(raw: unknown, context: MapContext): MapResult | null {
    return mapPlaceItem(raw, context.verificationRequested);
  }
}
