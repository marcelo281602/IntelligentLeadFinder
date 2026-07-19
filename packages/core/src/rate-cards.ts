import { usdToMicro, type MicroUsd, type ProviderKind } from './types';

/**
 * Versioned provider rate cards (Module 4).
 *
 * Prices below were verified from public provider pages on 2026-07-16 and are
 * seeded into the provider_rate_cards table. They are planning estimates, not
 * permanent constants: production reads rate cards from the database where
 * admins can publish new versions; historical versions are retained so old
 * run estimates stay explainable.
 */

export type ApifyPlanTier = 'free' | 'starter' | 'scale' | 'business';

export const APIFY_EVENT_KEYS = [
  'place_scraped',
  'filter_applied',
  'place_details',
  'company_contacts',
  'business_lead',
  'email_verification',
  'social_profile',
  'review_scraped',
  'image_scraped',
] as const;
export type ApifyEventKey = (typeof APIFY_EVENT_KEYS)[number];

export interface RateCard {
  provider: ProviderKind;
  /** e.g. Apify Actor id the card applies to. */
  scope: string;
  planTier: string;
  currency: 'USD';
  version: number;
  lastVerifiedAt: string; // ISO date
  sourceUrl: string;
  /** Per-single-unit price in micro-USD (spec prices are per 1,000 units). */
  events: Record<string, MicroUsd>;
  /** Estimator assumptions bundled with the card so estimates are reproducible. */
  assumptions: EstimatorAssumptions;
}

export interface EstimatorAssumptions {
  /** Fraction of requested places actually found: low/expected/high. */
  placeFillRate: { low: number; expected: number; high: number };
  /** Fraction of companies yielding a successfully extracted business lead. */
  leadSuccessRate: { low: number; expected: number; high: number };
  /** Fraction of found emails producing a decisive verification charge. */
  verificationDecisiveRate: { low: number; expected: number; high: number };
}

const DEFAULT_ASSUMPTIONS: EstimatorAssumptions = {
  placeFillRate: { low: 0.5, expected: 0.85, high: 1.0 },
  leadSuccessRate: { low: 0.3, expected: 0.6, high: 1.0 },
  verificationDecisiveRate: { low: 0.3, expected: 0.6, high: 1.0 },
};

/** Per-1,000-unit USD prices from https://apify.com/compass/crawler-google-places/pricing (verified 2026-07-16). */
const APIFY_GMAPS_PER_1000_USD: Record<ApifyPlanTier, Record<ApifyEventKey, number>> = {
  free: {
    place_scraped: 4.0,
    filter_applied: 1.0,
    place_details: 2.0,
    company_contacts: 2.0,
    business_lead: 100.0,
    email_verification: 100.0,
    social_profile: 100.0,
    review_scraped: 0.5,
    image_scraped: 0.5,
  },
  starter: {
    place_scraped: 3.0,
    filter_applied: 1.0,
    place_details: 2.0,
    company_contacts: 2.0,
    business_lead: 5.0,
    email_verification: 4.0,
    social_profile: 8.0,
    review_scraped: 0.5,
    image_scraped: 0.5,
  },
  scale: {
    place_scraped: 2.0,
    filter_applied: 0.75,
    place_details: 1.5,
    company_contacts: 1.5,
    business_lead: 5.0,
    email_verification: 3.0,
    social_profile: 7.0,
    review_scraped: 0.37,
    image_scraped: 0.37,
  },
  business: {
    place_scraped: 1.5,
    filter_applied: 0.53,
    place_details: 1.05,
    company_contacts: 1.05,
    business_lead: 4.0,
    email_verification: 2.0,
    social_profile: 6.0,
    review_scraped: 0.26,
    image_scraped: 0.26,
  },
};

export const DEFAULT_APIFY_ACTOR_ID = 'compass/crawler-google-places';

/**
 * Apify refuses Actor runs whose maxTotalChargeUsd is below $0.50
 * ("Maximum cost per run is less than the allowed minimum of $0.50" —
 * observed from the live API 2026-07-19). Confirmation must enforce this
 * floor for every Apify-platform provider or the run can never start.
 */
export const APIFY_MIN_RUN_CAP_MICRO_USD: MicroUsd = usdToMicro(0.5);

