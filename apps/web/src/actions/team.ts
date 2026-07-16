'use server';

import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { invitableRoles, type OrgRole } from '@leadfinder/core';
import { generateToken } from '@leadfinder/security';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const inviteSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(['admin', 'researcher', 'operations', 'viewer']),
});

/**
 * Invite a member. Email delivery is not configured yet, so the invite link
 * is shown once to the inviter to share out-of-band (documented limitation).
 */
export async function inviteMember(formData: FormData): Promise<void> {
  const ctx = await requirePermission('members:invite');
  enforceRateLimit(`invite:${ctx.orgId}`, 20, 3_600_000);

  const parsed = inviteSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
  });
  if (!parsed.success) {
    redirect(`/team?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }
  // The invitable-roles matrix is enforced server-side, not just in the UI.
  if (!invitableRoles(ctx.role).includes(parsed.data.role as OrgRole)) {
    redirect(`/team?error=${encodeURIComponent('Your role cannot invite that role.')}`);
  }

  const token = generateToken(24);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('invitations').insert({
    organization_id: ctx.orgId,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    token_hash: tokenHash,
    invited_by: ctx.userId,
    expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
  });
  if (error) {
    redirect(`/team?error=${encodeURIComponent('Could not create the invitation.')}`);
  }

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'member.invited',
    details: { email: parsed.data.email, role: parsed.data.role },
  });
  revalidatePath('/team');
  redirect(`/team?inviteToken=${encodeURIComponent(token)}`);
}

/** Accept an invitation (signed-in user with a matching email). */
export async function acceptInvitation(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const token = z.string().min(10).safeParse(formData.get('token'));
  if (!token.success) redirect('/onboarding?error=Invalid+invitation');
  const tokenHash = createHash('sha256').update(token.data).digest('hex');

  const service = createServiceClient();
  const { data: invite } = await service
    .from('invitations')
    .select('id, organization_id, email, role, expires_at, accepted_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (
    !invite ||
    invite.accepted_at ||
    new Date(invite.expires_at) < new Date() ||
    invite.email.toLowerCase() !== (user.email ?? '').toLowerCase()
  ) {
    redirect(
      `/onboarding?error=${encodeURIComponent('Invitation is invalid, expired, or for a different email.')}`,
    );
  }

  await service.from('organization_memberships').upsert(
    {
      organization_id: invite.organization_id,
      user_id: user.id,
      role: invite.role,
    },
    { onConflict: 'organization_id,user_id', ignoreDuplicates: true },
  );
  await service
    .from('invitations')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', invite.id);
  await service
    .from('user_profiles')
    .update({ active_organization_id: invite.organization_id })
    .eq('id', user.id);
  await audit({
    orgId: invite.organization_id,
    actorUserId: user.id,
    action: 'member.joined',
    details: { role: invite.role },
  });
  redirect('/');
}

const roleChangeSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(['admin', 'researcher', 'operations', 'viewer']),
  canExport: z.boolean(),
});

export async function changeMemberRole(formData: FormData): Promise<void> {
  const ctx = await requirePermission('members:manage');
  const parsed = roleChangeSchema.safeParse({
    membershipId: formData.get('membershipId'),
    role: formData.get('role'),
    canExport: formData.get('canExport') === 'on',
  });
  if (!parsed.success) redirect('/team');
  if (!invitableRoles(ctx.role).includes(parsed.data.role as OrgRole)) {
    redirect(`/team?error=${encodeURIComponent('Your role cannot assign that role.')}`);
  }

  const supabase = await createSupabaseServerClient();
  // Owners cannot be demoted through this path (ownership transfer is separate).
  const { data: target } = await supabase
    .from('organization_memberships')
    .select('id, role, user_id')
    .eq('id', parsed.data.membershipId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!target || target.role === 'owner') {
    redirect(`/team?error=${encodeURIComponent('That member cannot be changed here.')}`);
  }
  await supabase
    .from('organization_memberships')
    .update({ role: parsed.data.role, can_export: parsed.data.canExport })
    .eq('id', parsed.data.membershipId)
    .eq('organization_id', ctx.orgId);

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'member.role_changed',
    details: { membershipId: parsed.data.membershipId, role: parsed.data.role },
  });
  revalidatePath('/team');
  redirect('/team');
}

export async function removeMember(formData: FormData): Promise<void> {
  const ctx = await requirePermission('members:manage');
  const membershipId = z.string().uuid().safeParse(formData.get('membershipId'));
  if (!membershipId.success) redirect('/team');

  const supabase = await createSupabaseServerClient();
  const { data: target } = await supabase
    .from('organization_memberships')
    .select('id, role, user_id')
    .eq('id', membershipId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!target || target.role === 'owner' || target.user_id === ctx.userId) {
    redirect(`/team?error=${encodeURIComponent('That member cannot be removed here.')}`);
  }
  await supabase
    .from('organization_memberships')
    .delete()
    .eq('id', membershipId.data)
    .eq('organization_id', ctx.orgId);
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'member.removed',
    details: { membershipId: membershipId.data },
  });
  revalidatePath('/team');
  redirect('/team');
}
