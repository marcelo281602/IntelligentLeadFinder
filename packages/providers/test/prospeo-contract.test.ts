import { describe, expect, it } from 'vitest';
import {
  buildProspeoRequest,
  mapProspeoPerson,
  ProspeoEnrichmentAdapter,
} from '../src/prospeo/adapter';
import { ProspeoClient } from '../src/prospeo/client';
import { ProviderError } from '../src/types';

const verifiedPerson = {
  person_id: 'per_1',
  first_name: 'Ada',
  last_name: 'Lovelace',
  full_name: 'Ada Lovelace',
  current_job_title: 'Head of Engineering',
  linkedin_url: 'https://www.linkedin.com/in/ada',
  email: {
    status: 'VERIFIED',
    revealed: true,
    email: 'ada@example.com',
    verification_method: 'SMTP',
    email_mx_provider: 'Google',
  },
  mobile: { status: 'UNAVAILABLE', revealed: false, mobile: null },
};

describe('buildProspeoRequest (request mapping)', () => {
  it('maps a name + company query with verified-only option', () => {
    const req = buildProspeoRequest(
      { firstName: 'Ada', lastName: 'Lovelace', companyWebsite: 'example.com' },
      { onlyVerifiedEmail: true },
    );
    expect(req.data).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace',
      company_website: 'example.com',
    });
    expect(req.only_verified_email).toBe(true);
    expect(req.enrich_mobile).toBeUndefined();
  });

  it('accepts email-only and linkedin-only queries', () => {
    expect(buildProspeoRequest({ email: 'x@y.com' }).data.email).toBe('x@y.com');
    expect(
      buildProspeoRequest({ linkedinUrl: 'https://www.linkedin.com/in/ada' }).data.linkedin_url,
    ).toContain('linkedin.com');
  });

  it('rejects insufficient datapoints before spending a request', () => {
    // Name without a company identifier cannot match — refuse client-side.
    expect(() => buildProspeoRequest({ fullName: 'Ada Lovelace' })).toThrow(ProviderError);
    expect(() => buildProspeoRequest({ companyName: 'Example Inc' })).toThrow(ProviderError);
  });
});

describe('mapProspeoPerson (response mapping)', () => {
  it('maps a verified revealed email exactly as returned', () => {
    const contact = mapProspeoPerson(verifiedPerson)!;
    expect(contact.fullName).toBe('Ada Lovelace');
    expect(contact.workEmail).toBe('ada@example.com');
    expect(contact.workEmailStatus).toBe('verified');
    expect(contact.jobTitle).toBe('Head of Engineering');
    expect(contact.personalLinkedinUrl).toBe('https://www.linkedin.com/in/ada');
    expect(contact.phone).toBeNull();
    expect(contact.phoneType).toBe('unknown');
  });

  it('never upgrades an unverified status to verified', () => {
    const contact = mapProspeoPerson({
      ...verifiedPerson,
      email: { ...verifiedPerson.email, status: 'UNKNOWN' },
    })!;
    expect(contact.workEmailStatus).toBe('found');
  });

  it('treats unrevealed or missing emails as unavailable', () => {
    const masked = mapProspeoPerson({
      ...verifiedPerson,
      email: { status: 'VERIFIED', revealed: false, email: 'ada.*****@example.com' },
    })!;
    expect(masked.workEmail).toBeNull();
    expect(masked.workEmailStatus).toBe('unavailable');
  });

  it('maps a revealed mobile with mobile phone type', () => {
    const contact = mapProspeoPerson({
      ...verifiedPerson,
      mobile: { status: 'VERIFIED', revealed: true, mobile: '+15125550100' },
    })!;
    expect(contact.phone).toBe('+15125550100');
    expect(contact.phoneType).toBe('mobile');
  });

  it('rejects a person without any name', () => {
    expect(mapProspeoPerson({ email: verifiedPerson.email })).toBeNull();
  });
});

