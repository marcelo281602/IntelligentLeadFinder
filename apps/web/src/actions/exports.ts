'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { columnsForKind, exportIncludesPersonalData } from '@leadfinder/core';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const exportSchema = z.object({
  format: z.enum(['csv', 'xlsx']),
  kind: z.enum(['companies', 'contacts']),
  columns: z.array(z.string()).min(1, 'Choose at least one column.').max(40),
  verifiedOnly: z.boolean(),
  listId: z.string().uuid().nullable(),
  confirmPersonalData: z.boolean(),
});

/**
 * Create an export: selection is authorized and snapshotted server-side into
 * export_items, then a background job generates the file. Downloads use
 * short-lived signed URLs.
 */
export async function createExport(formData: FormData): Promise<void> {
  const ctx = await requirePermission('exports:create');
  enforceRateLimit(`export:${ctx.userId}`, 10, 300_000);

  const parsed = exportSchema.safeParse({
    format: formData.get('format'),
    kind: formData.get('kind'),
    columns: formData.getAll('columns').map(String),
    verifiedOnly: formData.get('verifiedOnly') === 'on',
    listId: (formData.get('listId') as string) || null,
    confirmPersonalData: formData.get('confirmPersonalData') === 'on',
  });
  if (!parsed.success) {
    redirect(`/exports/new?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }
  const { format, kind, listId, verifiedOnly } = parsed.data;

  const validKeys = new Set(columnsForKind(kind).map((c) => c.key));
  const columns = parsed.data.columns.filter((key) => validKeys.has(key));
  if (columns.length === 0) {
    redirect(`/exports/new?error=${encodeURIComponent('Choose at least one valid column.')}`);
  }

  const personal = exportIncludesPersonalData(kind, columns);
  if (personal && !parsed.data.confirmPersonalData) {
    redirect(
      `/exports/new?error=${encodeURIComponent('This export contains personal data — confirm the acknowledgement checkbox.')}&kind=${kind}`,
    );
  }

  // Resolve the selection server-side under RLS.
  const supabase = await createSupabaseServerClient();
  let entityIds: string[] = [];
  if (kind === 'companies') {
    if (listId) {
      const { data } = await supabase
        .from('list_companies')
        .select('company_id')
        .eq('list_id', listId)
        .eq('organization_id', ctx.orgId)
        .limit(10_000);
      entityIds = (data ?? []).map((r) => r.company_id as string);
    } else {
      const { data } = await supabase
        .from('companies')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .limit(10_000);
      entityIds = (data ?? []).map((r) => r.id as string);
    }
  } else {
    if (listId) {
      const { data } = await supabase
        .from('list_contacts')
        .select('contact_id')
        .eq('list_id', listId)
        .eq('organization_id', ctx.orgId)
        .limit(10_000);
      entityIds = (data ?? []).map((r) => r.contact_id as string);
    } else {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', ctx.orgId)
        .is('deleted_at', null)
        .limit(10_000);
      entityIds = (data ?? []).map((r) => r.id as string);
    }
  }
  if (entityIds.length === 0) {
    redirect(
      `/exports/new?error=${encodeURIComponent('Nothing to export in that selection.')}&kind=${kind}`,
    );
  }

  const columnDefs = columnsForKind(kind).filter((c) => columns.includes(c.key));
  const service = createServiceClient();
  const { data: exportRow, error } = await service
    .from('exports')
    .insert({
      organization_id: ctx.orgId,
      format,
      status: 'pending',
      config: {
        kind,
        columns: columnDefs.map((c) => ({ key: c.key, header: c.label })),
        listId,
      },
      includes_personal_data: personal,
      verified_only: verifiedOnly,
      requested_by: ctx.userId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !exportRow) {
    redirect(`/exports/new?error=${encodeURIComponent('Could not create the export.')}`);
  }

  const entityKind = kind === 'companies' ? 'company' : 'contact';
  // Chunked snapshot of the authorized selection.
  for (let i = 0; i < entityIds.length; i += 500) {
    await service.from('export_items').insert(
      entityIds.slice(i, i + 500).map((id) => ({
        export_id: exportRow.id,
        organization_id: ctx.orgId,
        entity_kind: entityKind,
        entity_id: id,
      })),
    );
  }

  await enqueueJob({
    kind: 'generate_export',
    orgId: ctx.orgId,
    exportId: exportRow.id,
    idempotencyKey: `export:${exportRow.id}`,
    payload: { exportId: exportRow.id },
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'export.requested',
    entityKind: 'export',
    entityId: exportRow.id,
    details: { format, kind, rows: entityIds.length, personal },
  });
  revalidatePath('/exports');
  redirect('/exports?created=1');
}
