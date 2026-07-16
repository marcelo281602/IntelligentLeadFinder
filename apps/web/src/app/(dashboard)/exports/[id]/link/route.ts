import { NextResponse, type NextRequest } from 'next/server';
import { createSignedToken } from '@leadfinder/security';
import { hasPermission } from '@leadfinder/core';
import { requireOrg } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Mint a short-lived signed download URL for a ready export, after a fresh
 * server-side permission check, and redirect to it. TTL: 15 minutes.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await context.params;

  if (!hasPermission(ctx.role, 'exports:download', ctx.overrides)) {
    return NextResponse.json({ error: 'Your role cannot download exports.' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: exportRow } = await supabase
    .from('exports')
    .select('id, status, expires_at')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!exportRow || exportRow.status !== 'ready') {
    return NextResponse.json({ error: 'Export is not available.' }, { status: 404 });
  }
  if (exportRow.expires_at && new Date(exportRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Download window has expired.' }, { status: 410 });
  }

  const token = createSignedToken(
    { purpose: 'export-download', sub: exportRow.id, org: ctx.orgId },
    15 * 60,
    process.env.APP_SIGNING_SECRET!,
  );
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'export.download_link_issued',
    entityKind: 'export',
    entityId: exportRow.id,
  });
  const url = new URL(`/api/exports/${exportRow.id}/download`, request.nextUrl.origin);
  url.searchParams.set('token', token);
  return NextResponse.redirect(url);
}
