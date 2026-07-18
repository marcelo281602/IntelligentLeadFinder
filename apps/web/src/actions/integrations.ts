'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { encryptSecret, secretFingerprint } from '@leadfinder/security';
import { getMapsAdapter } from '@leadfinder/providers';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Provider credentials are accepted ONLY here (Settings → Integrations),
 * posted over HTTPS to this server action, tested, envelope-encrypted, and
 * stored in a table no client can read. The plaintext never returns.
 */

const connectSchema = z.object({
  provider: z.literal('apify'),
  label: z.string().trim().min(1).max(100).default('Default'),
  token: z.string().trim().min(10, 'Enter the API token').max(500),
  actorId: z.string().trim().min(3).max(200).default('compass/crawler-google-places'),
  planTier: z.enum(['free', 'starter', 'scale', 'business']).default('starter'),
});

export async function connectApify(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:manage');
  enforceRateLimit(`connect:${ctx.userId}`, 10, 300_000);

  const parsed = connectSchema.safeParse({
    provider: 'apify',
    label: formData.get('label') || 'Default',
    token: formData.get('token'),
    actorId: formData.get('actorId') || undefined,
    planTier: formData.get('planTier') || undefined,
  });
  if (!parsed.success) {
    redirect(`/integrations?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  // 1. Test before storing — never persist a credential that does not work.
  const adapter = getMapsAdapter('apify');
  const test = await adapter.testConnection({ token: parsed.data.token });
  if (!test.ok) {
    redirect(
      `/integrations?error=${encodeURIComponent(test.error ?? 'Apify rejected the token.')}`,
    );
  }

  // 2. Encrypt and store. Connection + secret write via service role (the
  //    secrets table is deny-all for clients), scoped to the verified org.
  const envelope = encryptSecret(parsed.data.token, process.env.APP_ENCRYPTION_KEY!);
  const fingerprint = secretFingerprint(parsed.data.token);
  const service = createServiceClient();

  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .insert({
      organization_id: ctx.orgId,
      provider: 'apify',
      label: parsed.data.label,
      status: 'connected',
      config: { actorId: parsed.data.actorId, planTier: parsed.data.planTier },
      secret_fingerprint: fingerprint,
      created_by: ctx.userId,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
    })
    .select('id')
    .single();
  if (connError || !connection) {
    const message =
      connError?.code === '23505'
        ? 'A connection with that label already exists.'
        : 'Could not save the connection.';
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }

  const { data: secret } = await service
    .from('integration_secret_versions')
    .insert({
      organization_id: ctx.orgId,
      connection_id: connection.id,
      version: 1,
      envelope,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  await service
    .from('integration_connections')
    .update({ active_secret_version_id: secret!.id })
    .eq('id', connection.id);
  await service.from('integration_health_checks').insert({
    organization_id: ctx.orgId,
    connection_id: connection.id,
    ok: true,
    latency_ms: test.latencyMs,
    detail: `Connected as ${test.accountLabel ?? 'Apify account'}`,
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.connected',
    entityKind: 'integration_connection',
    entityId: connection.id,
    details: { provider: 'apify', label: parsed.data.label, planTier: parsed.data.planTier },
  });
  revalidatePath('/integrations');
  redirect('/integrations?connected=1');
}

const connectOutscraperSchema = z.object({
  label: z.string().trim().min(1).max(100).default('Default'),
  token: z.string().trim().min(10, 'Enter the API key').max(500),
});

export async function connectOutscraper(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:manage');
  enforceRateLimit(`connect:${ctx.userId}`, 10, 300_000);

  const parsed = connectOutscraperSchema.safeParse({
    label: formData.get('label') || 'Default',
    token: formData.get('token'),
  });
  if (!parsed.success) {
    redirect(`/integrations?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  const service = createServiceClient();

  // Feature-flag gate (defense in depth — the connect card is also hidden).
  const { data: flag } = await service
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'provider_outscraper')
    .is('organization_id', null)
    .maybeSingle();
  if (!flag?.enabled) {
    redirect(
      `/integrations?error=${encodeURIComponent('Outscraper is not enabled for this deployment.')}`,
    );
  }

  // 1. Test before storing — never persist a credential that does not work.
  const adapter = getMapsAdapter('outscraper');
  const test = await adapter.testConnection({ token: parsed.data.token });
  if (!test.ok) {
    redirect(
      `/integrations?error=${encodeURIComponent(test.error ?? 'Outscraper rejected the API key.')}`,
    );
  }

  // 2. Encrypt and store, scoped to the verified org.
  const envelope = encryptSecret(parsed.data.token, process.env.APP_ENCRYPTION_KEY!);
  const fingerprint = secretFingerprint(parsed.data.token);

  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .insert({
      organization_id: ctx.orgId,
      provider: 'outscraper',
      label: parsed.data.label,
      status: 'connected',
      config: { planTier: 'pay_as_you_go' },
      secret_fingerprint: fingerprint,
      created_by: ctx.userId,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
    })
    .select('id')
    .single();
  if (connError || !connection) {
    const message =
      connError?.code === '23505'
        ? 'A connection with that label already exists.'
        : 'Could not save the connection.';
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }

  const { data: secret } = await service
    .from('integration_secret_versions')
    .insert({
      organization_id: ctx.orgId,
      connection_id: connection.id,
      version: 1,
      envelope,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  await service
    .from('integration_connections')
    .update({ active_secret_version_id: secret!.id })
    .eq('id', connection.id);
  await service.from('integration_health_checks').insert({
    organization_id: ctx.orgId,
    connection_id: connection.id,
    ok: true,
    latency_ms: test.latencyMs,
    detail: `Connected as ${test.accountLabel ?? 'Outscraper account'}`,
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.connected',
    entityKind: 'integration_connection',
    entityId: connection.id,
    details: { provider: 'outscraper', label: parsed.data.label },
  });
  revalidatePath('/integrations');
  redirect('/integrations?connected=outscraper');
}

export async function testConnection(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:read');
  const connectionId = z.string().uuid().safeParse(formData.get('connectionId'));
  if (!connectionId.success) redirect('/integrations');
  enforceRateLimit(`test-conn:${ctx.orgId}`, 10, 60_000);

  const service = createServiceClient();
  const { data: connection } = await service
    .from('integration_connections')
    .select('id, provider, active_secret_version_id, organization_id')
    .eq('id', connectionId.data)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!connection) redirect('/integrations');

  let ok = false;
  let detail = '';
  let latency = 0;
  try {
    let token = 'fixture';
    if (connection.provider !== 'fixture') {
      const { data: secretRow } = await service
        .from('integration_secret_versions')
        .select('envelope')
        .eq('id', connection.active_secret_version_id)
        .maybeSingle();
      if (!secretRow) throw new Error('No stored credential.');
      const { decryptSecret } = await import('@leadfinder/security');
      token = decryptSecret(secretRow.envelope, process.env.APP_ENCRYPTION_KEY!);
    }
    const adapter = getMapsAdapter(connection.provider);
    const result = await adapter.testConnection({ token });
    ok = result.ok;
    latency = result.latencyMs;
    detail = result.ok
      ? `Connected as ${result.accountLabel ?? connection.provider}`
      : (result.error ?? 'Test failed');
  } catch (error) {
    detail = error instanceof Error ? error.message : 'Test failed';
  }

  await service
    .from('integration_connections')
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: ok,
      last_error: ok ? null : detail,
      status: ok ? 'connected' : 'error',
    })
    .eq('id', connection.id);
  await service.from('integration_health_checks').insert({
    organization_id: ctx.orgId,
    connection_id: connection.id,
    ok,
    latency_ms: latency,
    detail,
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.tested',
    entityKind: 'integration_connection',
    entityId: connection.id,
    details: { ok },
  });
  revalidatePath('/integrations');
  redirect(`/integrations?tested=${ok ? 'ok' : 'failed'}`);
}

