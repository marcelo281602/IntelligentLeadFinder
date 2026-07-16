import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed, expiring, purpose-bound tokens.
 *
 * Used for short-lived export download URLs and provider callback
 * verification. Tokens are stateless: payload + expiry are authenticated by
 * an HMAC-SHA256 signature over the canonical serialization. Verification is
 * constant-time and always checks purpose and expiry.
 */

export interface SignedTokenPayload {
  /** What this token authorizes, e.g. "export-download" or "apify-callback". */
  purpose: string;
  /** Subject identifier (export id, run id, ...). */
  sub: string;
  /** Organization scope. */
  org: string;
  /** Unix epoch seconds after which the token is invalid. */
  exp: number;
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function createSignedToken(
  payload: Omit<SignedTokenPayload, 'exp'>,
  ttlSeconds: number,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): string {
  const full: SignedTokenPayload = { ...payload, exp: nowEpochSeconds + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export type TokenVerification =
  | { ok: true; payload: SignedTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-purpose' };

export function verifySignedToken(
  token: string,
  expectedPurpose: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): TokenVerification {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, signature] = parts;

  const expected = sign(body, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let payload: SignedTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignedTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.exp !== 'number' || payload.exp < nowEpochSeconds) {
    return { ok: false, reason: 'expired' };
  }
  if (payload.purpose !== expectedPurpose) {
    return { ok: false, reason: 'wrong-purpose' };
  }
  return { ok: true, payload };
}

/** Constant-time string equality for secret comparison. */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
