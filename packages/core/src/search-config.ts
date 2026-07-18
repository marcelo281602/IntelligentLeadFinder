import { z } from 'zod';
import { DEFAULT_DECISION_MAKER_TITLES } from './types';

/**
 * Search configuration schema (Module 3). Validated at every trust boundary:
 * the form, the API, and the worker before building provider input.
 */

export const locationSchema = z.object({
  /** ISO-3166 alpha-2, required. */
  countryCode: z
    .string()
    .length(2)
    .transform((s) => s.toUpperCase()),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  radiusKm: z.number().positive().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type SearchLocation = z.infer<typeof locationSchema>;

export const businessFiltersSchema = z.object({
  minRating: z.number().min(1).max(5).optional(),
  minReviewCount: z.number().int().min(0).optional(),
  maxReviewCount: z.number().int().min(0).optional(),
  requireWebsite: z.boolean().default(false),
  requirePhone: z.boolean().default(false),
  requireCompanyEmail: z.boolean().default(false),
  excludeTemporarilyClosed: z.boolean().default(true),
  excludePermanentlyClosed: z.boolean().default(true),
  includeCategories: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  excludeCategories: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  includeKeywords: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  excludeKeywords: z.array(z.string().trim().min(1).max(100)).max(25).default([]),
  excludeChains: z.boolean().default(false),
  excludeExistingRecords: z.boolean().default(true),
  onePlacePerCompany: z.boolean().default(true),
});
export type BusinessFilters = z.infer<typeof businessFiltersSchema>;

export const decisionMakerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxContactsPerCompany: z.number().int().min(1).max(10).default(1),
  targetTitles: z
    .array(z.string().trim().min(1).max(100))
    .max(30)
    .default([...DEFAULT_DECISION_MAKER_TITLES]),
  targetSeniorities: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  targetDepartments: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  strictTitleMatch: z.boolean().default(false),
  requirePersonalLinkedin: z.boolean().default(false),
  requestWorkEmail: z.boolean().default(true),
  verifyWorkEmail: z.boolean().default(false),
  requestPhone: z.boolean().default(false),
  enrichSocialProfiles: z.boolean().default(false),
  preferredProvider: z.enum(['apify', 'apollo', 'prospeo', 'fixture']).default('apify'),
  fallbackProvider: z.enum(['apify', 'apollo', 'prospeo', 'fixture']).nullable().default(null),
});
export type DecisionMakerConfig = z.infer<typeof decisionMakerConfigSchema>;

/**
 * Yelp-specific options (only meaningful on yelp_apify runs). Email
 * enrichment is intentionally absent: the Actor's live rate card publishes no
 * per-email price, and we never bill against a guessed rate.
 */
export const yelpOptionsSchema = z.object({
  /** Visit each business profile for complete data (hours, website, …). */
  fetchBusinessDetails: z.boolean().default(true),
  scrapeReviews: z.boolean().default(false),
  maxReviewsPerBusiness: z.number().int().min(1).max(100).default(10),
});
export type YelpOptions = z.infer<typeof yelpOptionsSchema>;

export const searchConfigSchema = z.object({
  name: z.string().trim().min(1, 'Search name is required').max(200),
  searchTerm: z.string().trim().min(1, 'Industry or search term is required').max(200),
  maxResults: z.number().int().min(1).max(5000),
  language: z.string().trim().min(2).max(10).default('en'),
  locations: z.array(locationSchema).min(1, 'At least one location is required').max(20),
  filters: businessFiltersSchema.default({}),
  includePlaceDetails: z.boolean().default(false),
  includeCompanyContacts: z.boolean().default(false),
  decisionMakers: decisionMakerConfigSchema.default({}),
  reviewsPerPlace: z.number().int().min(0).max(100).default(0),
  imagesPerPlace: z.number().int().min(0).max(20).default(0),
  yelp: yelpOptionsSchema.optional(),
});
export type SearchConfig = z.infer<typeof searchConfigSchema>;

/**
 * Count provider-billable filters for the estimator. Only filters the
 * maintained Google Maps actor applies provider-side bill per scraped place
 * (verified against the actor input schema on 2026-07-16): minimum stars
 * (placeMinimumStars), website presence (website), and closed-place
 * exclusion (skipClosedPlaces).
 *
 * Category include/exclude, requirePhone, requireCompanyEmail, and
 * review-count bounds are applied locally after ingestion and are free
 * (the actor's category field only accepts its fixed vocabulary and rejects
 * the whole run otherwise, so we never send it).
 */
export function countBillableFilters(filters: BusinessFilters): number {
  let count = 0;
  if (filters.minRating !== undefined) count += 1;
  if (filters.requireWebsite) count += 1;
  if (filters.excludeTemporarilyClosed && filters.excludePermanentlyClosed) count += 1;
  return count;
}