/** Disconnect requires re-authentication. History and provenance survive. */
export async function disconnectConnection(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:manage');
  const connectionId = z.string().uuid().safeParse(formData.get('connectionId'));
  const password = String(formData.get('confirmPassword') ?? '');
  if (!connectionId.success) redirect('/integrations');
  if (!password) {
    redirect(`/integrations?error=${encodeURIComponent('Disconnecting requires your password.')}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: ctx.email,
    password,
  });
  if (reauthError) {
    redirect(`/integrations?error=${encodeURIComponent('Re-authentication failed.')}`);
  }

  const service = createServiceClient();
  const { data: connection } = await service
    .from('integration_connections')
    .select('id, provider')
    .eq('id', connectionId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!connection) redirect('/integrations');
  if (connection.provider === 'fixture') {
    redirect(
      `/integrations?error=${encodeURIComponent('The fixture provider cannot be disconnected.')}`,
    );
  }

  await service
    .from('integration_connections')
    .update({ status: 'disconnected', active_secret_version_id: null })
    .eq('id', connection.id);
  await service
    .from('integration_secret_versions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('connection_id', connection.id)
    .is('revoked_at', null);

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.disconnected',
    entityKind: 'integration_connection',
    entityId: connection.id,
  });
  revalidatePath('/integrations');
  redirect('/integrations');
}

/** Replace the credential (rotation). Requires re-authentication. */
export async function rotateCredential(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:manage');
  const connectionId = z.string().uuid().safeParse(formData.get('connectionId'));
  const token = z.string().trim().min(10).max(500).safeParse(formData.get('token'));
  const password = String(formData.get('confirmPassword') ?? '');
  if (!connectionId.success || !token.success) {
    redirect(`/integrations?error=${encodeURIComponent('Enter the new API token.')}`);
  }
  if (!password) {
    redirect(`/integrations?error=${encodeURIComponent('Rotation requires your password.')}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: ctx.email,
    password,
  });
  if (reauthError) {
    redirect(`/integrations?error=${encodeURIComponent('Re-authentication failed.')}`);
  }

  const service = createServiceClient();
  const { data: connection } = await service
    .from('integration_connections')
    .select('id, provider')
    .eq('id', connectionId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!connection) redirect('/integrations');

  const adapter = getMapsAdapter(connection.provider);
  const test = await adapter.testConnection({ token: token.data });
  if (!test.ok) {
    redirect(
      `/integrations?error=${encodeURIComponent(test.error ?? 'New token failed the test.')}`,
    );
  }

  const { data: latest } = await service
    .from('integration_secret_versions')
    .select('version')
    .eq('connection_id', connection.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  const envelope = encryptSecret(token.data, process.env.APP_ENCRYPTION_KEY!);
  const { data: secret } = await service
    .from('integration_secret_versions')
    .insert({
      organization_id: ctx.orgId,
      connection_id: connection.id,
      version: nextVersion,
      envelope,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  await service
    .from('integration_connections')
    .update({
      active_secret_version_id: secret!.id,
      secret_fingerprint: secretFingerprint(token.data),
      status: 'connected',
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
      last_error: null,
    })
    .eq('id', connection.id);
  await service
    .from('integration_secret_versions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('connection_id', connection.id)
    .lt('version', nextVersion)
    .is('revoked_at', null);

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.credential_rotated',
    entityKind: 'integration_connection',
    entityId: connection.id,
    details: { version: nextVersion },
  });
  revalidatePath('/integrations');
  redirect('/integrations?rotated=1');
}
