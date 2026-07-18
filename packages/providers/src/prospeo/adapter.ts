import type { EmailStatus } from '@leadfinder/core';
import { ProspeoClient } from './client';
import {
  prospeoAccountSchema,
  prospeoEnrichSuccessSchema,
  prospeoErrorSchema,
  type ProspeoEnrichRequest,
  type ProspeoPerson,
} from './schemas';
import {
  ProviderError,
  type CapabilityManifest,
  type ConnectionTestResult,
  type ContactEnrichmentAdapter,
  type EnrichContactOptions,
  type EnrichContactQuery,
  type EnrichContactResult,
  type MappedContact,
  type ProviderCredentials,
} from '../types';

/**
 * Map Prospeo's email object to our EmailStatus WITHOUT upgrading anything:
 * only an explicit VERIFIED status with a revealed address becomes 'verified';
 * a revealed address with any other status stays 'found' (rule 5 — never
 * fabricate verification states).
 */
function mapProspeoEmailStatus(person: ProspeoPerson): EmailStatus {
  const email = person.email;
  if (!email || !email.revealed || !email.email) return 'unavailable';
  return (email.status ?? '').toUpperCase() === 'VERIFIED' ? 'verified' : 'found';
}

/** Build the /enrich-person request body from a normalized query. */
export function buildProspeoRequest(
  query: EnrichContactQuery,
  options: EnrichContactOptions = {},
): ProspeoEnrichRequest {
  const data: ProspeoEnrichRequest['data'] = {};
  if (query.firstName) data.first_name = query.firstName;
  if (query.lastName) data.last_name = query.lastName;
  if (query.fullName) data.full_name = query.fullName;
  if (query.companyName) data.company_name = query.companyName;
  if (query.companyWebsite) data.company_website = query.companyWebsite;
  if (query.linkedinUrl) data.linkedin_url = query.linkedinUrl;
  if (query.email) data.email = query.email;

  // Prospeo's minimum datapoints, validated client-side so we never spend a
  // request on an INVALID_DATAPOINTS rejection.
  const hasName = Boolean(data.full_name || (data.first_name && data.last_name));
  const hasCompany = Boolean(data.company_name || data.company_website);
  const viable = Boolean(data.email || data.linkedin_url || (hasName && hasCompany));
  if (!viable) {
    throw new ProviderError(
      'Prospeo enrichment needs an email, a licensed LinkedIn URL, or a full name plus a company identifier.',
      'invalid_input',
      false,
    );
  }

  const request: ProspeoEnrichRequest = { data };
  if (options.onlyVerifiedEmail) request.only_verified_email = true;
  if (options.enrichMobile) request.enrich_mobile = true;
  return request;
}

/** Map a Prospeo person into the normalized contact shape. */
export function mapProspeoPerson(person: ProspeoPerson): MappedContact | null {
  const fullName =
    person.full_name ??
    ([person.first_name, person.last_name].filter(Boolean).join(' ') || null);
  if (!fullName) return null;

  const emailStatus = mapProspeoEmailStatus(person);
  const mobile = person.mobile;
  const mobileRevealed = Boolean(mobile?.revealed && mobile.mobile);
  return {
    providerPersonId: person.person_id ?? null,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    fullName,
    jobTitle: person.current_job_title ?? null,
    headline: null,
    departments: [],
    seniority: null,
    workEmail: emailStatus === 'unavailable' ? null : (person.email?.email ?? null),
    workEmailStatus: emailStatus,
    phone: mobileRevealed ? (mobile!.mobile ?? null) : null,
    phoneType: mobileRevealed ? 'mobile' : 'unknown',
    personalLinkedinUrl: person.linkedin_url ?? null,
    companyLinkedinUrl: null,
    personLocation: null,
    companyName: null,
    companyWebsite: null,
    companySize: null,
  };
}

export class ProspeoEnrichmentAdapter implements ContactEnrichmentAdapter {
  readonly provider = 'prospeo' as const;

  capabilities(): CapabilityManifest {
    return {
      provider: 'prospeo',
      companyCollection: false,
      companyContactEnrichment: true,
      decisionMakerDiscovery: false,
      emailVerification: true,
      phoneEnrichment: true,
      notes: [
        'Finds and verifies work emails (1 credit) and mobile numbers (10 credits) per person',
        'Repeat enrichment of the same person within 90 days is free — pairs with the deduped database',
        'No decision-maker discovery yet — needs a named person plus company, an email, or a licensed LinkedIn URL',
      ],
    };
  }

  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const started = Date.now();
    try {
      const account = prospeoAccountSchema.parse(
        await new ProspeoClient({ apiKey: credentials.token }).getAccount(),
      );
      const plan = account.response.current_plan ?? 'unknown plan';
      const credits = account.response.remaining_credits;
      return {
        ok: true,
        accountLabel: `Prospeo ${plan}${credits != null ? ` — ${credits} credits left` : ''}`,
        planHint: plan,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof ProviderError ? error.message : 'Connection test failed.',
      };
    }
  }

  async enrichContact(
    credentials: ProviderCredentials,
    query: EnrichContactQuery,
    options: EnrichContactOptions = {},
  ): Promise<EnrichContactResult> {
    const request = buildProspeoRequest(query, options);
    const raw = await new ProspeoClient({ apiKey: credentials.token }).enrichPerson(request);

    // NO_MATCH (and other per-contact rejections) cost nothing and are normal.
    const asError = prospeoErrorSchema.safeParse(raw);
    if (asError.success) {
      return {
        contact: null,
        freeOfCharge: true,
        billedEvents: [],
        warnings: [`Prospeo: ${asError.data.error_code ?? 'no match'}`],
      };
    }

    const parsed = prospeoEnrichSuccessSchema.parse(raw);
    const contact = parsed.person ? mapProspeoPerson(parsed.person) : null;
    if (!contact) {
      return { contact: null, freeOfCharge: true, billedEvents: [], warnings: [] };
    }

    // Bill exactly what the provider charged: nothing when free_enrichment
    // (repeat within 90 days), otherwise one email credit — plus the mobile
    // premium only when a mobile was requested AND revealed.
    const free = parsed.free_enrichment === true;
    const billedEvents = free
      ? []
      : contact.phone
        ? ['mobile_enrichment']
        : contact.workEmail
          ? ['email_enrichment']
          : [];
    return { contact, freeOfCharge: free || billedEvents.length === 0, billedEvents, warnings: [] };
  }
}
