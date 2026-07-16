import type { OrgRole } from './types';

/**
 * Server-side permission policy. Hiding a button is not authorization —
 * every mutation endpoint checks these, and Postgres RLS enforces org
 * isolation underneath.
 */

export const PERMISSIONS = [
  'org:manage',
  'org:transfer',
  'org:delete',
  'members:manage',
  'members:invite',
  'integrations:manage',
  'integrations:read',
  'searches:run',
  'searches:read',
  'records:read',
  'records:edit',
  'enrich:run',
  'lists:manage',
  'exports:create',
  'exports:download',
  'destinations:sync',
  'usage:read',
  'audit:read',
  'limits:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: ALL,
  admin: [
    'org:manage',
    'members:manage',
    'members:invite',
    'integrations:manage',
    'integrations:read',
    'searches:run',
    'searches:read',
    'records:read',
    'records:edit',
    'enrich:run',
    'lists:manage',
    'exports:create',
    'exports:download',
    'destinations:sync',
    'usage:read',
    'audit:read',
    'limits:manage',
  ],
  researcher: [
    'integrations:read',
    'searches:run',
    'searches:read',
    'records:read',
    'records:edit',
    'enrich:run',
    'lists:manage',
    'usage:read',
    // exports:create is NOT granted by default — see member override below.
  ],
  operations: [
    'integrations:read',
    'searches:read',
    'records:read',
    'records:edit',
    'lists:manage',
    'destinations:sync',
    'exports:create',
    'exports:download',
    'usage:read',
  ],
  viewer: ['searches:read', 'records:read', 'usage:read'],
};

export interface MemberOverrides {
  /** Researcher export grant ("Export only if granted"). */
  canExport?: boolean;
}

export function permissionsForRole(role: OrgRole, overrides?: MemberOverrides): Permission[] {
  const base = [...ROLE_PERMISSIONS[role]];
  if (role === 'researcher' && overrides?.canExport) {
    base.push('exports:create', 'exports:download');
  }
  return base;
}

export function hasPermission(
  role: OrgRole,
  permission: Permission,
  overrides?: MemberOverrides,
): boolean {
  return permissionsForRole(role, overrides).includes(permission);
}

/** Roles a given role is allowed to invite (admins cannot mint owners). */
export function invitableRoles(role: OrgRole): OrgRole[] {
  if (role === 'owner') return ['owner', 'admin', 'researcher', 'operations', 'viewer'];
  if (role === 'admin') return ['researcher', 'operations', 'viewer'];
  return [];
}
