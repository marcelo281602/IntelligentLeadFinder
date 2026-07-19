import { z } from 'zod';

/**
 * memo23/yelp-scraper contract, verified 2026-07-18 from the Actor's public
 * README/input schema (https://apify.com/memo23/yelp-scraper). The real
 * output schema must be re-validated against a maximum-10-record smoke test
 * before production enablement — runs stay flag-gated until then.
 */

/**
 * Actor input we send. Everything is server-controlled: startUrls come only
 * from the approved URL builder, and proxy/concurrency/enrichment knobs are
 * never accepted from a browser request. enrichEmails is pinned false — its
 * billing event has no published price, so we refuse to incur it.
 */
export interface YelpActorInput {
  startUrls: Array<{ url: string }>;
  maxItems: number;
  fetchBusinessDetails: boolean;
  scrapeReviews: boolean;
  maxReviews?: number;
  enrichEmails: false;
}

/**
 * One business row as emitted by the Actor (all optional except the name).
 * Re-validated against REAL output from the 2026-07-19 smoke run: isClaimed
 * arrives as the string "Claimed"/"Unclaimed" (not a boolean), rating as a
 * string ("5"), and rows also carry about/businessOwnerName/is_page_not_found.
 */
export const yelpBusinessSchema = z
  .object({
    title: z.string().min(1),
    yelp_biz_id: z.string().nullish(),
    url: z.string().nullish(),
    rating: z.union([z.number(), z.string()]).nullish(),
    reviewCount: z.union([z.number(), z.string()]).nullish(),
    isClaimed: z.union([z.boolean(), z.string()]).nullish(),
    categories: z.string().nullish(),
    priceLevel: z.string().nullish(),
    phoneNumber: z.string().nullish(),
    website: z.string().nullish(),
    fullAddress: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    zipcode: z.union([z.string(), z.number()]).nullish(),
    hours: z.unknown().nullish(),
    /** Business "about" text shown on the profile. */
    about: z.string().nullish(),
    /** Dead Yelp page marker — such rows are rejected, never stored. */
    is_page_not_found: z.union([z.boolean(), z.string()]).nullish(),
    /** Present only when email enrichment ran — always a COMPANY email. */
    contactEmail: z.string().nullish(),
  })
  .passthrough();

export type YelpBusiness = z.infer<typeof yelpBusinessSchema>;
