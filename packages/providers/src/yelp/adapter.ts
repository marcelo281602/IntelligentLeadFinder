import { APPROVED_YELP_ACTOR_ID, microToUsd, type SearchConfig } from '@leadfinder/core';
import { ApifyGoogleMapsAdapter } from '../apify/adapter';
import { ApifyClient } from '../apify/client';
import { apifyRunSchema, apifyUserSchema } from '../apify/schemas';
import { yelpBusinessSchema, type YelpActorInput, type YelpBusiness } from './schemas';
import { buildYelpSearchUrl } from './url';
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

/**
 * Separate Yelp-via-Apify integration (Module 7). Reuses the shared Apify
 * client primitives, but is a distinct provider identity: its own
 * connections, encrypted secrets, rate card, runs, and audit trail. It can
 * only ever run the admin-approved Actor — tenant input cannot select a
 * different one — and it never reads the Google Maps Apify connection.
 */

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  // Accepts "509 reviews" / "4.2" / 509.
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Build the server-controlled Actor input. No proxy/concurrency/enrichment overrides. */
export function buildYelpActorInput(config: SearchConfig): YelpActorInput {
  const options = config.yelp ?? {
    fetchBusinessDetails: true,
    scrapeReviews: false,
    maxReviewsPerBusiness: 10,
  };
  const input: YelpActorInput = {
    startUrls: [{ url: buildYelpSearchUrl(config) }],
    maxItems: config.maxResults,
    fetchBusinessDetails: options.fetchBusinessDetails,
    scrapeReviews: options.scrapeReviews,
    enrichEmails: false,
  };
  if (options.scrapeReviews) input.maxReviews = options.maxReviewsPerBusiness;
  return input;
}

/** Map one Actor business row into the normalized company shape. */
export function mapYelpBusiness(raw: unknown, context?: MapContext): MapResult | null {
  const parsed = yelpBusinessSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item: YelpBusiness = parsed.data;

  const categories = item.categories
    ? item.categories.split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  // Only keep a Yelp URL that is actually a yelp.com URL (provenance safety).
  let yelpUrl: string | null = null;
  if (item.url) {
    try {
      const u = new URL(item.url);
      if (u.hostname === 'www.yelp.com' || u.hostname.endsWith('.yelp.com')) {
        yelpUrl = item.url;
      }
    } catch {
      yelpUrl = null;
    }
  }

  const company: MappedCompany = {
    canonicalName: item.title,
    subtitle: null,
    primaryCategory: categories[0] ?? null,
    categories,
    description: null,
    website: item.website ?? null,
    // A contact email discovered from the business website is a COMPANY
    // contact email — never a Yelp-provided or decision-maker email.
    companyEmails: item.contactEmail ? [item.contactEmail] : [],
    companyPhones: item.phoneNumber ? [item.phoneNumber] : [],
    primaryPhone: item.phoneNumber ?? null,
    companyLinkedinUrl: null,
    socialProfiles: {},
    fullAddress: item.fullAddress ?? null,
    street: null,
    neighborhood: null,
    city: item.city ?? null,
    region: item.state ?? null,
    postalCode: item.zipcode !== null && item.zipcode !== undefined ? String(item.zipcode) : null,
    // Yelp rows carry no country; derived safely from the confirmed search
    // location, never guessed from other fields.
    countryCode: context?.defaultCountryCode ?? null,
    latitude: null,
    longitude: null,
    googlePlaceId: null,
    googleMapsUrl: null,
    googleFid: null,
    googleCid: null,
    yelpBusinessId: item.yelp_biz_id ?? null,
    yelpUrl,
    rating: toNumber(item.rating),
    reviewCount: toNumber(item.reviewCount),
    permanentlyClosed: false,
    temporarilyClosed: false,
    priceRange: item.priceLevel ?? null,
    openingHours: item.hours ?? null,
    providerRecordId: item.yelp_biz_id ?? null,
    contacts: [],
  };
  return { company, warnings: [] };
}

export class YelpApifyAdapter implements MapsProviderAdapter {
  readonly provider = 'yelp_apify' as const;
  readonly defaultSourceId = APPROVED_YELP_ACTOR_ID;
  /** Generic Apify run/dataset operations are shared; identity is not. */
  private readonly apify = new ApifyGoogleMapsAdapter();

  capabilities(): CapabilityManifest {
    return {
      provider: 'yelp_apify',
      companyCollection: true,
      companyContactEnrichment: false,
      decisionMakerDiscovery: false,
      emailVerification: false,
      phoneEnrichment: false,
      notes: [
        `Yelp business data via the approved Apify Actor ${APPROVED_YELP_ACTOR_ID}`,
        'Website-email enrichment is disabled: its event price is unpublished',
        'No decision-maker discovery — an owner name on a Yelp page is a sourced candidate, not a verified contact',
      ],
    };
  }

  /** Token check + independent access check on the approved Actor. */
  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const client = new ApifyClient({ token: credentials.token });
      const me = apifyUserSchema.parse(await client.getMe());
      await client.getActor(APPROVED_YELP_ACTOR_ID);
      return {
        ok: true,
        accountLabel: `${me.username ?? 'Apify account'} → ${APPROVED_YELP_ACTOR_ID}`,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error:
          error instanceof ProviderError
            ? `Yelp Actor access failed: ${error.message}`
            : 'Connection test failed.',
      };
    }
  }

  async startRun(params: StartRunParams): Promise<StartRunResult> {
    if (!Number.isInteger(params.hardCapMicroUsd) || params.hardCapMicroUsd <= 0) {
      throw new ProviderError(
        'Refusing to start a Yelp run without a positive hard cost cap.',
        'invalid_input',
        false,
      );
    }
    // Actor allowlist: the approved Actor is bound server-side. Any attempt
    // to smuggle a different Actor id through sourceId is refused, never
    // silently corrected.
    if (params.sourceId && params.sourceId !== APPROVED_YELP_ACTOR_ID) {
      throw new ProviderError(
        `Yelp runs may only use the approved Actor ${APPROVED_YELP_ACTOR_ID}.`,
        'feature_gated',
        false,
      );
    }
    const input = buildYelpActorInput(params.config);
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
        actorId: APPROVED_YELP_ACTOR_ID,
        input,
        maxTotalChargeUsd: microToUsd(params.hardCapMicroUsd).toFixed(2),
        webhooks,
      }),
    );
    return { providerRunId: run.id, datasetId: run.defaultDatasetId };
  }

  getRunStatus(credentials: ProviderCredentials, providerRunId: string): Promise<ProviderRunStatus> {
    return this.apify.getRunStatus(credentials, providerRunId);
  }

  abortRun(credentials: ProviderCredentials, providerRunId: string): Promise<void> {
    return this.apify.abortRun(credentials, providerRunId);
  }

  fetchDatasetPage(
    credentials: ProviderCredentials,
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<DatasetPage> {
    return this.apify.fetchDatasetPage(credentials, datasetId, offset, limit);
  }

  mapItem(raw: unknown, context: MapContext): MapResult | null {
    return mapYelpBusiness(raw, context);
  }
}
