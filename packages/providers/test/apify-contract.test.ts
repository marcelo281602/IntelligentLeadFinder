import { describe, expect, it } from 'vitest';
import { searchConfigSchema, usdToMicro } from '@leadfinder/core';
import {
  ApifyGoogleMapsAdapter,
  buildActorInput,
  mapEmailStatus,
  mapPlaceItem,
  minRatingToStars,
} from '../src/apify/adapter';
import { FIXTURE_PLACES } from '../src/fixture/data';
import { FixtureMapsAdapter } from '../src/fixture/adapter';
import { ProviderError } from '../src/types';

const baseConfig = searchConfigSchema.parse({
  name: 'Plumbers ATX',
  searchTerm: 'plumber',
  maxResults: 100,
  locations: [{ countryCode: 'us', city: 'Austin', region: 'Texas' }],
});

describe('buildActorInput (request mapping)', () => {
  it('maps the core fields with verified names', () => {
    const input = buildActorInput(baseConfig);
    expect(input.searchStringsArray).toEqual(['plumber']);
    expect(input.maxCrawledPlacesPerSearch).toBe(100);
    expect(input.countryCode).toBe('us');
    expect(input.city).toBe('Austin');
    expect(input.state).toBe('Texas');
    expect(input.language).toBe('en');
    // Closed places are excluded by default -> billable filter on
    expect(input.skipClosedPlaces).toBe(true);
  });

  it('maps rating and website filters', () => {
    const config = searchConfigSchema.parse({
      ...baseConfig,
      filters: { minRating: 4, requireWebsite: true },
    });
    const input = buildActorInput(config);
    expect(input.placeMinimumStars).toBe('four');
    expect(input.website).toBe('withWebsite');
  });

  it('never combines postal code with city (actor constraint)', () => {
    const config = searchConfigSchema.parse({
      ...baseConfig,
      locations: [{ countryCode: 'US', city: 'Austin', postalCode: '78741' }],
    });
    const input = buildActorInput(config);
    expect(input.postalCode).toBeUndefined();
    const zipOnly = buildActorInput(
      searchConfigSchema.parse({
        ...baseConfig,
        locations: [{ countryCode: 'US', postalCode: '78741' }],
      }),
    );
    expect(zipOnly.postalCode).toBe('78741');
  });

  it('only requests leads enrichment when the user opted in', () => {
    expect(buildActorInput(baseConfig).maximumLeadsEnrichmentRecords).toBeUndefined();
    const withDm = searchConfigSchema.parse({
      ...baseConfig,
      decisionMakers: { enabled: true, maxContactsPerCompany: 2, verifyWorkEmail: true },
    });
    const input = buildActorInput(withDm);
    expect(input.maximumLeadsEnrichmentRecords).toBe(2);
    expect(input.verifyLeadsEnrichmentEmails).toBe(true);
  });

  it('disables reviews and images by default (cost protection)', () => {
    const input = buildActorInput(baseConfig);
    expect(input.maxReviews).toBeUndefined();
    expect(input.maxImages).toBeUndefined();
  });

  it('maps custom geolocation as [lng, lat]', () => {
    const config = searchConfigSchema.parse({
      ...baseConfig,
      locations: [{ countryCode: 'US', latitude: 30.26, longitude: -97.74, radiusKm: 25 }],
    });
    expect(buildActorInput(config).customGeolocation).toEqual({
      type: 'Point',
      coordinates: [-97.74, 30.26],
      radiusKm: 25,
    });
  });

  it('star mapping is conservative', () => {
    expect(minRatingToStars(4.5)).toBe('fourAndHalf');
    expect(minRatingToStars(4.2)).toBe('four');
    expect(minRatingToStars(3)).toBe('three');
    expect(minRatingToStars(1.5)).toBe('');
    expect(minRatingToStars(undefined)).toBeUndefined();
  });
});

describe('startRun cap enforcement', () => {
  it('refuses to start without a positive hard cap', async () => {
    const adapter = new ApifyGoogleMapsAdapter();
    await expect(
      adapter.startRun({
        credentials: { token: 'apify_api_test' },
        config: baseConfig,
        hardCapMicroUsd: 0,
      }),
    ).rejects.toThrow(ProviderError);
  });

  it('sends maxTotalChargeUsd and an Authorization header, never a token query param', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({ data: { id: 'run-1', status: 'READY', defaultDatasetId: 'ds-1' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    };
    const { ApifyClient } = await import('../src/apify/client');
    const client = new ApifyClient({ token: 'apify_api_SECRET', fetchImpl: fakeFetch });
    await client.startActorRun({
      actorId: 'compass/crawler-google-places',
      input: { searchStringsArray: ['x'] },
      maxTotalChargeUsd: '12.50',
    });
    const call = calls[0]!;
    expect(call.url).toContain('/acts/compass~crawler-google-places/runs');
    expect(call.url).toContain('maxTotalChargeUsd=12.50');
    expect(call.url).not.toContain('SECRET');
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer apify_api_SECRET',
    );
  });
});

