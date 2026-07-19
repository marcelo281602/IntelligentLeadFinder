import type { EstimatorAssumptions, RateCard } from './rate-cards';
import { formatMicroUsd, MICRO_USD_PER_USD, type MicroUsd } from './types';

/**
 * Provider-aware cost estimator (Module 4).
 *
 * Produces low / expected / high totals because successful enrichments and
 * decisive verifications are outcome-based charges that cannot be known in
 * advance. All math is integer micro-USD.
 */

export interface EstimateInput {
  /** Requested maximum companies (the paid-item cap sent to the provider). */
  maxResults: number;
  /** Number of billable provider-side filters the user enabled. */
  billableFilterCount: number;
  /** Request additional place details for every place. */
  includePlaceDetails: boolean;
  /** Company contact enrichment (emails / social from websites). */
  includeCompanyContacts: boolean;
  /** Decision-maker (business leads) enrichment enabled. */
  decisionMakers: {
    enabled: boolean;
    maxContactsPerCompany: number;
    verifyEmails: boolean;
    enrichSocialProfiles: boolean;
  };
  /** Reviews requested per place (0 disables). */
  reviewsPerPlace: number;
  /** Images requested per place (0 disables). */
  imagesPerPlace: number;
}

export interface EstimateLine {
  eventKey: string;
  label: string;
  /** Units at the "expected" scenario, for display. */
  expectedUnits: number;
  perUnitMicroUsd: MicroUsd;
  low: MicroUsd;
  expected: MicroUsd;
  high: MicroUsd;
}

export interface CostEstimate {
  currency: 'USD';
  rateCardVersion: number;
  rateCardLastVerifiedAt: string;
  lines: EstimateLine[];
  totalLow: MicroUsd;
  totalExpected: MicroUsd;
  totalHigh: MicroUsd;
  /** Server-recommended hard cap: high estimate + 15% headroom, whole cents. */
  recommendedCapMicroUsd: MicroUsd;
  assumptions: EstimatorAssumptions;
  /** Estimated companies at each scenario. */
  estimatedCompanies: { low: number; expected: number; high: number };
  /** Estimated decision-maker records at each scenario (0 when disabled). */
  estimatedContacts: { low: number; expected: number; high: number };
}

function ceilToCents(micro: MicroUsd): MicroUsd {
  const cent = MICRO_USD_PER_USD / 100;
  return Math.ceil(micro / cent) * cent;
}

function rate(card: RateCard, eventKey: string): MicroUsd {
  return card.events[eventKey] ?? 0;
}

export function estimateRunCost(input: EstimateInput, card: RateCard): CostEstimate {
  if (!Number.isInteger(input.maxResults) || input.maxResults <= 0) {
    throw new Error('maxResults must be a positive integer');
  }
  const a = card.assumptions;

  const places = {
    low: Math.max(1, Math.round(input.maxResults * a.placeFillRate.low)),
    expected: Math.max(1, Math.round(input.maxResults * a.placeFillRate.expected)),
    high: Math.round(input.maxResults * a.placeFillRate.high),
  };

  const dm = input.decisionMakers;
  const leadCeiling = (n: number) => n * Math.max(0, dm.maxContactsPerCompany);
  const leads = dm.enabled
    ? {
        low: Math.round(leadCeiling(places.low) * a.leadSuccessRate.low),
        expected: Math.round(leadCeiling(places.expected) * a.leadSuccessRate.expected),
        high: Math.round(leadCeiling(places.high) * a.leadSuccessRate.high),
      }
    : { low: 0, expected: 0, high: 0 };

  const verifications =
    dm.enabled && dm.verifyEmails
      ? {
          low: Math.round(leads.low * a.verificationDecisiveRate.low),
          expected: Math.round(leads.expected * a.verificationDecisiveRate.expected),
          high: leads.high,
        }
      : { low: 0, expected: 0, high: 0 };

  const lines: EstimateLine[] = [];

  const push = (
    eventKey: string,
    label: string,
    units: { low: number; expected: number; high: number },
  ) => {
    const per = rate(card, eventKey);
    if (per === 0 && units.expected === 0) return;
    lines.push({
      eventKey,
      label,
      expectedUnits: units.expected,
      perUnitMicroUsd: per,
      low: per * units.low,
      expected: per * units.expected,
      high: per * units.high,
    });
  };

  push('place_scraped', 'Scraped places', places);

  if (input.billableFilterCount > 0) {
    push('filter_applied', `Billable filters (×${input.billableFilterCount})`, {
      low: places.low * input.billableFilterCount,
      expected: places.expected * input.billableFilterCount,
      high: places.high * input.billableFilterCount,
    });
  }

  if (input.includePlaceDetails) {
    push('place_details', 'Additional place details', places);
  }

  if (input.includeCompanyContacts) {
    push('company_contacts', 'Company contact enrichment', places);
  }

  if (dm.enabled) {
    push('business_lead', 'Extracted decision-maker leads', leads);
    if (dm.verifyEmails) {
      push('email_verification', 'Decisive email verifications', verifications);
    }
    if (dm.enrichSocialProfiles) {
      push('social_profile', 'Social profiles enriched', leads);
    }
  }

  if (input.reviewsPerPlace > 0) {
    push('review_scraped', `Reviews (${input.reviewsPerPlace}/place)`, {
      low: places.low * input.reviewsPerPlace,
      expected: places.expected * input.reviewsPerPlace,
      high: places.high * input.reviewsPerPlace,
    });
  }

  if (input.imagesPerPlace > 0) {
    push('image_scraped', `Images (${input.imagesPerPlace}/place)`, {
      low: places.low * input.imagesPerPlace,
      expected: places.expected * input.imagesPerPlace,
      high: places.high * input.imagesPerPlace,
    });
  }

  const totalLow = lines.reduce((sum, l) => sum + l.low, 0);
  const totalExpected = lines.reduce((sum, l) => sum + l.expected, 0);
  const totalHigh = lines.reduce((sum, l) => sum + l.high, 0);

  return {
    currency: 'USD',
    rateCardVersion: card.version,
    rateCardLastVerifiedAt: card.lastVerifiedAt,
    lines,
    totalLow,
    totalExpected,
    totalHigh,
    recommendedCapMicroUsd: ceilToCents(Math.round(totalHigh * 1.15)),
    assumptions: a,
    estimatedCompanies: places,
    estimatedContacts: leads,
  };
}

