import { NextResponse, type NextRequest } from 'next/server';
import { buildGoogleAuthUrl } from '@leadfinder/providers';
import { requirePermission } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { googleOAuthConfig, signOAuthState } from '@/lib/oauth-state';

export const runtime = 'nodejs';

/**
 * Begin the "Sign in with Google" Sheets flow. Requires the destinations
 * permission, captures the pending destination config into signed state, and
 * redirects the user to Google's consent screen. No secret is written here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ctx = await requirePermission('destinations:sync');
  enforceRateLimit(`gsheets-oauth:${ctx.userId}`, 10, 300_000);

  const config = googleOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL('/integrations?derror=Google+sign-in+is+not+configured', request.url),
    );
  }

  const params = request.nextUrl.searchParams;
  const name = (params.get('name') ?? '').trim().slice(0, 120) || 'Google Sheet';
  const includeContacts = params.get('includeContacts') === '1';
  const autoSync = params.get('autoSync') !== '0';

  const state = signOAuthState({ orgId: ctx.orgId, userId: ctx.userId, name, includeContacts, autoSync });
  return NextResponse.redirect(buildGoogleAuthUrl(config, state));
}