describe('mapPlaceItem (response mapping)', () => {
  const rich = FIXTURE_PLACES[0]!;

  it('maps a fully populated place', () => {
    const result = mapPlaceItem(rich, true);
    expect(result).not.toBeNull();
    const company = result!.company;
    expect(company.canonicalName).toBe('BrightPipe Plumbing Co.');
    expect(company.googlePlaceId).toBe('FIXTURE-PLACE-001');
    expect(company.countryCode).toBe('US');
    expect(company.companyEmails).toEqual(['office@brightpipe.example']);
    expect(company.companyLinkedinUrl).toBe('https://www.linkedin.com/company/brightpipe-plumbing');
    expect(company.rating).toBe(4.8);
  });

  it('separates personal and company LinkedIn URLs on contacts', () => {
    const contact = mapPlaceItem(rich, true)!.company.contacts[0]!;
    expect(contact.personalLinkedinUrl).toBe('https://www.linkedin.com/in/maria-delgado-fixture');
    expect(contact.companyLinkedinUrl).toBe('https://www.linkedin.com/company/brightpipe-plumbing');
    expect(contact.personalLinkedinUrl).not.toBe(contact.companyLinkedinUrl);
  });

  it('preserves nulls without fabricating values', () => {
    const noWebsite = FIXTURE_PLACES[2]!; // Violet Crown: no phone, no website
    const company = mapPlaceItem(noWebsite, false)!.company;
    expect(company.website).toBeNull();
    expect(company.primaryPhone).toBeNull();
    expect(company.companyEmails).toEqual([]);
    expect(company.contacts).toEqual([]);
  });

  it('rejects malformed items instead of guessing', () => {
    expect(mapPlaceItem(FIXTURE_PLACES[13], false)).toBeNull(); // missing title
    expect(mapPlaceItem(null, false)).toBeNull();
    expect(mapPlaceItem('garbage', false)).toBeNull();
  });

  it('drops leads with no name and reports a warning (never invents a person)', () => {
    const result = mapPlaceItem(FIXTURE_PLACES[11]!, true)!;
    expect(result.company.contacts).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });

  it('email verification statuses are truthful', () => {
    expect(mapEmailStatus({ email: 'a@b.co', emailVerification: { result: 'ok' } }, true)).toBe(
      'verified',
    );
    expect(
      mapEmailStatus({ email: 'a@b.co', emailVerification: { result: 'catch_all' } }, true),
    ).toBe('catch_all');
    expect(
      mapEmailStatus({ email: 'a@b.co', emailVerification: { result: 'unknown' } }, true),
    ).toBe('unverified');
    expect(
      mapEmailStatus({ email: 'a@b.co', emailVerification: { result: 'invalid' } }, true),
    ).toBe('invalid');
    expect(mapEmailStatus({ email: 'a@b.co', emailVerification: { result: 'error' } }, true)).toBe(
      'provider_error',
    );
    // Verification never requested -> merely "found", never "verified"
    expect(mapEmailStatus({ email: 'a@b.co' }, false)).toBe('found');
    // No email at all
    expect(mapEmailStatus({}, true)).toBe('unavailable');
    expect(mapEmailStatus({}, false)).toBe('not_requested');
  });
});

describe('run status mapping', () => {
  it('maps Apify statuses onto adapter states and converts usage to micro-USD', async () => {
    const adapter = new ApifyGoogleMapsAdapter();
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'run-9',
            status: 'SUCCEEDED',
            defaultDatasetId: 'ds-9',
            usageTotalUsd: 1.234567,
            startedAt: '2026-07-16T10:00:00.000Z',
            finishedAt: '2026-07-16T10:05:00.000Z',
          },
        }),
        { status: 200 },
      );
    const original = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const status = await adapter.getRunStatus({ token: 't' }, 'run-9');
      expect(status.state).toBe('succeeded');
      expect(status.usageTotalMicroUsd).toBe(usdToMicro(1.234567));
      expect(status.datasetId).toBe('ds-9');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('fixture adapter pagination', () => {
  it('pages deterministically and respects maxResults caps', async () => {
    const adapter = new FixtureMapsAdapter();
    const run = await adapter.startRun({
      credentials: { token: 'none' },
      config: searchConfigSchema.parse({ ...baseConfig, maxResults: 6 }),
      hardCapMicroUsd: 1,
    });
    expect(run.datasetId).toBe('fixture-dataset:6');
    const page1 = await adapter.fetchDatasetPage({ token: 'none' }, run.datasetId!, 0, 4);
    const page2 = await adapter.fetchDatasetPage({ token: 'none' }, run.datasetId!, 4, 4);
    expect(page1.items).toHaveLength(4);
    expect(page2.items).toHaveLength(2);
    expect(page1.total).toBe(6);
    const page3 = await adapter.fetchDatasetPage({ token: 'none' }, run.datasetId!, 8, 4);
    expect(page3.items).toHaveLength(0);
  });
});
