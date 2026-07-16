'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { usdToMicro } from '@leadfinder/core';
import { audit } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Organization name is too short').max(200),
  countryCode: z.string().length(2).default('US'),
  monthlyBudgetUsd: z.coerce.number().min(1).max(100_000).default(100),
  perRunCapUsd: z.coerce.number().min(1).max(10_000).default(25),
  acknowledge: z.literal('on', {
    errorMap: () => ({ message: 'You must acknowledge the acceptable-use policy.' }),
  }),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createOrganization(formData: FormData): Promise<void> {
  const session = await requireUser();
  enforceRateLimit(`org-create:${session.userId}`, 3, 3_600_000);

  const parsed = createOrgSchema.safeParse({
    name: formData.get('name'),
    countryCode: formData.get('countryCode') || 'US',
    monthlyBudgetUsd: formData.get('monthlyBudgetUsd') || 100,
    perRunCapUsd: formData.get('perRunCapUsd') || 25,
    acknowledge: formData.get('acknowledge'),
  });
  if (!parsed.success) {
    redirect(`/onboarding?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  // Bootstrap (org + first owner membership) requires the service role;
  // everything is scoped to the authenticated user id from the session.
  const service = createServiceClient();
  const { data: org, error } = await service
    .from('organizations')
    .insert({
      name: parsed.data.name,
      slug: slugify(parsed.data.name),
      default_country_code: parsed.data.countryCode.toUpperCase(),
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error || !org) {
    redirect(`/onboarding?error=${encodeURIComponent('Could not create the organization.')}`);
  }

  await service.from('organization_memberships').insert({
    organization_id: org.id,
    user_id: session.userId,
    role: 'owner',
    can_export: true,
  });
  await service.from('quota_policies').insert({
    organization_id: org.id,
    monthly_budget_micro_usd: usdToMicro(parsed.data.monthlyBudgetUsd),
    per_run_cap_micro_usd: usdToMicro(parsed.data.perRunCapUsd),
    updated_by: session.userId,
  });
  // Fixture provider is available to every workspace for safe, free testing.
  await service.from('integration_connections').insert({
    organization_id: org.id,
    provider: 'fixture',
    label: 'Fixture (test data)',
    status: 'connected',
    config: { actorId: 'fixture-google-maps', planTier: 'free' },
    created_by: session.userId,
    last_test_at: new Date().toISOString(),
    last_test_ok: true,
  });
  await service
    .from('user_profiles')
    .update({ active_organization_id: org.id })
    .eq('id', session.userId);

  await audit({
    orgId: org.id,
    actorUserId: session.userId,
    action: 'org.created',
    entityKind: 'organization',
    entityId: org.id,
    details: { name: parsed.data.name },
  });
  redirect('/');
}

export async function switchOrganization(formData: FormData): Promise<void> {
  const session = await requireUser();
  const orgId = z.string().uuid().safeParse(formData.get('orgId'));
  if (!orgId.success) redirect('/');

  // RLS guarantees the membership lookup only succeeds for real memberships.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('organization_id', orgId.data)
    .eq('user_id', session.userId)
    .maybeSingle();
  if (data) {
    await supabase
      .from('user_profiles')
      .update({ active_organization_id: orgId.data })
      .eq('id', session.userId);
  }
  redirect('/');
}

const quotaSchema = z.object({
  monthlyBudgetUsd: z.coerce.number().min(1).max(1_000_000),
  perRunCapUsd: z.coerce.number().min(1).max(100_000),
  warnAtPercent: z.coerce.number().int().min(1).max(100),
});

export async function updateQuotas(formData: FormData): Promise<void> {
  const ctx = await requirePermission('limits:manage');
  const parsed = quotaSchema.safeParse({
    monthlyBudgetUsd: formData.get('monthlyBudgetUsd'),
    perRunCapUsd: formData.get('perRunCapUsd'),
    warnAtPercent: formData.get('warnAtPercent'),
  });
  if (!parsed.success) {
    redirect(`/settings?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from('quota_policies')
    .select('monthly_budget_micro_usd, per_run_cap_micro_usd')
    .eq('organization_id', ctx.orgId)
    .maybeSingle();

  const newMonthly = usdToMicro(parsed.data.monthlyBudgetUsd);
  const newPerRun = usdToMicro(parsed.data.perRunCapUsd);
  const raising =
    current !== null &&
    (newMonthly > Number(current?.monthly_budget_micro_usd ?? 0) ||
      newPerRun > Number(current?.per_run_cap_micro_usd ?? 0));

  // Raising limits requires fresh re-authentication (Tier-3 control).
  if (raising) {
    const password = String(formData.get('confirmPassword') ?? '');
    if (!password) {
      redirect(`/settings?error=${encodeURIComponent('Raising limits requires your password.')}`);
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: ctx.email,
      password,
    });
    if (reauthError) {
      redirect(
        `/settings?error=${encodeURIComponent('Re-authentication failed — limits unchanged.')}`,
      );
    }
  }

  const { error } = await supabase
    .from('quota_policies')
    .update({
      monthly_budget_micro_usd: newMonthly,
      per_run_cap_micro_usd: newPerRun,
      warn_at_percent: parsed.data.warnAtPercent,
      updated_by: ctx.userId,
    })
    .eq('organization_id', ctx.orgId);
  if (error) {
    redirect(`/settings?error=${encodeURIComponent('Could not update limits.')}`);
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'org.limits_changed',
    details: {
      monthlyBudgetUsd: parsed.data.monthlyBudgetUsd,
      perRunCapUsd: parsed.data.perRunCapUsd,
      raised: raising,
    },
  });
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(200),
  defaultCountryCode: z.string().length(2),
  dataRetentionDays: z.coerce.number().int().min(30).max(3650),
});

export async function updateOrgSettings(formData: FormData): Promise<void> {
  const ctx = await requirePermission('org:manage');
  const parsed = orgSettingsSchema.safeParse({
    name: formData.get('name'),
    defaultCountryCode: formData.get('defaultCountryCode'),
    dataRetentionDays: formData.get('dataRetentionDays'),
  });
  if (!parsed.success) {
    redirect(`/settings?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      name: parsed.data.name,
      default_country_code: parsed.data.defaultCountryCode.toUpperCase(),
      data_retention_days: parsed.data.dataRetentionDays,
    })
    .eq('id', ctx.orgId);
  if (error) redirect(`/settings?error=${encodeURIComponent('Could not save settings.')}`);
  await audit({ orgId: ctx.orgId, actorUserId: ctx.userId, action: 'org.settings_changed' });
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

/** Data used by the org switcher in the top bar. */
export async function listMyOrganizations() {
  const session = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', session.userId)
    .order('created_at');
  return (data ?? []).map((m) => ({
    id: m.organization_id as string,
    role: m.role as string,
    name: ((m.organizations as { name?: string } | null)?.name ?? 'Workspace') as string,
  }));
}
