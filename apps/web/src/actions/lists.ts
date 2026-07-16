'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function createList(formData: FormData): Promise<void> {
  const ctx = await requirePermission('lists:manage');
  const name = z.string().trim().min(1).max(200).safeParse(formData.get('name'));
  if (!name.success) {
    redirect(`/lists?error=${encodeURIComponent('List name is required.')}`);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('lists')
    .insert({
      organization_id: ctx.orgId,
      name: name.data,
      description: String(formData.get('description') ?? '').slice(0, 500) || null,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) {
    const message =
      error.code === '23505'
        ? 'A list with that name already exists.'
        : 'Could not create the list.';
    redirect(`/lists?error=${encodeURIComponent(message)}`);
  }
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'list.created',
    entityKind: 'list',
    entityId: data!.id,
    details: { name: name.data },
  });
  revalidatePath('/lists');
  redirect(`/lists/${data!.id}`);
}

const addSchema = z.object({
  listId: z.string().uuid(),
  entityKind: z.enum(['company', 'contact']),
  ids: z.array(z.string().uuid()).min(1, 'Select at least one record.').max(500),
});

/** Bulk add selected records to a list (or create the list inline). */
export async function addToList(formData: FormData): Promise<void> {
  const ctx = await requirePermission('lists:manage');
  const entityKind = formData.get('entityKind') === 'contact' ? 'contact' : 'company';
  const backPath = entityKind === 'company' ? '/companies' : '/contacts';
  const ids = formData.getAll('ids').map(String);

  const supabase = await createSupabaseServerClient();
  let listId = String(formData.get('listId') ?? '');
  const newListName = String(formData.get('newListName') ?? '').trim();
  if (listId === '__new__' || (!listId && newListName)) {
    if (!newListName) redirect(`${backPath}?error=${encodeURIComponent('Name the new list.')}`);
    const { data: created, error } = await supabase
      .from('lists')
      .insert({ organization_id: ctx.orgId, name: newListName, created_by: ctx.userId })
      .select('id')
      .single();
    if (error || !created) {
      redirect(`${backPath}?error=${encodeURIComponent('Could not create the list.')}`);
    }
    listId = created.id;
  }

  const parsed = addSchema.safeParse({ listId, entityKind, ids });
  if (!parsed.success) {
    redirect(`${backPath}?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  // RLS restricts both the list and the records to this org; the explicit
  // org filter is defense in depth.
  const table = entityKind === 'company' ? 'list_companies' : 'list_contacts';
  const fk = entityKind === 'company' ? 'company_id' : 'contact_id';
  const rows = parsed.data.ids.map((id) => ({
    list_id: parsed.data.listId,
    [fk]: id,
    organization_id: ctx.orgId,
    added_by: ctx.userId,
  }));
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: `list_id,${fk}`, ignoreDuplicates: true });
  if (error) {
    redirect(`${backPath}?error=${encodeURIComponent('Could not add records to the list.')}`);
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'list.records_added',
    entityKind: 'list',
    entityId: parsed.data.listId,
    details: { count: parsed.data.ids.length, entityKind },
  });
  revalidatePath('/lists');
  redirect(`/lists/${parsed.data.listId}?added=${parsed.data.ids.length}`);
}

export async function removeFromList(formData: FormData): Promise<void> {
  const ctx = await requirePermission('lists:manage');
  const parsed = addSchema.safeParse({
    listId: formData.get('listId'),
    entityKind: formData.get('entityKind') === 'contact' ? 'contact' : 'company',
    ids: formData.getAll('ids').map(String),
  });
  if (!parsed.success) redirect('/lists');

  const supabase = await createSupabaseServerClient();
  const table = parsed.data.entityKind === 'company' ? 'list_companies' : 'list_contacts';
  const fk = parsed.data.entityKind === 'company' ? 'company_id' : 'contact_id';
  await supabase
    .from(table)
    .delete()
    .eq('list_id', parsed.data.listId)
    .eq('organization_id', ctx.orgId)
    .in(fk, parsed.data.ids);
  revalidatePath(`/lists/${parsed.data.listId}`);
  redirect(`/lists/${parsed.data.listId}`);
}
