import { describe, expect, it } from 'vitest';
import { getEnrichmentAdapter, getMapsAdapter } from '../src/index';
import { apolloCapabilities, assertApolloAllowed } from '../src/stubs';
import { ProviderError } from '../src/types';

describe('Apollo commercial-use gate', () => {
  it('blocks without documented approval, regardless of feature flag', () => {
    expect(() =>
      assertApolloAllowed({ commercialUseApproved: false, featureFlagEnabled: true }),
    ).toThrow(/commercial-use approval/);
  });

  it('blocks when the feature flag is off even with approval', () => {
    expect(() =>
      assertApolloAllowed({ commercialUseApproved: true, featureFlagEnabled: false }),
    ).toThrow(/feature flag/);
  });

  it('passes only with approval + flag', () => {
    expect(() =>
      assertApolloAllowed({ commercialUseApproved: true, featureFlagEnabled: true }),
    ).not.toThrow();
  });

  it('capability manifest reflects the gate honestly', () => {
    const gated = apolloCapabilities({ commercialUseApproved: false, featureFlagEnabled: false });
    expect(gated.decisionMakerDiscovery).toBe(false);
    expect(gated.notes.join(' ')).toMatch(/Blocked/);
  });
});

describe('adapter registries stay honest', () => {
  it('Maps registry refuses contact-enrichment providers', () => {
    // Apollo and Prospeo are contact-enrichment providers, not Maps data
    // sources, so the Maps registry refuses them.
    expect(() => getMapsAdapter('apollo')).toThrow(ProviderError);
    expect(() => getMapsAdapter('prospeo')).toThrow(ProviderError);
  });

  it('Maps registry returns working adapters for apify, fixture, and outscraper', () => {
    expect(getMapsAdapter('apify').provider).toBe('apify');
    expect(getMapsAdapter('fixture').provider).toBe('fixture');
    expect(getMapsAdapter('outscraper').provider).toBe('outscraper');
  });

  it('enrichment registry returns prospeo, keeps apollo gated, refuses Maps providers', () => {
    const prospeo = getEnrichmentAdapter('prospeo');
    expect(prospeo.provider).toBe('prospeo');
    expect(prospeo.capabilities().emailVerification).toBe(true);
    expect(prospeo.capabilities().decisionMakerDiscovery).toBe(false);
    expect(() => getEnrichmentAdapter('apollo')).toThrow(/commercial-use approval/);
    expect(() => getEnrichmentAdapter('apify')).toThrow(ProviderError);
  });
});
