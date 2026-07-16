import { describe, expect, it } from 'vitest';
import { companyDedupeKeys, contactDedupeKeys, shouldReplaceField } from '../src/dedupe';

describe('companyDedupeKeys', () => {
  const full = {
    provider: 'apify',
    providerPlaceId: 'ChIJabc123',
    website: 'https://www.acme.com/home?utm_source=x',
    phone: '+1 555 010 4477',
    countryCode: 'US',
    name: 'ACME, LLC',
    fullAddress: '123 Main St, Springfield, IL 62701',
    city: 'Springfield',
    region: 'IL',
    postalCode: '62701',
  };

  it('produces prioritized keys with place id first', () => {
    const keys = companyDedupeKeys(full);
    expect(keys[0]).toEqual({ priority: 1, key: 'place:apify:ChIJabc123', action: 'auto' });
    expect(keys.map((k) => k.priority)).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses root domain, not full URL', () => {
    const keys = companyDedupeKeys(full);
    expect(keys.find((k) => k.priority === 2)?.key).toBe('domain:acme.com');
  });

  it('marks name-based keys as review-only', () => {
    const keys = companyDedupeKeys(full);
    for (const key of keys.filter((k) => k.priority >= 4)) {
      expect(key.action).toBe('review');
    }
  });

  it('omits keys for missing fields instead of guessing', () => {
    const keys = companyDedupeKeys({ provider: 'apify', name: 'Acme' });
    expect(keys).toHaveLength(0);
  });

  it('same company from a different provider still matches on domain and phone', () => {
    const a = companyDedupeKeys(full);
    const b = companyDedupeKeys({ ...full, provider: 'outscraper', providerPlaceId: 'other' });
    const aKeys = new Set(a.filter((k) => k.action === 'auto').map((k) => k.key));
    const overlap = b.filter((k) => k.action === 'auto' && aKeys.has(k.key));
    expect(overlap.length).toBeGreaterThanOrEqual(2); // domain + phone
  });
});

describe('contactDedupeKeys', () => {
  it('only uses verified emails for auto-merge', () => {
    const unverified = contactDedupeKeys({
      provider: 'apify',
      workEmail: 'jane@acme.com',
      workEmailVerified: false,
    });
    expect(unverified.find((k) => k.key.startsWith('email:'))).toBeUndefined();

    const verified = contactDedupeKeys({
      provider: 'apify',
      workEmail: 'Jane@Acme.com',
      workEmailVerified: true,
    });
    expect(verified.find((k) => k.key === 'email:jane@acme.com')?.action).toBe('auto');
  });

  it('only personal LinkedIn URLs produce linkedin keys', () => {
    const company = contactDedupeKeys({
      provider: 'apify',
      personalLinkedinUrl: 'https://linkedin.com/company/acme',
    });
    expect(company.find((k) => k.key.startsWith('linkedin:'))).toBeUndefined();

    const personal = contactDedupeKeys({
      provider: 'apify',
      personalLinkedinUrl: 'https://www.linkedin.com/in/jane',
    });
    expect(personal.find((k) => k.key.startsWith('linkedin:'))?.action).toBe('auto');
  });

  it('name+company+title is review-only', () => {
    const keys = contactDedupeKeys({
      provider: 'apify',
      fullName: 'Jane Doe',
      companyKey: 'domain:acme.com',
      jobTitle: 'CEO',
    });
    expect(keys).toHaveLength(1);
    expect(keys[0]?.action).toBe('review');
  });
});

describe('shouldReplaceField merge policy', () => {
  it('fills empty fields', () => {
    expect(
      shouldReplaceField({
        existingValue: null,
        existingVerified: false,
        existingHumanEdited: false,
        incomingValue: 'x',
        incomingVerified: false,
      }),
    ).toBe(true);
  });

  it('never overwrites verified with unverified', () => {
    expect(
      shouldReplaceField({
        existingValue: 'verified@acme.com',
        existingVerified: true,
        existingHumanEdited: false,
        incomingValue: 'guess@acme.com',
        incomingVerified: false,
      }),
    ).toBe(false);
  });

  it('never overwrites human corrections', () => {
    expect(
      shouldReplaceField({
        existingValue: 'corrected',
        existingVerified: false,
        existingHumanEdited: true,
        incomingValue: 'provider-value',
        incomingVerified: true,
      }),
    ).toBe(false);
  });

  it('upgrades unverified to verified', () => {
    expect(
      shouldReplaceField({
        existingValue: 'old@acme.com',
        existingVerified: false,
        existingHumanEdited: false,
        incomingValue: 'new@acme.com',
        incomingVerified: true,
      }),
    ).toBe(true);
  });

  it('ignores empty incoming values', () => {
    expect(
      shouldReplaceField({
        existingValue: 'keep',
        existingVerified: false,
        existingHumanEdited: false,
        incomingValue: '',
        incomingVerified: true,
      }),
    ).toBe(false);
  });
});
