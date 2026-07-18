import 'server-only';
import {
  countBillableFilters,
  estimateRunCost,
  estimateYelpRunCost,
  fixtureRateCard,
  type CostEstimate,
  type RateCard,
  type SearchConfig,
} from '@leadfinder/core';
import { createSupabaseServerClient } from './supabase/server';

/**
 * Resolve the rate-card lookup key for a connection. Apify cards are scoped
 * per actor + plan tier; Outscraper has one flat pay-as-you-go card.
 */
export function rateCardKeyFor(
  provider: string,
  config: { actorId?: string; planTier?: string },
): { scope: string; planTier: string } {
  if (provider === 'outscraper') {
    return { scope: 'google-maps', planTier: 'pay_as_you_go' };
  }
  if (provider === 'yelp_apify') {
    // The approved Yelp Actor is priced flat pay-per-event across Apify plans.
    return { scope: 'memo23/yelp-scraper', planTier: 'pay_per_event' };
  }
  return {
    scope: config.actorId ?? 'compass/crawler-google-places',
    planTier: config.planTier ?? 'starter',
  };
}

/**
 * Load the active versioned rate card for a provider connection and compute
 * the low/expected/high estimate. Rate cards live in the database so admins
 * can publish new versions; the card version is stored with the run.
 */
export async function loadRateCard(
  provider: string,
  scope: string,
  planTier: string,
): Promise<{ card: RateCard; id: string | null }> {
  if (provider === 'fixture') {
    return { card: fixtureRateCard(), id: null };
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('provider_rate_cards')
    .select('*')
    .eq('provider', provider)
    .eq('scope', scope)
    .eq('plan_tier', planTier)
    .eq('active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new Error(
      `No active rate card for ${provider}/${scope} (${planTier}). An admin must publish one.`,
    );
  }
  return {
    card: {
      provider: data.provider,
      scope: data.scope,
      planTier: data.plan_tier,
      currency: 'USD',
      version: data.version,
      lastVerifiedAt: data.last_verified_at,
      sourceUrl: data.source_url,
      events: data.events,
      assumptions: data.assumptions,
    },
    id: data.id,
  };
}

/** Provider-aware estimate dispatch: Yelp uses its own pay-per-event model. */
export function estimateForConfig(config: SearchConfig, card: RateCard): CostEstimate {
  if (card.provider === 'yelp_apify') {
    const yelp = config.yelp ?? {
      fetchBusinessDetails: true,
      scrapeReviews: false,
      maxReviewsPerBusiness: 10,
    };
    return estimateYelpRunCost(
      {
        maxResults: config.maxResults,
        scrapeReviews: yelp.scrapeReviews,
        maxReviewsPerBusiness: yelp.maxReviewsPerBusiness,
      },
      card,
    );
  }
  return estimateForGoogleMaps(config, card);
}

function estimateForGoogleMaps(config: SearchConfig, card: RateCard): CostEstimate {
  return estimateRunCost(
    {
      maxResults: config.maxResults,
      billableFilterCount: countBillableFilters(config.filters),
      includePlaceDetails: config.includePlaceDetails,
      includeCompanyContacts: config.includeCompanyContacts,
      decisionMakers: {
        enabled: config.decisionMakers.enabled,
        maxContactsPerCompany: config.decisionMakers.maxContactsPerCompany,
        verifyEmails: config.decisionMakers.verifyWorkEmail,
        enrichSocialProfiles: config.decisionMakers.enrichSocialProfiles,
      },
      reviewsPerPlace: config.reviewsPerPlace,
      imagesPerPlace: config.imagesPerPlace,
    },
    card,
  );
}

/** Month-to-date provider spend + remaining budget for the cost panel. */
export async function getBudgetStatus(orgId: string): Promise<{
  monthlyBudgetMicroUsd: number | null;
  perRunCapMicroUsd: number | null;
  spentThisMonthMicroUsd: number;
  remainingMicroUsd: number | null;
  warnAtPercent: number;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: policy } = await supabase
    .from('quota_policies')
    .select('monthly_budget_micro_usd, per_run_cap_micro_usd, warn_at_percent')
    .eq('organization_id', orgId)
    .maybeSingle();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usage } = await supabase
    .from('usage_events')
    .select('cost_micro_usd')
    .eq('organization_id', orgId)
    .gte('occurred_at', monthStart.toISOString());

  const spent = (usage ?? []).reduce((sum, row) => sum + Number(row.cost_micro_usd ?? 0), 0);
  const budget = policy?.monthly_budget_micro_usd ? Number(policy.monthly_budget_micro_usd) : null;
  return {
    monthlyBudgetMicroUsd: budget,
    perRunCapMicroUsd: policy?.per_run_cap_micro_usd ? Number(policy.per_run_cap_micro_usd) : null,
    spentThisMonthMicroUsd: spent,
    remainingMicroUsd: budget !== null ? Math.max(0, budget - spent) : null,
    warnAtPercent: policy?.warn_at_percent ?? 80,
  };
}
