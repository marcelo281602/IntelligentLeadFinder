import { z } from 'zod';

/**
 * Prospeo API contract, verified from https://prospeo.io/api-docs on
 * 2026-07-18. Base `https://api.prospeo.io`, auth header `X-KEY`, JSON POST
 * (account information is GET). Errors: `{error:true, error_code}` with HTTP
 * 400 (NO_MATCH, INVALID_DATAPOINTS, INSUFFICIENT_CREDITS, INVALID_API_KEY,
 * INVALID_REQUEST, INTERNAL_ERROR) or 429 (rate limit).
 *
 * Credits: email enrichment = 1, mobile = 10, no-match = 0, repeat enrichment
 * of the same person within 90 days = 0 (`free_enrichment: true`).
 */

/** GET /account-information — free; used for connection tests. */
export const prospeoAccountSchema = z.object({
  error: z.literal(false),
  response: z
    .object({
      current_plan: z.string().nullish(),
      remaining_credits: z.number().nullish(),
      used_credits: z.number().nullish(),
      next_quota_renewal_date: z.string().nullish(),
    })
    .passthrough(),
});

/** Error envelope shared by every endpoint. */
export const prospeoErrorSchema = z.object({
  error: z.literal(true),
  error_code: z.string().nullish(),
});

/**
 * `person.email` — verification state is preserved EXACTLY as returned
 * (status VERIFIED | UNAVAILABLE, method SMTP | BOUNCEBAN). We never upgrade
 * or invent a verification state (master-prompt rule 5).
 */
export const prospeoEmailSchema = z
  .object({
    status: z.string().nullish(),
    revealed: z.boolean().nullish(),
    email: z.string().nullish(),
    verification_method: z.string().nullish(),
    email_mx_provider: z.string().nullish(),
  })
  .passthrough();

export const prospeoMobileSchema = z
  .object({
    status: z.string().nullish(),
    revealed: z.boolean().nullish(),
    mobile: z.string().nullish(),
    mobile_country_code: z.string().nullish(),
  })
  .passthrough();

export const prospeoPersonSchema = z
  .object({
    person_id: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    full_name: z.string().nullish(),
    email: prospeoEmailSchema.nullish(),
    mobile: prospeoMobileSchema.nullish(),
    linkedin_url: z.string().nullish(),
    current_job_title: z.string().nullish(),
  })
  .passthrough();

/** POST /enrich-person success body. */
export const prospeoEnrichSuccessSchema = z.object({
  error: z.literal(false),
  free_enrichment: z.boolean().nullish(),
  person: prospeoPersonSchema.nullish(),
  company: z.record(z.unknown()).nullish(),
});

export type ProspeoPerson = z.infer<typeof prospeoPersonSchema>;
export type ProspeoEnrichSuccess = z.infer<typeof prospeoEnrichSuccessSchema>;

/** Request body for POST /enrich-person. */
export interface ProspeoEnrichRequest {
  data: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    company_name?: string;
    company_website?: string;
    /** Only from licensed provider data or manual entry — never scraped. */
    linkedin_url?: string;
    email?: string;
  };
  only_verified_email?: boolean;
  enrich_mobile?: boolean;
}
