import { describe, expect, it } from 'vitest';
import {
  normalizeAddress,
  normalizeCompanyName,
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizePhone,
  normalizeUrl,
  rootDomain,
} from '../src/normalize';

describe('normalizeUrl', () => {
  it('adds https and lowercases the host', () => {
    expect(normalizeUrl('Example.COM/Path')).toBe('https://example.com/Path');
  });
  it('strips tracking parameters and fragments', () => {
    expect(normalizeUrl('https://a.com/p?utm_source=x&q=1#frag')).toBe('https://a.com/p?q=1');
  });
  it('rejects non-http protocols', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('ftp://files.example.com')).toBeNull();
  });
  it('returns null for garbage', () => {
    expect(normalizeUrl('   ')).toBeNull();
  });
});

describe('rootDomain', () => {
  it('strips www and subdomains', () => {
    expect(rootDomain('https://www.shop.example.com/x')).toBe('example.com');
  });
  it('handles two-part TLDs', () => {
    expect(rootDomain('https://www.widgets.co.uk')).toBe('widgets.co.uk');
    expect(rootDomain('https://store.acme.com.au/home')).toBe('acme.com.au');
  });
  it('returns null when there is no dot', () => {
    expect(rootDomain('localhost')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });
  it('rejects invalid addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('"display" <a@b.com>')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('keeps explicit international numbers', () => {
    expect(normalizePhone('+1 (555) 010-4477').e164).toBe('+15550104477');
  });
  it('converts 00-prefix to +', () => {
    expect(normalizePhone('0049 30 901820').e164).toBe('+4930901820');
  });
  it('applies country hint with trunk-zero stripping', () => {
    expect(normalizePhone('030 901820', 'DE').e164).toBe('+4930901820');
    expect(normalizePhone('(555) 010-4477', 'US').e164).toBe('+15550104477');
  });
  it('never fabricates a country', () => {
    const result = normalizePhone('555-0104');
    expect(result.e164).toBeNull();
    expect(result.digits).toBe('5550104');
  });
  it('rejects absurd lengths', () => {
    expect(normalizePhone('+123456789012345678').e164).toBeNull();
  });
});

describe('normalizeCompanyName', () => {
  it('strips legal suffixes and punctuation', () => {
    expect(normalizeCompanyName("Miller & Sons, LLC")).toBe('miller and sons');
    expect(normalizeCompanyName('ACME GmbH')).toBe('acme');
  });
  it('keeps the name when only a suffix', () => {
    expect(normalizeCompanyName('LLC')).toBe('llc');
  });
});

describe('normalizeAddress', () => {
  it('flattens punctuation and casing', () => {
    expect(normalizeAddress('123 Main St., Suite #4')).toBe('123 main st suite 4');
  });
});

describe('normalizeLinkedInUrl', () => {
  it('classifies personal profiles', () => {
    const result = normalizeLinkedInUrl('https://www.linkedin.com/in/jane-doe/');
    expect(result).toEqual({ url: 'https://www.linkedin.com/in/jane-doe', kind: 'personal' });
  });
  it('classifies company pages', () => {
    const result = normalizeLinkedInUrl('linkedin.com/company/acme-inc');
    expect(result?.kind).toBe('company');
  });
  it('rejects non-LinkedIn hosts', () => {
    expect(normalizeLinkedInUrl('https://evil.com/in/jane')).toBeNull();
  });
});
