import { describe, expect, it } from 'vitest';
import { searchConfigSchema } from '@leadfinder/core';
import { buildYelpActorInput, mapYelpBusiness, YelpApifyAdapter } from '../src/yelp/adapter';
import { assertApprovedYelpUrl, buildYelpSearchUrl } from '../src/yelp/url';
import { ProviderError } from '../src/types';

const config = searchConfigSchema.parse({
  name: 'Plumbers ATX',
  searchTerm: 'plumber & drain',
  maxResults: 50,
  locations: [{ countryCode: 'us', city: 'Austin', region: 'Texas', postalCode: '78704' }],
});

// Redacted fixture matching the Actor's verified output contract (2026-07-18).
const yelpFixture = {
  title: "Angie's Restaurant",
  yelp_biz_id: 'k0v1lBFP4vL8xQ2pXn3tZw',
  url: 'https://www.yelp.com/biz/angies-restaurant-logan',
  rating: 4.2,
  reviewCount: '509 reviews',
  isClaimed: true,
  categories: 'Breakfast & Brunch,American',
  priceLevel: '$$',
  phoneNumber: '(435) 752-9252',
  website: 'http://www.angiesrest.com/',
  fullAddress: '690 N Main St, Logan, UT 84321',
  city: 'Logan',
  state: 'UT',
  zipcode: '84321',
  hours: { Mon: '7:00 AM - 9:00 PM' },
};

describe('buildYelpSearchUrl (server-side URL builder)', () => {
  it('builds an encoded approved search URL from structured fields', () => {
    const url = buildYelpSearchUrl(config);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.yelp.com/search');
    expect(parsed.searchParams.get('find_desc')).toBe('plumber & drain');
    expect(parsed.searchParams.get('find_loc')).toBe('Austin, Texas, 78704, US');
  });

  it('refuses a search without any location text', () => {
    expect(() =>
      buildYelpSearchUrl(searchConfigSchema.parse({ ...config, locations: [{ countryCode: '' }] })),
    ).toThrow();
  });

  it('allowlist rejects every non-approved URL shape', () => {
    for (const bad of [
      'http://www.yelp.com/search?find_desc=x', // not https
      'https://evil.com/search?find_desc=x', // wrong host
      'https://www.yelp.com/biz/some-business', // wrong path
      'https://user:pw@www.yelp.com/search', // userinfo
      'https://www.yelp.com:8443/search', // port
      'https://www.yelp.com/search#frag', // fragment
      'not a url',
    ]) {
      expect(() => assertApprovedYelpUrl(bad), bad).toThrow(ProviderError);
    }
  });
});

describe('buildYelpActorInput (request mapping)', () => {
  it('maps approved server-controlled input with safe defaults', () => {
    const input = buildYelpActorInput(config);
    expect(input.startUrls).toHaveLength(1);
    expect(input.maxItems).toBe(50);
    expect(input.fetchBusinessDetails).toBe(true);
    expect(input.scrapeReviews).toBe(false);
    expect(input.maxReviews).toBeUndefined();
    // Email enrichment is pinned off: its event price is unpublished.
    expect(input.enrichEmails).toBe(false);
    // No proxy/concurrency/storage overrides can reach the Actor.
    expect(Object.keys(input).sort()).toEqual([
      'enrichEmails',
      'fetchBusinessDetails',
      'maxItems',
      'scrapeReviews',
      'startUrls',
    ]);
  });

  it('honours yelp options and bounds reviews', () => {
    const input = buildYelpActorInput(
      searchConfigSchema.parse({
        ...config,
        yelp: { fetchBusinessDetails: false, scrapeReviews: true, maxReviewsPerBusiness: 5 },
      }),
    );
    expect(input.fetchBusinessDetails).toBe(false);
    expect(input.scrapeReviews).toBe(true);
    expect(input.maxReviews).toBe(5);
  });
});

describe('mapYelpBusiness (response mapping)', () => {
  it('maps the verified output contract with coercions', () => {
    const result = mapYelpBusiness(yelpFixture, {
      verificationRequested: false,
      defaultCountryCode: 'US',
    })!;
    const c = result.company;
    expect(c.canonicalName).toBe("Angie's Restaurant");
    expect(c.yelpBusinessId).toBe('k0v1lBFP4vL8xQ2pXn3tZw');
    expect(c.yelpUrl).toContain('yelp.com/biz/');
    expect(c.googlePlaceId).toBeNull();
    expect(c.reviewCount).toBe(509);
    expect(c.rating).toBe(4.2);
    expect(c.categories).toEqual(['Breakfast & Brunch', 'American']);
    expect(c.priceRange).toBe('$$');
    expect(c.primaryPhone).toBe('(435) 752-9252');
    expect(c.region).toBe('UT');
    expect(c.postalCode).toBe('84321');
    expect(c.countryCode).toBe('US');
    expect(c.providerRecordId).toBe('k0v1lBFP4vL8xQ2pXn3tZw');
    expect(c.contacts).toEqual([]);
  });

  it('preserves nulls and never invents data', () => {
    const c = mapYelpBusiness({ title: 'Bare Diner' })!.company;
    expect(c.website).toBeNull();
    expect(c.companyEmails).toEqual([]);
    expect(c.countryCode).toBeNull();
    expect(c.yelpBusinessId).toBeNull();
  });

  it('labels an enriched email as a company email only', () => {
    const c = mapYelpBusiness({ ...yelpFixture, contactEmail: 'info@angiesrest.com' })!.company;
    expect(c.companyEmails).toEqual(['info@angiesrest.com']);
    expect(c.contacts).toEqual([]); // never a decision-maker
  });

  it('drops non-yelp URLs from provenance', () => {
    const c = mapYelpBusiness({ ...yelpFixture, url: 'https://evil.com/biz/x' })!.company;
    expect(c.yelpUrl).toBeNull();
  });

  it('rejects rows without a business name', () => {
    expect(mapYelpBusiness({ city: 'Logan' })).toBeNull();
    expect(mapYelpBusiness(null)).toBeNull();
  });
});

describe('YelpApifyAdapter run lifecycle', () => {
  it('refuses to start without a hard cap', async () => {
    await expect(
      new YelpApifyAdapter().startRun({ credentials: { token: 't' }, config, hardCapMicroUsd: 0 }),
    ).rejects.toThrow(ProviderError);
  });

  it('refuses any Actor other than the approved allowlisted one', async () => {
    await expect(
      new YelpApifyAdapter().startRun({
        credentials: { token: 't' },
        config,
        hardCapMicroUsd: 1_000_000,
        sourceId: 'someone/other-actor',
      }),
    ).rejects.toThrow(/approved Actor/);
  });

  it('starts only memo23/yelp-scraper with the hard cap attached', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ data: { id: 'run-1', status: 'READY', defaultDatasetId: 'ds-1' } }),
        { status: 201 },
      );
    };
    try {
      const result = await new YelpApifyAdapter().startRun({
        credentials: { token: 't' },
        config,
        hardCapMicroUsd: 500_000, // $0.50
      });
      expect(result.providerRunId).toBe('run-1');
      expect(calls[0]).toContain('/acts/memo23~yelp-scraper/runs');
      expect(calls[0]).toContain('maxTotalChargeUsd=0.50');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('capability manifest is honest about what Yelp does not provide', () => {
    const caps = new YelpApifyAdapter().capabilities();
    expect(caps.companyCollection).toBe(true);
    expect(caps.decisionMakerDiscovery).toBe(false);
    expect(caps.emailVerification).toBe(false);
  });
});