export function apifyGoogleMapsRateCard(planTier: ApifyPlanTier): RateCard {
  const per1000 = APIFY_GMAPS_PER_1000_USD[planTier];
  const events: Record<string, MicroUsd> = {};
  for (const [key, usdPer1000] of Object.entries(per1000)) {
    events[key] = usdToMicro(usdPer1000 / 1000);
  }
  return {
    provider: 'apify',
    scope: DEFAULT_APIFY_ACTOR_ID,
    planTier,
    currency: 'USD',
    version: 1,
    lastVerifiedAt: '2026-07-16',
    sourceUrl: 'https://apify.com/compass/crawler-google-places/pricing',
    events,
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}

/** Outscraper base pricing (verified 2026-07-16): $3/1,000 after first free 500/mo. */
export function outscraperMapsRateCard(): RateCard {
  return {
    provider: 'outscraper',
    scope: 'google-maps',
    planTier: 'pay_as_you_go',
    currency: 'USD',
    version: 1,
    lastVerifiedAt: '2026-07-16',
    sourceUrl: 'https://outscraper.com/google-maps-scraper/',
    events: { place_scraped: usdToMicro(3 / 1000) },
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}

export const APPROVED_YELP_ACTOR_ID = 'memo23/yelp-scraper';

/**
 * Yelp-via-Apify Actor rate card (pay-per-event, flat across Apify plans).
 * Verified 2026-07-18 from the Actor pricing page: $2.75/1k business results,
 * $1.50/1k review details, $0.009 per Actor start, $20/1k review-insights,
 * $50/1k AI analysis. The optional email-enrichment event has NO published
 * price, so it is deliberately absent — the option stays disabled until an
 * admin verifies and publishes a rate (never estimate against a guess).
 */
export function yelpApifyRateCard(): RateCard {
  return {
    provider: 'yelp_apify',
    scope: APPROVED_YELP_ACTOR_ID,
    planTier: 'pay_per_event',
    currency: 'USD',
    version: 1,
    lastVerifiedAt: '2026-07-18',
    sourceUrl: 'https://apify.com/memo23/yelp-scraper/pricing',
    events: {
      business_result: usdToMicro(2.75 / 1000),
      review_detail: usdToMicro(1.5 / 1000),
      actor_start: usdToMicro(0.009),
      review_insights: usdToMicro(20 / 1000),
      ai_analysis: usdToMicro(50 / 1000),
    },
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}

export type ProspeoPlanTier = 'free' | 'basic' | 'pro' | 'business' | 'corporate';

/**
 * Prospeo per-credit USD (verified 2026-07-18): Free 75 credits/mo ($0),
 * Basic $39/1,000, Pro $99/5,000, Business $199/20,000, Corporate $369/50,000.
 * Email enrichment = 1 credit; mobile = 10 credits. No-match and repeat
 * enrichment within 90 days cost 0.
 */
const PROSPEO_CREDIT_USD: Record<ProspeoPlanTier, number> = {
  free: 0,
  basic: 39 / 1000,
  pro: 99 / 5000,
  business: 199 / 20_000,
  corporate: 369 / 50_000,
};

export function prospeoRateCard(planTier: ProspeoPlanTier): RateCard {
  const credit = PROSPEO_CREDIT_USD[planTier];
  return {
    provider: 'prospeo',
    scope: 'enrich-person',
    planTier,
    currency: 'USD',
    version: 1,
    lastVerifiedAt: '2026-07-18',
    sourceUrl: 'https://prospeo.io/pricing',
    events: {
      email_enrichment: usdToMicro(credit),
      mobile_enrichment: usdToMicro(credit * 10),
    },
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}

/** Fixture provider is free — used for deterministic local preview and tests. */
export function fixtureRateCard(): RateCard {
  return {
    provider: 'fixture',
    scope: 'fixture-google-maps',
    planTier: 'free',
    currency: 'USD',
    version: 1,
    lastVerifiedAt: '2026-07-16',
    sourceUrl: 'internal://fixture',
    events: Object.fromEntries(APIFY_EVENT_KEYS.map((k) => [k, 0])),
    assumptions: DEFAULT_ASSUMPTIONS,
  };
}
