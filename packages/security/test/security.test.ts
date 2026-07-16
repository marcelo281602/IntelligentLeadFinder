import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, generateToken, secretFingerprint } from '../src/crypto';
import { constantTimeEquals, createSignedToken, verifySignedToken } from '../src/tokens';
import { REDACTED, redactObject, redactText, redactUrl } from '../src/redact';

const masterKey = randomBytes(32).toString('base64');

describe('envelope encryption', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret('apify_api_SECRETVALUE123', masterKey);
    expect(decryptSecret(sealed, masterKey)).toBe('apify_api_SECRETVALUE123');
  });

  it('never contains the plaintext in the envelope', () => {
    const sealed = encryptSecret('apify_api_SECRETVALUE123', masterKey);
    expect(sealed).not.toContain('SECRETVALUE');
  });

  it('produces unique ciphertexts for the same plaintext (random DEK/IV)', () => {
    expect(encryptSecret('same', masterKey)).not.toBe(encryptSecret('same', masterKey));
  });

  it('fails on the wrong master key', () => {
    const sealed = encryptSecret('secret', masterKey);
    const otherKey = randomBytes(32).toString('base64');
    expect(() => decryptSecret(sealed, otherKey)).toThrow();
  });

  it('rejects malformed master keys', () => {
    expect(() => encryptSecret('x', 'too-short')).toThrow(/32 bytes/);
  });

  it('detects tampering', () => {
    const sealed = encryptSecret('secret', masterKey);
    const parsed = JSON.parse(sealed) as { data: string };
    const [iv, tag, ct] = parsed.data.split('.') as [string, string, string];
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] = (flipped[0]! + 1) % 256;
    parsed.data = `${iv}.${tag}.${flipped.toString('base64')}`;
    expect(() => decryptSecret(JSON.stringify(parsed), masterKey)).toThrow();
  });

  it('fingerprints are stable, short, and non-reversible-looking', () => {
    const fp = secretFingerprint('apify_api_SECRETVALUE123');
    expect(fp).toHaveLength(8);
    expect(fp).toBe(secretFingerprint('apify_api_SECRETVALUE123'));
    expect(fp).not.toContain('SECRET');
  });

  it('generateToken yields high-entropy url-safe tokens', () => {
    const token = generateToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('signed tokens', () => {
  const secret = 'test-signing-secret-with-enough-length';

  it('round-trips and enforces purpose', () => {
    const token = createSignedToken(
      { purpose: 'export-download', sub: 'e1', org: 'o1' },
      60,
      secret,
    );
    const good = verifySignedToken(token, 'export-download', secret);
    expect(good.ok).toBe(true);
    const wrong = verifySignedToken(token, 'apify-callback', secret);
    expect(wrong).toEqual({ ok: false, reason: 'wrong-purpose' });
  });

  it('expires', () => {
    const now = 1_000_000;
    const token = createSignedToken({ purpose: 'p', sub: 's', org: 'o' }, 60, secret, now);
    expect(verifySignedToken(token, 'p', secret, now + 61)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects tampered payloads', () => {
    const token = createSignedToken({ purpose: 'p', sub: 's', org: 'o' }, 60, secret);
    const [body, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ purpose: 'p', sub: 'OTHER', org: 'o', exp: 9999999999 }),
    ).toString('base64url');
    expect(verifySignedToken(`${forged}.${sig}`, 'p', secret).ok).toBe(false);
    expect(verifySignedToken(`${body}.AAAA`, 'p', secret).ok).toBe(false);
  });

  it('constantTimeEquals compares safely', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'ab')).toBe(false);
  });
});

describe('redaction', () => {
  it('masks sensitive keys deeply', () => {
    const input = {
      run: {
        id: 'r1',
        apiToken: 'apify_api_abc123def456',
        nested: { Authorization: 'Bearer xyz' },
      },
      safe: 'value',
    };
    const out = redactObject(input);
    expect(out.run.apiToken).toBe(REDACTED);
    expect(out.run.nested.Authorization).toBe(REDACTED);
    expect(out.safe).toBe('value');
  });

  it('scrubs secrets embedded in strings', () => {
    expect(redactText('Authorization: Bearer abcdef123456789')).toContain(REDACTED);
    expect(redactText('token apify_api_AbCdEf12345678 leaked')).toContain(REDACTED);
  });

  it('scrubs sensitive URL query parameters', () => {
    const out = redactUrl('https://api.apify.com/v2/acts/x/runs?token=supersecret&limit=10');
    expect(out).not.toContain('supersecret');
    expect(out).toContain('limit=10');
  });

  it('redacts JWTs in strings', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(redactText(`sess=${jwt}`)).not.toContain('dozjgNryP4J3jVmNHl0w5N');
  });
});
