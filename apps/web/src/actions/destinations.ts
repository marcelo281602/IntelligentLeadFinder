'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { buildDestinationPayload, DESTINATION_KINDS, type DestinationKind } from '@leadfinder/core';
import { deliverToDestination } from '@leadfinder/providers';
import { encryptSecret, generateToken, secretFingerprint } from '@leadfinder/security';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { enqueueJob } from '@/lib/jobs';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const createSchema = z.object({
  kind: z.enum(DESTINATION_KINDS),
  name: z.string().trim().min(1).max(120),
  endpointUrl: z.string().url().startsWith('https://', 'Destination URL must use HTTPS'),
  includeContacts: z.boolean(),
  autoSync: z.boolean(),
  // Optional client-generated shared secret (already embedded in the user's
  // Apps Script). When absent, the server generates one.
  secret: z.string().trim().min(16).max(200).optional(),
});

/** Create a standing destination (Google Sheet / webhook). Secret shown once. */
export async function createDestination(formData: FormData): Promise<void> {
  const ctx = await requirePermission('destinations:sync');
  enforceRateLimit(`dest-create:${ctx.userId}`, 10, 300_000);

  const parsed = createSchema.safeParse({
    kind: formData.get('kind'),
    name: formData.get('name'),
    endpointUrl: formData.get('endpointUrl'),
    includeContacts: formData.get('includeContacts') === 'on',
    autoSync: formData.get('autoSync') === 'on',
    secret: (formData.get('secret') as string) || undefined,
  });
  if (!parsed.success) {
    redirect(`/integrations?derror=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  const secret = parsed.data.secret ?? generateToken(24);
  const envelope = encryptSecret(secret, process.env.APP_ENCRYPTION_KEY!);
  const service = createServiceClient();
  const { data: dest, error } = await service
    .from('destinations')
    .insert({
      organization_id: ctx.orgId,
      kind: parsed.data.kind,
      name: parsed.data.name,
      endpoint_url: parsed.data.endpointUrl,
      secret_envelope: envelope,
      secret_fingerprint: secretFingerprint(secret),
      include_contacts: parsed.data.includeContacts,
      auto_sync: parsed.data.autoSync,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error || !dest) {
    const message =
      error?.code === '23505'
        ? 'A destination with that name already exists.'
        : 'Could not save the destination.';
    redirect(`/integrations?derror=${encodeURIComponent(message)}`);
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'destination.created',
    entityKind: 'destination',
    entityId: dest.id,
    details: { kind: parsed.data.kind, name: parsed.data.name, autoSync: parsed.data.autoSync },
  });
  revalidatePath('/integrations');
  // Show the secret once so the user can paste it into their Apps Script/webhook.
  redirect(
    `/integrations?dsecret=${encodeURIComponent(secret)}&dname=${encodeURIComponent(parsed.data.name)}`,
  );
}

export async function testDestination(formData: FormData): Promise<void> {
  const ctx = await requirePermission('destinations:sync');
  const id = z.string().uuid().safeParse(formData.get('destinationId'));
  if (!id.success) redirect('/integrations');
  enforceRateLimit(`dest-test:${ctx.orgId}`, 20, 60_000);

  const service = createServiceClient();
  const { data: dest } = await service
    .from('destinations')
    .select(
      'id, kind, connection_method, name, endpoint_url, secret_envelope, include_contacts, spreadsheet_id, sheet_tab, header_written',
    )
    .eq('id', id.data)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dest) redirect('/integrations');

  const { decryptSecret } = await import('@leadfinder/security');
  const testLead = {
    companyName: 'LeadFinder Test Row',
    category: 'Connection test',
    website: 'https://example.com',
    companyEmail: 'test@example.com',
    companyPhone: '+10000000000',
    companyLinkedin: null,
    address: '1 Test Street',
    city: 'Testville',
    country: 'US',
    rating: 5,
    reviews: 1,
    mapsUrl: null,
    placeId: null,
    source: 'leadfinder-test',
    contactName: null,
    contactTitle: null,
    contactWorkEmail: null,
    contactEmailStatus: null,
    contactPhone: null,
    contactPersonalLinkedin: null,
    collectedAt: new Date().toISOString(),
  };

  let result: { ok: boolean; error?: string };
  if (dest.connection_method === 'google_oauth') {
    // Append a sample row straight to the sheet via the OAuth refresh token.
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    try {
      if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured.');
      if (!dest.spreadsheet_id) throw new Error('Destination is missing its spreadsheet id.');
      const { refreshAccessToken, appendRows } = await import('@leadfinder/providers');
      const { destinationColumns, destinationRow } = await import('@leadfinder/core');
      const refreshToken = decryptSecret(dest.secret_envelope, process.env.APP_ENCRYPTION_KEY!);
      const accessToken = await refreshAccessToken({ clientId, clientSecret }, refreshToken);
      const row = destinationRow(testLead, dest.include_contacts, 'google_sheets');
      const rows = dest.header_written
        ? [row]
        : [destinationColumns(dest.include_contacts), row];
      await appendRows(accessToken, dest.spreadsheet_id, dest.sheet_tab ?? 'Leads', rows);
      if (!dest.header_written) {
        await service.from('destinations').update({ header_written: true }).eq('id', dest.id);
      }
      result = { ok: true };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : 'Test failed' };
    }
  } else {
    const secret = decryptSecret(dest.secret_envelope, process.env.APP_ENCRYPTION_KEY!);
    const payload = buildDestinationPayload({
      destinationName: dest.name,
      secret,
      runId: null,
      kind: dest.kind as DestinationKind,
      includeContacts: dest.include_contacts,
      leads: [testLead],
    });
    result = await deliverToDestination({ endpointUrl: dest.endpoint_url, secret, payload });
  }
  await service
    .from('destinations')
    .update({
      status: result.ok ? 'connected' : 'error',
      last_error: result.ok ? null : (result.error ?? 'Test failed'),
      last_sync_at: result.ok ? new Date().toISOString() : undefined,
    })
    .eq('id', dest.id);
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'destination.tested',
    entityKind: 'destination',
    entityId: dest.id,
    details: { ok: result.ok },
  });
  revalidatePath('/integrations');
  redirect(`/integrations?dtested=${result.ok ? 'ok' : 'failed'}`);
}

export async function syncDestinationNow(formData: FormData): Promise<void> {
  const ctx = await requirePermission('destinations:sync');
  const id = z.string().uuid().safeParse(formData.get('destinationId'));
  if (!id.success) redirect('/integrations');

  const supabase = await createSupabaseServerClient();
  const { data: dest } = await supabase
    .from('destinations')
    .select('id')
    .eq('id', id.data)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dest) redirect('/integrations');

  await enqueueJob({
    kind: 'sync_destination',
    orgId: ctx.orgId,
    idempotencyKey: `dest-manual:${dest.id}:${Date.now()}`,
    payload: { destinationId: dest.id },
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'destination.sync_requested',
    entityKind: 'destination',
    entityId: dest.id,
  });
  redirect('/integrations?dsync=queued');
}

export async function toggleAutoSync(formData: FormData): Promise<void> {
  const ctx = await requirePermission('destinations:sync');
  const id = z.string().uuid().safeParse(formData.get('destinationId'));
  const enabled = formData.get('autoSync') === 'on';
  if (!id.success) redirect('/integrations');

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('destinations')
    .update({ auto_sync: enabled })
    .eq('id', id.data)
    .eq('organization_id', ctx.orgId);
  revalidatePath('/integrations');
  redirect('/integrations');
}

export async function disconnectDestination(formData: FormData): Promise<void> {
  const ctx = await requirePermission('destinations:sync');
  const id = z.string().uuid().safeParse(formData.get('destinationId'));
  if (!id.success) redirect('/integrations');

  const supabase = await createSupabaseServerClient();
  await supabase
    .from('destinations')
    .update({ status: 'disconnected', auto_sync: false, deleted_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('organization_id', ctx.orgId);
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'destination.disconnected',
    entityKind: 'destination',
    entityId: id.data,
  });
  revalidatePath('/integrations');
  redirect('/integrations');
}
