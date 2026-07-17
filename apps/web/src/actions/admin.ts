'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Super-admin client management. Every action is audited with actor_type
 * "super_admin". These are the only paths that change plans or trials.
 */

async function auditAdmin(
  actorUserId: string,
  action: string,
  orgId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const service = createServiceClient();
  await service.from('audit_logs').insert({
    organization_id: orgId,
    actor_user_id: actorUserId,
    actor_type: 'super_admin',
    action,
    entity_kind: 'organization',
    entity_id: orgId,
    details,
  });
}

export async function extendTrial(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin();
  enforceRateLimit(`admin:${session.userId}`, 30, 60_000);
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      days: z.coerce.number().int().min(1).max(365).default(14),
    })
    .safeParse({ orgId: formData.get('orgId'), days: formData.get('days') || 14 });
  if (!parsed.success) redirect('/admin/clients');

  const service = createServiceClient();
  const { data: org } = await service
    .from('organizations')
    .select('trial_ends_at')
    .eq('id', parsed.data.orgId)
    .maybeSingle();
  if (!org) redirect('/admin/clients');

  const base = new Date(Math.max(new Date(org.trial_ends_at as string).getTime(), Date.now()));
  base.setDate(base.getDate() + parsed.data.days);
  await service
    .from('organizations')
    .update({ trial_ends_at: base.toISOString(), plan: 'trial' })
    .eq('id', parsed.data.orgId);
  await auditAdmin(session.userId, 'admin.trial_extended', parsed.data.orgId, {
    days: parsed.data.days,
    newTrialEnd: base.toISOString(),
  });
  revalidatePath('/admin/clients');
  redirect('/admin/clients');
}

export async function setPlan(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin();
  enforceRateLimit(`admin:${session.userId}`, 30, 60_000);
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      plan: z.enum(['trial', 'active', 'suspended']),
    })
    .safeParse({ orgId: formData.get('orgId'), plan: formData.get('plan') });
  if (!parsed.success) redirect('/admin/clients');

  const service = createServiceClient();
  await service
    .from('organizations')
    .update({ plan: parsed.data.plan })
    .eq('id', parsed.data.orgId);
  await auditAdmin(session.userId, 'admin.plan_changed', parsed.data.orgId, {
    plan: parsed.data.plan,
  });
  revalidatePath('/admin/clients');
  redirect('/admin/clients');
}
