import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { verifySignedToken } from '@leadfinder/security';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Stream an export file against a short-lived signed token. The token is the
 * only credential — links die after 15 minutes and the export row's own
 * expiry is enforced too. Local-disk storage is the development mode;
 * production uses private object storage (docs/DEPLOYMENT.md).
 */
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
    .select('id, organization_id, status, file_path, format, expires_at, config')
    .eq('id', id)
    .eq('organization_id', verification.payload.org)
    .maybeSingle();
  if (!exportRow || exportRow.status !== 'ready' || !exportRow.file_path) {
    return NextResponse.json({ error: 'Export is not available.' }, { status: 404 });
  }
  if (exportRow.expires_at && new Date(exportRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Download window has expired.' }, { status: 410 });
  }
  if (!existsSync(exportRow.file_path)) {
    return NextResponse.json({ error: 'File was purged.' }, { status: 410 });
  }

  await service
    .from('exports')
    .update({
      download_count: ((exportRow as { download_count?: number }).download_count ?? 0) + 1,
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

  const kind = (exportRow.config as { kind?: string } | null)?.kind ?? 'export';
  const fileName = `leadfinder-${kind}-${id.slice(0, 8)}.${exportRow.format}`;
  const contentType =
    exportRow.format === 'csv'
      ? 'text/csv; charset=utf-8'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const { size } = await stat(exportRow.file_path);
  const stream = Readable.toWeb(createReadStream(exportRow.file_path)) as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