export interface YelpEstimateInput {
  /** Requested maximum business results (the maxItems cap sent to the Actor). */
  maxResults: number;
  scrapeReviews: boolean;
  maxReviewsPerBusiness: number;
}

/**
 * Yelp-via-Apify estimator (memo23/yelp-scraper pay-per-event pricing):
 * emitted business results + one Actor start + optional review details.
 * Email enrichment is never estimated — its event price is unpublished, and
 * the option stays disabled until an admin verifies a rate.
 */
export function estimateYelpRunCost(input: YelpEstimateInput, card: RateCard): CostEstimate {
  if (!Number.isInteger(input.maxResults) || input.maxResults <= 0) {
    throw new Error('maxResults must be a positive integer');
  }
  const a = card.assumptions;

  const results = {
    low: Math.max(1, Math.round(input.maxResults * a.placeFillRate.low)),
    expected: Math.max(1, Math.round(input.maxResults * a.placeFillRate.expected)),
    high: Math.round(input.maxResults * a.placeFillRate.high),
  };

  const lines: EstimateLine[] = [];
  const push = (
    eventKey: string,
    label: string,
    units: { low: number; expected: number; high: number },
  ) => {
    const per = rate(card, eventKey);
    if (per === 0 && units.expected === 0) return;
    lines.push({
      eventKey,
      label,
      expectedUnits: units.expected,
      perUnitMicroUsd: per,
      low: per * units.low,
      expected: per * units.expected,
      high: per * units.high,
    });
  };

  push('business_result', 'Yelp business results', results);
  push('actor_start', 'Actor start', { low: 1, expected: 1, high: 1 });

  if (input.scrapeReviews && input.maxReviewsPerBusiness > 0) {
    push('review_detail', `Review details (${input.maxReviewsPerBusiness}/business)`, {
      low: results.low * input.maxReviewsPerBusiness,
      expected: results.expected * input.maxReviewsPerBusiness,
      high: results.high * input.maxReviewsPerBusiness,
    });
  }

  const totalLow = lines.reduce((sum, l) => sum + l.low, 0);
  const totalExpected = lines.reduce((sum, l) => sum + l.expected, 0);
  const totalHigh = lines.reduce((sum, l) => sum + l.high, 0);

  return {
    currency: 'USD',
    rateCardVersion: card.version,
    rateCardLastVerifiedAt: card.lastVerifiedAt,
    lines,
    totalLow,
    totalExpected,
    totalHigh,
    recommendedCapMicroUsd: ceilToCents(Math.round(totalHigh * 1.15)),
    assumptions: a,
    estimatedCompanies: results,
    estimatedContacts: { low: 0, expected: 0, high: 0 },
  };
}

/**
 * Validate a user-chosen hard cap against the estimate and org entitlements.
 * Users may lower the cap, never raise it beyond the entitlement ceiling.
 */
export function validateHardCap(params: {
  requestedCapMicroUsd: MicroUsd;
  estimate: CostEstimate;
  orgPerRunCapMicroUsd: MicroUsd | null;
  orgRemainingMonthlyBudgetMicroUsd: MicroUsd | null;
  /** Provider-enforced minimum charge per run (e.g. Apify's $0.50 floor). */
  providerMinimumCapMicroUsd?: MicroUsd | null;
}): { ok: true; capMicroUsd: MicroUsd } | { ok: false; reason: string } {
  const {
    requestedCapMicroUsd,
    estimate,
    orgPerRunCapMicroUsd,
    orgRemainingMonthlyBudgetMicroUsd,
    providerMinimumCapMicroUsd,
  } = params;
  if (!Number.isInteger(requestedCapMicroUsd) || requestedCapMicroUsd <= 0) {
    return { ok: false, reason: 'Cap must be a positive amount.' };
  }
  if (requestedCapMicroUsd < estimate.totalLow) {
    return {
      ok: false,
      reason: 'Cap is below the low estimate — the run would be cut off immediately.',
    };
  }
  if (providerMinimumCapMicroUsd != null && requestedCapMicroUsd < providerMinimumCapMicroUsd) {
    return {
      ok: false,
      reason: `The provider requires a spending cap of at least ${formatMicroUsd(providerMinimumCapMicroUsd)} per run — it rejects anything lower.`,
    };
  }
  if (orgPerRunCapMicroUsd !== null && requestedCapMicroUsd > orgPerRunCapMicroUsd) {
    return { ok: false, reason: 'Cap exceeds the organization per-run limit.' };
  }
  if (
    orgRemainingMonthlyBudgetMicroUsd !== null &&
    requestedCapMicroUsd > orgRemainingMonthlyBudgetMicroUsd
  ) {
    return { ok: false, reason: 'Cap exceeds the remaining monthly budget.' };
  }
  return { ok: true, capMicroUsd: requestedCapMicroUsd };
}
