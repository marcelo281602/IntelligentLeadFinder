import { describe, expect, it } from 'vitest';
import {
  appendRows,
  buildGoogleAuthUrl,
  createLeadsSpreadsheet,
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  GoogleSheetsError,
  refreshAccessToken,
  GOOGLE_OAUTH_SCOPES,
} from '../src/google-sheets';

const config = {
  clientId: 'client-123',
  clientSecret: 'secret-xyz',
  redirectUri: 'https://app.example.com/api/oauth/google/callback',
};

function jsonFetch(status: number, body: unknown, capture?: (u: string, i: RequestInit) => void) {
  const impl: typeof fetch = async (url, init) => {
    capture?.(String(url), init ?? {});
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return impl;
}

describe('buildGoogleAuthUrl', () => {
  it('requests only drive.file (+ openid/email) with offline consent', () => {
    const url = new URL(buildGoogleAuthUrl(config, 'STATE-TOKEN'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '));
    expect(url.searchParams.get('scope')).toContain('drive.file');
    // No full-drive or spreadsheets (sensitive) scope leaks in.
    expect(url.searchParams.get('scope')).not.toContain('auth/spreadsheets');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('STATE-TOKEN');
    expect(url.searchParams.get('client_id')).toBe('client-123');
  });
});

describe('token exchange & refresh', () => {
  it('exchanges the auth code for tokens with the right grant', async () => {
    let sentBody = '';
    const fetchImpl = jsonFetch(200, { access_token: 'at', refresh_token: 'rt' }, (_u, i) => {
      sentBody = String(i.body);
    });
    const tokens = await exchangeCodeForTokens(config, 'the-code', fetchImpl);
    expect(tokens.refresh_token).toBe('rt');
    expect(sentBody).toContain('grant_type=authorization_code');
    expect(sentBody).toContain('code=the-code');
    expect(sentBody).toContain('client_secret=secret-xyz');
  });

  it('refreshes an access token from a refresh token', async () => {
    let sentBody = '';
    const fetchImpl = jsonFetch(200, { access_token: 'fresh-at' }, (_u, i) => {
      sentBody = String(i.body);
    });
    const at = await refreshAccessToken(config, 'stored-rt', fetchImpl);
    expect(at).toBe('fresh-at');
    expect(sentBody).toContain('grant_type=refresh_token');
    expect(sentBody).toContain('refresh_token=stored-rt');
  });

  it('surfaces Google token errors as GoogleSheetsError', async () => {
    const fetchImpl = jsonFetch(400, { error: 'invalid_grant', error_description: 'bad' });
    await expect(refreshAccessToken(config, 'x', fetchImpl)).rejects.toBeInstanceOf(GoogleSheetsError);
  });
});

describe('spreadsheet create & append', () => {
  it('creates a titled spreadsheet with a Leads tab', async () => {
    let url = '';
    let body = '';
    const fetchImpl = jsonFetch(
      200,
      { spreadsheetId: 'sheet-1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-1/edit' },
      (u, i) => {
        url = u;
        body = String(i.body);
      },
    );
    const result = await createLeadsSpreadsheet('AT', 'LeadFinder — Acme', 'Leads', fetchImpl);
    expect(result.spreadsheetId).toBe('sheet-1');
    expect(url).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    expect(body).toContain('LeadFinder — Acme');
    expect(body).toContain('"title":"Leads"');
  });

  it('appends rows RAW to the tab range and returns the count', async () => {
    let url = '';
    let body = '';
    const fetchImpl = jsonFetch(200, { updates: { updatedRows: 2 } }, (u, i) => {
      url = u;
      body = String(i.body);
    });
    const n = await appendRows('AT', 'sheet-1', 'Leads', [
      ['Company', 'City'],
      ['Acme', 'Austin'],
    ], fetchImpl);
    expect(n).toBe(2);
    expect(url).toContain('/v4/spreadsheets/sheet-1/values/Leads!A1:append');
    expect(url).toContain('valueInputOption=RAW');
    expect(body).toContain('"Acme"');
  });

  it('nulls become empty strings, never dropped', async () => {
    let body = '';
    const fetchImpl = jsonFetch(200, {}, (_u, i) => {
      body = String(i.body);
    });
    await appendRows('AT', 'sheet-1', 'Leads', [['Acme', null, 5]], fetchImpl);
    expect(JSON.parse(body).values).toEqual([['Acme', '', 5]]);
  });

  it('appending zero rows is a no-op (no request)', async () => {
    let called = false;
    const fetchImpl = jsonFetch(200, {}, () => {
      called = true;
    });
    expect(await appendRows('AT', 'sheet-1', 'Leads', [], fetchImpl)).toBe(0);
    expect(called).toBe(false);
  });

  it('reads the account email for the connection label', async () => {
    const fetchImpl = jsonFetch(200, { email: 'owner@acme.com' });
    expect(await getGoogleAccountEmail('AT', fetchImpl)).toBe('owner@acme.com');
  });
});
