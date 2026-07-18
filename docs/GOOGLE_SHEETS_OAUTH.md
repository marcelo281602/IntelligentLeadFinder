# Google Sheets destination — "Sign in with Google" (OAuth)

A client can connect a Google Sheets destination two ways:

1. **Apps Script / webhook** (existing) — the client deploys a small Apps
   Script web app and pastes its URL + secret. Zero setup on our side.
2. **Sign in with Google** (this doc) — the client clicks a button, approves
   access, and we create a leads spreadsheet in their Drive and append to it.

Both feed the same auto-sync pipeline and per-record delivery ledger. The
OAuth option is **only offered when `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET` are set** — otherwise only the Apps Script path
shows.

## Why `drive.file` (and not `spreadsheets`)

We use the **`drive.file`** scope (plus `openid email` for the account label).
`drive.file` is a **non-sensitive** scope: it grants access only to files this
app creates or the user explicitly opens. We *create* the client's leads sheet,
so we can write to it — and to nothing else in their Drive.

This deliberately avoids the `.../auth/spreadsheets` (sensitive) scope, which
would trigger Google's full app-verification (privacy policy, demo video, an
"unverified app" warning, and a 100-user cap until approved). With
`drive.file` you still complete standard OAuth branding, but there is no
sensitive-scope security assessment.

## One-time Google Cloud setup (manual — operator does this)

1. Google Cloud Console → create/select a project.
2. **APIs & Services → Enabled APIs** → enable **Google Sheets API** and
   **Google Drive API**.
3. **OAuth consent screen** → External → fill app name, support email, logo,
   authorized domain (your app domain), and add the scopes
   `.../auth/drive.file`, `openid`, `email`. Add test users while in Testing.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI:
     `https://<your-app-domain>/api/oauth/google/callback`
     (and `http://localhost:3000/api/oauth/google/callback` for local dev).
5. Copy the **Client ID** and **Client secret** into env:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
   Set the same on Vercel (production) and locally in `.env`.
6. Publish the consent screen when ready for all users (Testing mode caps at
   100 users; `drive.file` does not require the sensitive-scope review).

## Flow

```
Integrations → Destinations → Google Sheets → "Sign in with Google"
  → GET /api/oauth/google/start        (auth + destinations:sync; signs state)
  → Google consent (drive.file, offline, prompt=consent)
  → GET /api/oauth/google/callback     (verifies signed state = CSRF guard)
      → exchange code → refresh_token (+ access_token)
      → create spreadsheet "LeadFinder — <name>" with a Leads tab
      → store destination: connection_method='google_oauth',
        secret_envelope = encrypted refresh token, endpoint_url = sheet URL,
        spreadsheet_id, google_account_email
  → back to Integrations (sheet connected; future runs auto-sync)
```

At sync time the worker (`apps/worker/src/pipeline/sync-destinations.ts`)
branches on `connection_method`:

- `google_oauth`: refresh token → access token → `values.append` (RAW) to the
  `Leads` tab. The column header is written once (`header_written`).
- `apps_script`/webhook: the existing signed-HTTPS POST.

## Security

- The **refresh token** is envelope-encrypted (`APP_ENCRYPTION_KEY`) in
  `destinations.secret_envelope`; only a fingerprint is ever shown. It is
  decrypted only in server/worker code.
- The OAuth **state** is an HMAC-signed, 10-minute-expiry token
  (`APP_SIGNING_SECRET`) carrying the pending destination config — it is the
  CSRF guard, and the callback additionally checks the session org matches.
- Scope is `drive.file`; we never request broad Drive or Sheets access.
- Cell values are escaped against spreadsheet formula injection (shared
  `destinationRow`, `valueInputOption=RAW`).
- Disconnecting a destination soft-deletes it and stops syncs; it does not
  revoke the Google grant — the client can also remove access at
  https://myaccount.google.com/permissions.

## Rollback / disable

Unset `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` → the "Sign in with Google" option
disappears and existing OAuth destinations stop syncing (the worker reports a
clear "not configured" error) while the Apps Script/webhook path is unaffected.
Migration `0015` is additive (nullable/defaulted columns); no reversal needed.

## Verified vs. not

- Unit-tested (`packages/providers/test/google-sheets-contract.test.ts`):
  auth-URL scope/params, code exchange, token refresh, spreadsheet create,
  RAW append (incl. null→"" and zero-row no-op), account email.
- **Not yet exercised live**: the real Google round-trip and Sheets append
  require a real OAuth client. Configure the env vars above, then connect a
  test sheet and click **Test** to confirm end-to-end before relying on it.
