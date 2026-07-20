import Link from 'next/link';
import { Bell } from 'lucide-react';
import { brand } from '@leadfinder/config';
import { signOut } from '@/actions/auth';
import { listMyOrganizations, switchOrganization } from '@/actions/org';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BrandMark } from '@/components/brand-mark';
import { MobileNav, NavLinks } from '@/components/nav';
import { InstallPwaButton } from '@/components/pwa';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const orgs = await listMyOrganizations();

  const supabase = await createSupabaseServerClient();
  const [{ count: unread }, { data: orgPlan }, { data: yelpFlag }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .is('read_at', null),
    supabase.from('organizations').select('plan, trial_ends_at').eq('id', ctx.orgId).maybeSingle(),
    supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'provider_yelp_apify')
      .is('organization_id', null)
      .maybeSingle(),
  ]);
  const showYelp = yelpFlag?.enabled ?? false;

  const trialDaysLeft =
    orgPlan?.plan === 'trial'
      ? Math.ceil((new Date(orgPlan.trial_ends_at as string).getTime() - Date.now()) / 86_400_000)
      : null;
  const showTrialBanner =
    orgPlan?.plan === 'suspended' || (trialDaysLeft !== null && trialDaysLeft <= 3);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2.5 px-3 font-display text-lg font-bold tracking-tight text-primary"
        >
          <BrandMark size={26} />
          {brand.name}
        </Link>
        <NavLinks showYelp={showYelp} />
        {ctx.isSuperAdmin ? (
          <Link
            href="/admin"
            className="mt-1 flex items-center gap-2.5 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm font-medium text-ink-soft hover:border-primary hover:text-primary"
          >
            Platform Admin →
          </Link>
        ) : null}
        <div className="mt-auto px-3 pt-6">
          <p className="overline">Workspace</p>
          <p className="truncate text-sm font-medium">{ctx.orgName}</p>
          <p className="text-xs text-ink-faint capitalize">{ctx.role}</p>
          <InstallPwaButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-sm lg:px-8">
          <div className="flex items-center gap-3">
            <MobileNav showYelp={showYelp} />
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

        {showTrialBanner ? (
          <p
            role="status"
            className={`px-4 py-2 text-center text-sm lg:px-8 ${
              orgPlan?.plan === 'suspended' || (trialDaysLeft !== null && trialDaysLeft <= 0)
                ? 'bg-danger-soft text-danger'
                : 'bg-warn-soft text-warn'
            }`}
          >
            {orgPlan?.plan === 'suspended'
              ? 'This workspace is suspended — contact support.'
              : trialDaysLeft !== null && trialDaysLeft <= 0
                ? 'Your 14-day trial has ended. Paid runs are paused; test runs and all your data remain available. Contact support to activate.'
                : `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left. Contact support to activate the workspace.`}
          </p>
        ) : null}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>

        <footer className="border-t border-line px-4 py-3 text-xs text-ink-faint lg:px-8">
          {brand.legalName} — research and organize business data responsibly. No automated
          outreach.
        </footer>
      </div>
    </div>
  );
}
