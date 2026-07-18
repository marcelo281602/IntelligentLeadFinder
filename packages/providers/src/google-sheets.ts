/**
 * Google Sheets destination over OAuth (drive.file scope + app-created sheet).
 *
 * Design choices that keep this out of Google's sensitive-scope verification:
 *  - Scope is `drive.file` (+ openid/email for the account label). drive.file
 *    is non-sensitive and grants access ONLY to files this app creates or the
 *    user explicitly opens — so we CREATE the client's leads spreadsheet and
 *    append to it, never touching any other file in their Drive.
 *  - No Picker, no full Drive/Sheets read.
 *
 * All network I/O is injectable for tests. Access tokens are short-lived and
 * derived from an encrypted refresh token at sync time; nothing here persists
 * secrets.
 */

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
] as const;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class GoogleSheetsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GoogleSheetsError';
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Build the consent-screen URL. `state` is our signed CSRF/context token. */
export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_OAUTH_SCOPES.join(' '));
  // offline + consent so Google returns a refresh token we can store.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

async function postForm(
  endpoint: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new GoogleSheetsError(
      `Google token request failed: ${json.error_description ?? json.error ?? res.status}`,
      res.status,
    );
  }
  return json;
}

/** Exchange the one-time auth code for tokens (includes the refresh token). */
export function exchangeCodeForTokens(
  config: GoogleOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  return postForm(
    TOKEN_ENDPOINT,
    {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
  );
}

/** Trade a stored refresh token for a fresh short-lived access token. */
export async function refreshAccessToken(
  config: Pick<GoogleOAuthConfig, 'clientId' | 'clientSecret'>,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await postForm(
    TOKEN_ENDPOINT,
    {
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    },
    fetchImpl,
  );
  if (!res.access_token) throw new GoogleSheetsError('Google did not return an access token.');
  return res.access_token;
}

/** Read the connected account's email (for a human-facing label only). */
export async function getGoogleAccountEmail(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { email?: string };
  return json.email ?? null;
}

/**
 * Create a leads spreadsheet in the user's Drive (allowed under drive.file
 * because the app is the creator). Returns the id and shareable URL.
 */
export async function createLeadsSpreadsheet(
  accessToken: string,
  title: string,
  tabName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const res = await fetchImpl(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: tabName } }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.spreadsheetId) {
    throw new GoogleSheetsError(
      `Could not create the spreadsheet: ${json.error?.message ?? res.status}`,
      res.status,
    );
  }
  return {
    spreadsheetId: json.spreadsheetId,
    spreadsheetUrl:
      json.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${json.spreadsheetId}/edit`,
  };
}

/**
 * Append rows to the leads tab using values.append (RAW so our own
 * formula-injection escaping is preserved and Sheets never re-interprets a
 * cell). Returns the number of rows appended.
 */
export async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  rows: Array<Array<string | number | null>>,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (rows.length === 0) return 0;
  const range = `${encodeURIComponent(tabName)}!A1`;
  const url =
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows.map((r) => r.map((c) => (c === null ? '' : c))) }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleSheetsError(
      `Sheets append failed: ${json.error?.message ?? res.status}`,
      res.status,
    );
  }
  return rows.length;
}
