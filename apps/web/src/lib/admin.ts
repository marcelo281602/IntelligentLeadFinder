import 'server-only';
import { redirect } from 'next/navigation';
import { requireUser, type SessionContext } from './auth';

/**
 * Super-admin gate for the platform console. Separate from organization
 * routes: super-admins need no workspace membership, and ordinary users are
 * redirected away regardless of role.
 */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const session = await requireUser();
  if (!session.isSuperAdmin) redirect('/');
  return session;
}
