import { describe, expect, it } from 'vitest';
import { getMapsAdapter } from '../src/index';
import {
  apolloCapabilities,
  assertApolloAllowed,
  outscraperCapabilities,
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
  it('outscraper and prospeo manifests declare no capabilities', () => {
    expect(outscraperCapabilities().companyCollection).toBe(false);
    expect(prospeoCapabilities().emailVerification).toBe(false);
  });

  it('adapter registry refuses gated providers', () => {
    expect(() => getMapsAdapter('outscraper')).toThrow(ProviderError);
    expect(() => getMapsAdapter('apollo')).toThrow(ProviderError);
    expect(() => getMapsAdapter('prospeo')).toThrow(ProviderError);
  });

  it('registry returns working adapters for apify and fixture', () => {
    expect(getMapsAdapter('apify').provider).toBe('apify');
    expect(getMapsAdapter('fixture').provider).toBe('fixture');
  });
});
