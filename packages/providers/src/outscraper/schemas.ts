import { z } from 'zod';

/**
 * Zod schemas for the subset of Outscraper's Google Maps response this
 * platform consumes. Field names verified against Outscraper's documented
 * Google Maps output (2026-07-18). Every field is optional/nullable —
 * provider data is untrusted input and missing fields must stay missing.
 * `.passthrough()` keeps unknown fields for raw provenance.
 */

export const outscraperPlaceSchema = z
  .object({
    name: z.string().min(1),
    place_id: z.string().nullish(),
    google_id: z.string().nullish(),
    full_address: z.string().nullish(),
    borough: z.string().nullish(),
    street: z.string().nullish(),
    city: z.string().nullish(),
    postal_code: z.union([z.string(), z.number()]).nullish(),
    state: z.string().nullish(),
    us_state: z.string().nullish(),
    country: z.string().nullish(),
    country_code: z.string().nullish(),
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
    phone: z.string().nullish(),
    site: z.string().nullish(),
    type: z.string().nullish(),
    subtypes: z.string().nullish(),
    category: z.string().nullish(),
    rating: z.union([z.number(), z.string()]).nullish(),
    reviews: z.union([z.number(), z.string()]).nullish(),
    business_status: z.string().nullish(),
    location_link: z.string().nullish(),
    // Company contact enrichment (when the emails/domains enrichment is on)
    email_1: z.string().nullish(),
    linkedin: z.string().nullish(),
  })
  .passthrough();

export type OutscraperPlace = z.infer<typeof outscraperPlaceSchema>;

/**
 * Async task submission response (POST /google-maps-search with async:true).
 * Outscraper returns the request id and a pending status.
 */
export const outscraperSubmitSchema = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    results_location: z.string().nullish(),
  })
  .passthrough();

/**
 * Request archive response (GET /requests/{id}). status is 'Pending' while
 * running, then 'Success'/'Finished'. `data` is an array-per-query of places.
 */
export const outscraperArchiveSchema = z
  .object({
    id: z.string().optional(),
    status: z.string(),
    data: z.array(z.unknown()).nullish(),
  })
  .passthrough();

export type OutscraperArchive = z.infer<typeof outscraperArchiveSchema>;

/** Build the verified request payload for POST /google-maps-search. */
export interface OutscraperSearchPayload {
  query: string[];
  language: string;
  region?: string;
  organizationsPerQueryLimit: number;
  skipPlaces?: number;
  coordinates?: string;
  dropDuplicates: boolean;
  async: true;
}
