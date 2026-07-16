import { describe, expect, it } from 'vitest';
import { estimateRunCost, validateHardCap, type EstimateInput } from '../src/estimator';
import { apifyGoogleMapsRateCard, fixtureRateCard } from '../src/rate-cards';
import { usdToMicro } from '../src/types';

const baseInput: EstimateInput = {
  maxResults: 1000,
  billableFilterCount: 1,
  includePlaceDetails: false,
  includeCompanyContacts: false,
  decisionMakers: {
    enabled: true,
    maxContactsPerCompany: 1,
    verifyEmails: true,
    enrichSocialProfiles: false,
  },
  reviewsPerPlace: 0,
  imagesPerPlace: 0,
};

describe('estimateRunCost', () => {
  it('reproduces the master-prompt example: 1,000 companies on Apify Starter ≈ $13 at full success', () => {
    const card = apifyGoogleMapsRateCard('starter');
    const estimate = estimateRunCost(baseInput, card);
    // High scenario = 100% fill, 1 lead/company, decisive verification per lead:
    // $3 places + $1 filter + $5 leads + $4 verifications = $13.00
    expect(estimate.totalHigh).toBe(usdToMicro(13));
  });

  it('orders low <= expected <= high', () => {
    const estimate = estimateRunCost(baseInput, apifyGoogleMapsRateCard('starter'));
    expect(estimate.totalLow).toBeLessThanOrEqual(estimate.totalExpected);
    expect(estimate.totalExpected).toBeLessThanOrEqual(estimate.totalHigh);
  });

  it('recommends a cap with headroom above the high estimate, rounded to cents', () => {
    const estimate = estimateRunCost(baseInput, apifyGoogleMapsRateCard('starter'));
    expect(estimate.recommendedCapMicroUsd).toBeGreaterThanOrEqual(estimate.totalHigh);
    expect(estimate.recommendedCapMicroUsd % 10_000).toBe(0);
  });

  it('charges nothing for the fixture provider', () => {
    const estimate = estimateRunCost(baseInput, fixtureRateCard());
    expect(estimate.totalHigh).toBe(0);
  });

  it('omits enrichment lines when decision-makers are disabled', () => {
    const estimate = estimateRunCost(
      { ...baseInput, decisionMakers: { ...baseInput.decisionMakers, enabled: false } },
      apifyGoogleMapsRateCard('starter'),
    );
    expect(estimate.lines.find((l) => l.eventKey === 'business_lead')).toBeUndefined();
    expect(estimate.estimatedContacts.high).toBe(0);
  });

  it('scales leads by contacts per company', () => {
    const one = estimateRunCost(baseInput, apifyGoogleMapsRateCard('starter'));
    const three = estimateRunCost(
      { ...baseInput, decisionMakers: { ...baseInput.decisionMakers, maxContactsPerCompany: 3 } },
      apifyGoogleMapsRateCard('starter'),
    );
    expect(three.estimatedContacts.high).toBe(one.estimatedContacts.high * 3);
  });

  it('rejects non-positive maxResults', () => {
    expect(() => estimateRunCost({ ...baseInput, maxResults: 0 }, apifyGoogleMapsRateCard('starter'))).toThrow();
  });

  it('free plan business leads are dramatically more expensive than starter', () => {
    const free = estimateRunCost(baseInput, apifyGoogleMapsRateCard('free'));
    const starter = estimateRunCost(baseInput, apifyGoogleMapsRateCard('starter'));
    expect(free.totalHigh).toBeGreaterThan(starter.totalHigh * 5);
  });
});

describe('validateHardCap', () => {
  const estimate = estimateRunCost(baseInput, apifyGoogleMapsRateCard('starter'));

  it('accepts a cap within all limits', () => {
    const result = validateHardCap({
      requestedCapMicroUsd: estimate.recommendedCapMicroUsd,
      estimate,
      orgPerRunCapMicroUsd: usdToMicro(50),
      orgRemainingMonthlyBudgetMicroUsd: usdToMicro(100),
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a cap below the low estimate', () => {
    const result = validateHardCap({
      requestedCapMicroUsd: 1,
      estimate,
      orgPerRunCapMicroUsd: null,
      orgRemainingMonthlyBudgetMicroUsd: null,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a cap above the org per-run limit', () => {
    const result = validateHardCap({
      requestedCapMicroUsd: usdToMicro(60),
      estimate,
      orgPerRunCapMicroUsd: usdToMicro(50),
      orgRemainingMonthlyBudgetMicroUsd: null,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a cap above the remaining monthly budget', () => {
    const result = validateHardCap({
      requestedCapMicroUsd: usdToMicro(20),
      estimate,
      orgPerRunCapMicroUsd: null,
      orgRemainingMonthlyBudgetMicroUsd: usdToMicro(10),
    });
    expect(result.ok).toBe(false);
  });
});
