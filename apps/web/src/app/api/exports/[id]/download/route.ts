import { NextResponse, type NextRequest } from 'next/server';
import { verifySignedToken } from '@leadfinder/security';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Redirect to a short-lived Supabase Storage signed URL for an export file.
 * The token minted by /exports/[id]/link is the only credential; links die
 * after 15 minutes and the export row's own expiry is enforced too. Files
 * live in a private bucket and are never publicly listable.
 */
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = request.nextUrl.searchParams.get('token') ?? '';

  const verification = verifySignedToken(token, 'export-download', process.env.APP_SIGNING_SECRET!);
  if (!verification.ok || verification.payload.sub !== id) {
    return NextResponse.json({ error: 'Invalid or expired download link.' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: exportRow } = await service
    .from('exports')
    .select('id, organization_id, status, file_path, format, expires_at, config, download_count')
    .eq('id', id)
    .eq('organization_id', verification.payload.org)
    .maybeSingle();
  if (!exportRow || exportRow.status !== 'ready' || !exportRow.file_path) {
    return NextResponse.json({ error: 'Export is not available.' }, { status: 404 });
  }
  if (exportRow.expires_at && new Date(exportRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Download window has expired.' }, { status: 410 });
  }

  const kind = (exportRow.config as { kind?: string } | null)?.kind ?? 'export';
  const fileName = `leadfinder-${kind}-${id.slice(0, 8)}.${exportRow.format}`;
  const { data: signed, error } = await service.storage
    .from('exports')
    .createSignedUrl(exportRow.file_path, 60, { download: fileName });
  if (error || !signed) {
    return NextResponse.json({ error: 'File was purged.' }, { status: 410 });
  }

  await service
    .from('exports')
    .update({
      download_count: (exportRow.download_count ?? 0) + 1,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq('id', id);
  await service.from('audit_logs').insert({
    organization_id: exportRow.organization_id,
    actor_type: 'user',
    action: 'export.downloaded',
    entity_kind: 'export',
    entity_id: id,
  });

  return NextResponse.redirect(signed.signedUrl);
}
