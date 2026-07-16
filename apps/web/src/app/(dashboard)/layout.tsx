import Link from 'next/link';
import { Bell } from 'lucide-react';
import { brand } from '@leadfinder/config';
import { signOut } from '@/actions/auth';
import { listMyOrganizations, switchOrganization } from '@/actions/org';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MobileNav, NavLinks } from '@/components/nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const orgs = await listMyOrganizations();

  const supabase = await createSupabaseServerClient();
  const { count: unread } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId)
    .is('read_at', null);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link
          href="/"
          className="mb-6 block px-3 font-display text-lg font-bold tracking-tight text-primary"
        >
          {brand.name}
        </Link>
        <NavLinks />
        <div className="mt-auto px-3 pt-6">
          <p className="overline">Workspace</p>
          <p className="truncate text-sm font-medium">{ctx.orgName}</p>
          <p className="text-xs text-ink-faint capitalize">{ctx.role}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-3">
            <MobileNav />
            {orgs.length > 1 ? (
              <form action={switchOrganization}>
                <select
                  name="orgId"
                  defaultValue={ctx.orgId}
                  aria-label="Switch organization"
                  className="rounded-md border border-line-strong bg-surface px-2 py-1.5 text-sm"
                >
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="ml-2 text-sm text-primary hover:underline">
                  Switch
                </button>
              </form>
            ) : (
              <span className="hidden text-sm font-medium text-ink-soft sm:block lg:hidden">
                {ctx.orgName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-ink-soft hover:bg-canvas hover:text-primary"
              aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
            >
              <Bell size={18} aria-hidden />
              {unread ? (
                <span
                  className="absolute top-1 right-1 flex size-2 rounded-full bg-accent-ink"
                  aria-hidden
                />
              ) : null}
            </Link>
            <span className="hidden max-w-[16ch] truncate text-sm text-ink-soft md:block">
              {ctx.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-ink-soft hover:text-primary hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-line px-4 py-3 text-xs text-ink-faint lg:px-8">
          {brand.legalName} — research and organize business data responsibly. No automated
          outreach.
        </footer>
      </div>
    </div>
  );
}
