import { NextResponse, type NextRequest } from 'next/server';
import {
  createLeadsSpreadsheet,
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  GoogleSheetsError,
} from '@leadfinder/providers';
import { encryptSecret, secretFingerprint } from '@leadfinder/security';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { googleOAuthConfig, verifyOAuthState } from '@/lib/oauth-state';

export const runtime = 'nodejs';

function fail(request: NextRequest, message: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/integrations?derror=${encodeURIComponent(message)}`, request.url),
  );
}

/**
 * Google OAuth callback for the Sheets destination. The signed `state` is the
 * CSRF guard and carries the pending destination config. We exchange the code
 * for a refresh token, create the client's leads spreadsheet (drive.file), and
 * store the destination with the refresh token encrypted at rest.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  if (params.get('error')) {
    return fail(request, 'Google sign-in was cancelled.');
  }
  const code = params.get('code');
  const stateToken = params.get('state');
  if (!code || !stateToken) return fail(request, 'Missing Google authorization response.');

  const state = verifyOAuthState(stateToken);
  if (!state) return fail(request, 'The Google sign-in link expired — please try again.');

  // The logged-in session must match the org the state was minted for.
  const ctx = await requirePermission('destinations:sync');
  if (ctx.orgId !== state.orgId) return fail(request, 'Session and Google sign-in did not match.');

  const config = googleOAuthConfig();
  if (!config) return fail(request, 'Google sign-in is not configured.');

  try {
    const tokens = await exchangeCodeForTokens(config, code);
    if (!tokens.refresh_token) {
      return fail(
        request,
        'Google did not return a refresh token. Remove LeadFinder from your Google account permissions and try again.',
      );
    }
    const email = await getGoogleAccountEmail(tokens.access_token);
    const sheet = await createLeadsSpreadsheet(tokens.access_token, `LeadFinder — ${state.name}`, 'Leads');

    const envelope = encryptSecret(tokens.refresh_token, process.env.APP_ENCRYPTION_KEY!);
    const service = createServiceClient();
    const { data: dest, error } = await service
      .from('destinations')
      .insert({
        organization_id: state.orgId,
        kind: 'google_sheets',
        connection_method: 'google_oauth',
        name: state.name,
        endpoint_url: sheet.spreadsheetUrl,
        spreadsheet_id: sheet.spreadsheetId,
        sheet_tab: 'Leads',
        google_account_email: email,
        secret_envelope: envelope,
        secret_fingerprint: secretFingerprint(tokens.refresh_token),
        include_contacts: state.includeContacts,
        auto_sync: state.autoSync,
        created_by: state.userId,
      })
      .select('id')
      .single();
    if (error || !dest) {
      const message =
        error?.code === '23505'
          ? 'A destination with that name already exists.'
          : 'Could not save the Google Sheets destination.';
      return fail(request, message);
    }

    await audit({
      orgId: state.orgId,
      actorUserId: ctx.userId,
      action: 'destination.created',
      entityKind: 'destination',
      entityId: dest.id,
      details: {
        kind: 'google_sheets',
        connectionMethod: 'google_oauth',
        name: state.name,
        account: email,
        autoSync: state.autoSync,
      },
    });
    return NextResponse.redirect(new URL('/integrations?dgoauth=1', request.url));
  } catch (error) {
    const message =
      error instanceof GoogleSheetsError ? error.message : 'Google sign-in failed. Please try again.';
    return fail(request, message);
  }
}
