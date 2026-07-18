'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Building2,
  Download,
  LayoutDashboard,
  ListChecks,
  PlugZap,
  ScrollText,
  Search,
  Settings,
  Store,
  Users,
  UserSearch,
  Wallet,
} from 'lucide-react';
import { cx } from './ui';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/lead-finder', label: 'Lead Finder', icon: Search },
  // Shown only while the provider_yelp_apify feature flag is on (the layout
  // passes the flag state; flipping the flag off is the Yelp kill switch).
  { href: '/yelp-leads', label: 'Yelp Leads Scraper', icon: Store, flag: 'yelp' },
  { href: '/runs', label: 'Search Runs', icon: Activity },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Decision Makers', icon: UserSearch },
  { href: '/lists', label: 'Lists', icon: ListChecks },
  { href: '/exports', label: 'Exports', icon: Download },
  { href: '/integrations', label: 'Integrations', icon: PlugZap },
  { href: '/usage', label: 'Usage & Costs', icon: Wallet },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/audit', label: 'Audit Logs', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavLinks({
  onNavigate,
  showYelp = false,
}: {
  onNavigate?: () => void;
  showYelp?: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !('flag' in item) || item.flag !== 'yelp' || showYelp);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
              active
                ? 'bg-primary-soft text-primary'
                : 'text-ink-soft hover:bg-canvas hover:text-ink',
            )}
          >
            <Icon
              size={16}
              strokeWidth={2}
              aria-hidden
              className={active ? 'text-primary' : 'text-ink-faint'}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ showYelp = false }: { showYelp?: boolean }) {
  return (
    <details className="group relative lg:hidden">
      <summary
        className="flex cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink-soft select-none [&::-webkit-details-marker]:hidden"
        aria-label="Open navigation menu"
      >
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="block h-0.5 w-4 bg-ink-soft" />
          <span className="block h-0.5 w-4 bg-ink-soft" />
          <span className="block h-0.5 w-4 bg-ink-soft" />
        </span>
        Menu
      </summary>
      <div className="absolute left-0 z-50 mt-2 w-64 rounded-(--radius-card) border border-line bg-surface p-2 shadow-(--shadow-float)">
        <NavLinks showYelp={showYelp} />
      </div>
    </details>
  );
}