describe('ProspeoClient', () => {
  it('sends the key in the X-KEY header, never a query param', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ error: false, response: { remaining_credits: 5 } }), {
        status: 200,
      });
    };
    await new ProspeoClient({ apiKey: 'PROSPEO_SECRET', fetchImpl: fakeFetch }).getAccount();
    const call = calls[0]!;
    expect(call.url).toContain('/account-information');
    expect(call.url).not.toContain('PROSPEO_SECRET');
    expect((call.init.headers as Record<string, string>)['X-KEY']).toBe('PROSPEO_SECRET');
  });

  it('maps INVALID_API_KEY to an auth error', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: true, error_code: 'INVALID_API_KEY' }), { status: 400 });
    await expect(
      new ProspeoClient({ apiKey: 'bad', fetchImpl: fakeFetch }).getAccount(),
    ).rejects.toMatchObject({ kind: 'auth' });
  });

  it('maps INSUFFICIENT_CREDITS to a non-retryable typed error', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: true, error_code: 'INSUFFICIENT_CREDITS' }), {
        status: 400,
      });
    await expect(
      new ProspeoClient({ apiKey: 'k', fetchImpl: fakeFetch }).enrichPerson({ data: {} }),
    ).rejects.toMatchObject({ kind: 'rate_limit', retryable: false });
  });
});

describe('adapter enrich lifecycle', () => {
  function withFetch(response: unknown, run: () => Promise<void>): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(response), { status: 200 });
    return run().finally(() => {
      globalThis.fetch = original;
    });
  }

  it('NO_MATCH is a zero-cost outcome, not an error', () =>
    withFetch({ error: true, error_code: 'NO_MATCH' }, async () => {
      const result = await new ProspeoEnrichmentAdapter().enrichContact(
        { token: 't' },
        { email: 'x@y.com' },
      );
      expect(result.contact).toBeNull();
      expect(result.freeOfCharge).toBe(true);
      expect(result.billedEvents).toEqual([]);
    }));

  it('bills one email credit for a fresh revealed email', () =>
    withFetch({ error: false, free_enrichment: false, person: verifiedPerson }, async () => {
      const result = await new ProspeoEnrichmentAdapter().enrichContact(
        { token: 't' },
        { email: 'ada@example.com' },
      );
      expect(result.contact?.workEmailStatus).toBe('verified');
      expect(result.billedEvents).toEqual(['email_enrichment']);
      expect(result.freeOfCharge).toBe(false);
    }));

  it('repeat enrichment within 90 days is free — the DB-memory saving', () =>
    withFetch({ error: false, free_enrichment: true, person: verifiedPerson }, async () => {
      const result = await new ProspeoEnrichmentAdapter().enrichContact(
        { token: 't' },
        { email: 'ada@example.com' },
      );
      expect(result.contact?.workEmail).toBe('ada@example.com');
      expect(result.freeOfCharge).toBe(true);
      expect(result.billedEvents).toEqual([]);
    }));

  it('bills the mobile premium only when a mobile was revealed', () =>
    withFetch(
      {
        error: false,
        free_enrichment: false,
        person: {
          ...verifiedPerson,
          mobile: { status: 'VERIFIED', revealed: true, mobile: '+15125550100' },
        },
      },
      async () => {
        const result = await new ProspeoEnrichmentAdapter().enrichContact(
          { token: 't' },
          { email: 'ada@example.com' },
          { enrichMobile: true },
        );
        expect(result.billedEvents).toEqual(['mobile_enrichment']);
      },
    ));

  it('testConnection reports plan and remaining credits', () =>
    withFetch(
      { error: false, response: { current_plan: 'BASIC', remaining_credits: 940 } },
      async () => {
        const result = await new ProspeoEnrichmentAdapter().testConnection({ token: 't' });
        expect(result.ok).toBe(true);
        expect(result.accountLabel).toBe('Prospeo BASIC — 940 credits left');
      },
    ));
});
