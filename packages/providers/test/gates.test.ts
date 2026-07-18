import { describe, expect, it } from 'vitest';
import { getMapsAdapter } from '../src/index';
import {
  apolloCapabilities,
  assertApolloAllowed,
  prospeoCapabilities,
} from '../src/stubs';
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

describe('unimplemented providers stay honest', () => {
  it('prospeo manifest declares no capabilities', () => {
    expect(prospeoCapabilities().emailVerification).toBe(false);
  });

  it('adapter registry refuses non-Maps enrichment providers', () => {
    // Apollo and Prospeo are contact-enrichment providers, not Maps data
    // sources, so the Maps registry refuses them.
    expect(() => getMapsAdapter('apollo')).toThrow(ProviderError);
    expect(() => getMapsAdapter('prospeo')).toThrow(ProviderError);
  });

  it('registry returns working adapters for apify, fixture, and outscraper', () => {
    expect(getMapsAdapter('apify').provider).toBe('apify');
    expect(getMapsAdapter('fixture').provider).toBe('fixture');
    expect(getMapsAdapter('outscraper').provider).toBe('outscraper');
  });
});
