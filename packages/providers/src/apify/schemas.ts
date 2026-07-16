import { z } from 'zod';

/**
 * Zod schemas for the subset of compass/crawler-google-places output this
 * platform consumes. Field names were verified against the actor's published
 * dataset schema on 2026-07-16. Every field is optional/nullable — provider
 * data is untrusted input and missing fields must stay missing (never
 * fabricated). `.passthrough()` keeps unknown fields for raw provenance.
 */

export const emailVerificationSchema = z
  .object({
    email: z.string().optional(),
    quality: z.string().optional(),
    result: z.enum(['ok', 'catch_all', 'unknown', 'error', 'disposable', 'invalid']).optional(),
    subResult: z.string().optional(),
    free: z.boolean().optional(),
    role: z.boolean().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export const leadsEnrichmentResultSchema = z
  .object({
    personId: z.string().nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    fullName: z.string().nullish(),
    linkedinProfile: z.string().nullish(),
    email: z.string().nullish(),
    mobileNumber: z.string().nullish(),
    jobTitle: z.string().nullish(),
    industry: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    country: z.string().nullish(),
    companyId: z.string().nullish(),
    companyName: z.string().nullish(),
    companyWebsite: z.string().nullish(),
    companySize: z.string().nullish(),
    companyLinkedin: z.string().nullish(),
    companyPhoneNumber: z.string().nullish(),
    headline: z.string().nullish(),
    departments: z.array(z.string()).nullish(),
    seniority: z.string().nullish(),
    emailVerification: emailVerificationSchema.nullish(),
  })
  .passthrough();

export type ApifyLead = z.infer<typeof leadsEnrichmentResultSchema>;

const locationSchema = z
  .object({ lat: z.number().nullish(), lng: z.number().nullish() })
  .passthrough();

export const placeItemSchema = z
  .object({
    title: z.string().min(1),
    subTitle: z.string().nullish(),
    categoryName: z.string().nullish(),
    categories: z.array(z.string()).nullish(),
    description: z.string().nullish(),
    address: z.string().nullish(),
    neighborhood: z.string().nullish(),
    street: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    postalCode: z.string().nullish(),
    countryCode: z.string().nullish(),
    location: locationSchema.nullish(),
    phone: z.string().nullish(),
    phoneUnformatted: z.string().nullish(),
    website: z.string().nullish(),
    url: z.string().nullish(),
    placeId: z.string().nullish(),
    fid: z.string().nullish(),
    cid: z.string().nullish(),
    totalScore: z.number().nullish(),
    reviewsCount: z.number().nullish(),
    permanentlyClosed: z.boolean().nullish(),
    temporarilyClosed: z.boolean().nullish(),
    price: z.string().nullish(),
    openingHours: z.unknown().nullish(),
    // Company contact enrichment (scrapeContacts)
    emails: z.array(z.string()).nullish(),
    phones: z.array(z.string()).nullish(),
    phonesUncertain: z.array(z.string()).nullish(),
    linkedIns: z.array(z.string()).nullish(),
    instagrams: z.array(z.string()).nullish(),
    facebooks: z.array(z.string()).nullish(),
    twitters: z.array(z.string()).nullish(),
    youtubes: z.array(z.string()).nullish(),
    tiktoks: z.array(z.string()).nullish(),
    // Business leads enrichment (maximumLeadsEnrichmentRecords > 0)
    leadsEnrichment: z.array(leadsEnrichmentResultSchema).nullish(),
  })
  .passthrough();

export type ApifyPlaceItem = z.infer<typeof placeItemSchema>;

/** Actor run object subset (GET /v2/actor-runs/{runId}). */
export const apifyRunSchema = z
  .object({
    id: z.string(),
    actId: z.string().optional(),
    status: z.enum([
      'READY',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
      'ABORTING',
      'ABORTED',
      'TIMING-OUT',
      'TIMED-OUT',
    ]),
    defaultDatasetId: z.string().optional(),
    startedAt: z.string().nullish(),
    finishedAt: z.string().nullish(),
    usageTotalUsd: z.number().nullish(),
    statusMessage: z.string().nullish(),
    stats: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type ApifyRun = z.infer<typeof apifyRunSchema>;

export const apifyUserSchema = z
  .object({
    id: z.string().optional(),
    username: z.string().optional(),
    plan: z.union([z.string(), z.object({ id: z.string().optional() }).passthrough()]).optional(),
  })
  .passthrough();

/**
 * Verified actor input shape (subset). Built by the adapter, never by the UI.
 * Field names verified against the actor input schema on 2026-07-16.
 */
export interface ApifyGoogleMapsInput {
  searchStringsArray: string[];
  countryCode?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customGeolocation?: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
    radiusKm: number;
  };
  maxCrawledPlacesPerSearch: number;
  language: string;
  placeMinimumStars?: '' | 'two' | 'twoAndHalf' | 'three' | 'threeAndHalf' | 'four' | 'fourAndHalf';
  website?: 'allPlaces' | 'withWebsite' | 'withoutWebsite';
  skipClosedPlaces?: boolean;
  categoryFilterWords?: string[];
  searchMatching?: 'all' | 'only_includes' | 'only_exact';
  scrapePlaceDetailPage?: boolean;
  scrapeContacts?: boolean;
  maximumLeadsEnrichmentRecords?: number;
  leadsEnrichmentDepartments?: string[];
  verifyLeadsEnrichmentEmails?: boolean;
  maxReviews?: number;
  maxImages?: number;
}
