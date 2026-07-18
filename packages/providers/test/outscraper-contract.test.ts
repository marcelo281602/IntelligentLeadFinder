import { describe, expect, it } from 'vitest';
import { searchConfigSchema } from '@leadfinder/core';
import {
  buildOutscraperPayload,
  mapOutscraperPlace,
  OutscraperMapsAdapter,
} from '../src/outscraper/adapter';
import { OutscraperClient } from '../src/outscraper/client';
import { ProviderError } from '../src/types';

const config = searchConfigSchema.parse({
  name: 'Coffee ATX',
  searchTerm: 'coffee shop',
  maxResults: 25,
  locations: [{ countryCode: 'us', city: 'Austin', region: 'Texas' }],
});

describe('buildOutscraperPayload (request mapping)', () => {
  it('builds a term+location query and async payload', () => {
    const p = buildOutscraperPayload(config);
    expect(p.query).toEqual(['coffee shop, Austin, Texas, US']);
    expect(p.organizationsPerQueryLimit).toBe(25);
    expect(p.async).toBe(true);
    expect(p.dropDuplicates).toBe(true);
    expect(p.region).toBe('US');
    expect(p.language).toBe('en');
  });

  it('adds coordinates when provided', () => {
    const p = buildOutscraperPayload(
      searchConfigSchema.parse({
        ...config,
        locations: [{ countryCode: 'US', latitude: 30.26, longitude: -97.74 }],
      }),
    );
    expect(p.coordinates).toBe('30.26,-97.74');
  });
});

describe('mapOutscraperPlace (response mapping)', () => {
  const raw = {
    name: 'Summer Moon Coffee',
    place_id: 'ChIJ-osc-1',
    google_id: '0x1:0x2',
    full_address: '123 S Congress Ave, Austin, TX 78704',
    street: '123 S Congress Ave',
    city: 'Austin',
    state: 'Texas',
    postal_code: 78704,
    country_code: 'us',
    latitude: 30.24,
    longitude: -97.74,
    phone: '+15125550142',
    site: 'https://summermooncoffee.com',
    type: 'Coffee shop',
    subtypes: 'Coffee shop, Cafe',
    rating: '4.6',
    reviews: 2031,
    business_status: 'OPERATIONAL',
    location_link: 'https://maps.google.com/?cid=2',
  };

  it('maps core fields with type coercion', () => {
    const result = mapOutscraperPlace(raw)!;
    const c = result.company;
    expect(c.canonicalName).toBe('Summer Moon Coffee');
    expect(c.googlePlaceId).toBe('ChIJ-osc-1');
    expect(c.countryCode).toBe('US');
    expect(c.postalCode).toBe('78704');
    expect(c.rating).toBe(4.6);
    expect(c.reviewCount).toBe(2031);
    expect(c.primaryPhone).toBe('+15125550142');
    expect(c.categories).toEqual(['Coffee shop', 'Cafe']);
    expect(c.googleCid).toBe('0x1:0x2');
  });

  it('detects closed states from business_status', () => {
    expect(mapOutscraperPlace({ ...raw, business_status: 'CLOSED_PERMANENTLY' })!.company.permanentlyClosed).toBe(true);
    expect(mapOutscraperPlace({ ...raw, business_status: 'CLOSED_TEMPORARILY' })!.company.temporarilyClosed).toBe(true);
  });

  it('preserves nulls without inventing data', () => {
    const c = mapOutscraperPlace({ name: 'Bare Cafe' })!.company;
    expect(c.website).toBeNull();
    expect(c.primaryPhone).toBeNull();
    expect(c.companyEmails).toEqual([]);
    expect(c.contacts).toEqual([]);
  });

  it('rejects items with no name', () => {
    expect(mapOutscraperPlace({ city: 'Austin' })).toBeNull();
    expect(mapOutscraperPlace(null)).toBeNull();
  });
});

describe('OutscraperClient', () => {
  it('sends the key in the X-API-KEY header, never a query param', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: 'req-1', status: 'Pending' }), { status: 200 });
    };
    const client = new OutscraperClient({ apiKey: 'OSC_SECRET', fetchImpl: fakeFetch });
    await client.submitSearch({ query: ['x'] });
    const call = calls[0]!;
    expect(call.url).toContain('/google-maps-search');
    expect(call.url).not.toContain('OSC_SECRET');
    expect((call.init.headers as Record<string, string>)['X-API-KEY']).toBe('OSC_SECRET');
  });

  it('validateKey returns false on 401', async () => {
    const fakeFetch: typeof fetch = async () => new Response('{}', { status: 401 });
    const ok = await new OutscraperClient({ apiKey: 'bad', fetchImpl: fakeFetch }).validateKey();
    expect(ok).toBe(false);
  });

  it('validateKey returns true on 404 (key authenticated, id not found)', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: true, errorMessage: 'not found' }), { status: 404 });
    const ok = await new OutscraperClient({ apiKey: 'good', fetchImpl: fakeFetch }).validateKey();
    expect(ok).toBe(true);
  });
});

describe('adapter run lifecycle', () => {
  it('refuses to start without a hard cap', async () => {
    await expect(
      new OutscraperMapsAdapter().startRun({
        credentials: { token: 't' },
        config,
        hardCapMicroUsd: 0,
      }),
    ).rejects.toThrow(ProviderError);
  });

  it('maps status and flattens array-per-query dataset pages', async () => {
    const archive = {
      status: 'Success',
      data: [[{ name: 'A' }, { name: 'B' }], [{ name: 'C' }]],
    };
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify(archive), { status: 200 });
    const adapter = new OutscraperMapsAdapter();
    const original = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      const status = await adapter.getRunStatus({ token: 't' }, 'req-1');
      expect(status.state).toBe('succeeded');
      expect(status.itemCount).toBe(3);
      const page = await adapter.fetchDatasetPage({ token: 't' }, 'req-1', 0, 2);
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(3);
    } finally {
      globalThis.fetch = original;
    }
  });
});
