import 'server-only';
import { redirect } from 'next/navigation';
import {
  hasPermission,
  type MemberOverrides,
  type OrgRole,
  type Permission,
} from '@leadfinder/core';
import { createSupabaseServerClient } from './supabase/server';

export interface SessionContext {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
}

export interface OrgContext extends SessionContext {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  overrides: MemberOverrides;
}

/** Authenticated user or redirect to sign-in. */
export async function requireUser(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  return {
    userId: user.id,
    email: user.email ?? '',
    isSuperAdmin: profile?.is_super_admin ?? false,
  };
}

/**
 * Active organization derived from VERIFIED membership — never from
 * client-supplied ids. Users with no org go to onboarding.
 */
export async function requireOrg(): Promise<OrgContext> {
  const session = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('active_organization_id')
    .eq('id', session.userId)
    .maybeSingle();

  // Membership check happens via RLS + explicit filter.
  interface MembershipRow {
    organization_id: string;
    role: OrgRole;
    can_export: boolean;
    organizations: { name: string; slug: string } | null;
  }
  let membership: MembershipRow | null = null;

  if (profile?.active_organization_id) {
    const { data } = await supabase
      .from('organization_memberships')
      .select('organization_id, role, can_export, organizations(name, slug)')
      .eq('user_id', session.userId)
      .eq('organization_id', profile.active_organization_id)
      .maybeSingle();
    membership = data as unknown as MembershipRow | null;
  }
  if (!membership) {
    const { data } = await supabase
      .from('organization_memberships')
      .select('organization_id, role, can_export, organizations(name, slug)')
      .eq('user_id', session.userId)
      .limit(1)
      .maybeSingle();
    membership = data as unknown as MembershipRow | null;
  }
  if (!membership || !membership.organizations) {
    // Super-admins live in the platform console and need no workspace.
    redirect(session.isSuperAdmin ? '/admin' : '/onboarding');
  }

  return {
    ...session,
    orgId: membership.organization_id,
    orgName: membership.organizations.name,
    orgSlug: membership.organizations.slug,
    role: membership.role,
    overrides: { canExport: membership.can_export },
  };
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = 'ForbiddenError';
  }
}

/** Server-side permission gate — hiding a button is not authorization. */
export function assertPermission(ctx: OrgContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission, ctx.overrides)) {
    throw new ForbiddenError(permission);
  }
}

export async function requirePermission(permission: Permission): Promise<OrgContext> {
  const ctx = await requireOrg();
  assertPermission(ctx, permission);
  return ctx;
}
