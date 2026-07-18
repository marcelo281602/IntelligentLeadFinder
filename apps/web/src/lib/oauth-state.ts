import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed, expiring state for the Google OAuth round-trip. It is the CSRF
 * guard (only we can mint it) and carries the pending destination config so
 * the callback can create the destination without a server-side pending row.
 * Signed with APP_SIGNING_SECRET; never contains a secret.
 */

export interface OAuthStatePayload {
  orgId: string;
  userId: string;
  name: string;
  includeContacts: boolean;
  autoSync: boolean;
  /** Unix epoch seconds after which the state is rejected. */
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function signOAuthState(
  payload: Omit<OAuthStatePayload, 'exp'>,
  ttlSeconds = 600,
  secret = process.env.APP_SIGNING_SECRET!,
): string {
  const full: OAuthStatePayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyOAuthState(
  token: string,
  secret = process.env.APP_SIGNING_SECRET!,
): OAuthStatePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = sign(body, secret);
  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** Server-side OAuth config, or null when Google OAuth is not configured. */
export function googleOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return { clientId, clientSecret, redirectUri: `${appUrl}/api/oauth/google/callback` };
}
