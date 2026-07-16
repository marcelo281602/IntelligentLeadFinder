import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { getBudgetStatus } from '@/lib/estimate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Money, RunStatusBadge, cx } from '@/components/ui';

export const metadata = { title: 'Overview' };

export default async function OverviewPage() {
  const ctx = await requireOrg();
  const supabase = await createSupabaseServerClient();
  const budget = await getBudgetStatus(ctx.orgId);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const [
    { count: runsThisMonth },
    { count: companiesTotal },
    { count: contactsTotal },
    { count: verifiedEmails },
    { count: exportsCount },
    { data: recentRuns },
    { data: connections },
    { data: recentFailures },
  ] = await Promise.all([
    supabase
      .from('search_runs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .gte('created_at', monthIso)
      .neq('status', 'draft'),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .eq('work_email_status', 'verified')
      .is('deleted_at', null),
    supabase
      .from('exports')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .gte('created_at', monthIso),
    supabase
      .from('search_runs')
      .select('id, status, config_snapshot, accepted_count, enriched_count, created_at, is_fixture')
      .eq('organization_id', ctx.orgId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('integration_connections')
      .select('provider, label, status, last_test_ok')
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null),
    supabase
      .from('search_runs')
      .select('id, error_summary, created_at')
      .eq('organization_id', ctx.orgId)
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const stats: Array<{ label: string; value: string; href: string }> = [
    { label: 'Searches this month', value: String(runsThisMonth ?? 0), href: '/runs' },
    {
      label: 'Companies collected',
      value: (companiesTotal ?? 0).toLocaleString(),
      href: '/companies',
    },
    { label: 'Decision makers', value: (contactsTotal ?? 0).toLocaleString(), href: '/contacts' },
    {
      label: 'Verified emails',
      value: (verifiedEmails ?? 0).toLocaleString(),
      href: '/contacts?email=verified',
    },
    { label: 'Exports this month', value: String(exportsCount ?? 0), href: '/exports' },
  ];

  const spentPct =
    budget.monthlyBudgetMicroUsd && budget.monthlyBudgetMicroUsd > 0
      ? Math.min(
          100,
          Math.round((budget.spentThisMonthMicroUsd / budget.monthlyBudgetMicroUsd) * 100),
        )
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="header-wash -mx-4 -mt-6 px-4 pt-8 pb-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="overline">Workspace overview</p>
            <h1 className="text-2xl font-bold">{ctx.orgName}</h1>
          </div>
          <Link
            href="/lead-finder"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgba(47,79,125,0.25)] hover:bg-primary-hover"
          >
            New search
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat, i) => (
          <Link key={stat.label} href={stat.href}>
            <Card
              className={cx(
                'rise h-full p-4 transition-colors hover:border-primary/40',
                `rise-${Math.min(i + 1, 4)}`,
              )}
            >
              <p className="overline">{stat.label}</p>
              <p className="mt-1 font-mono text-2xl font-semibold">{stat.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rise rise-2 lg:col-span-2">
          <CardHeader
            overline="Activity"
            title="Recent runs"
            action={
              <Link href="/runs" className="text-sm text-primary hover:underline">
                All →
              </Link>
            }
          />
          {(recentRuns ?? []).length === 0 ? (
            <EmptyState
              title="No searches yet"
              body="Start with the free fixture provider to see the whole flow, then connect Apify for real data."
              action={
                <Link
                  href="/lead-finder"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Open Lead Finder →
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {(recentRuns ?? []).map((run) => {
                const snapshot = run.config_snapshot as { name?: string } | null;
                return (
                  <li key={run.id}>
                    <Link
                      href={`/runs/${run.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-canvas"
                    >
                      <span className="min-w-0 truncate font-medium">
                        {snapshot?.name ?? 'Search'}
                        {run.is_fixture ? <Badge tone="warn">Test</Badge> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                        <span className="font-mono">
                          {run.accepted_count}co / {run.enriched_count}dm
                        </span>
                        <RunStatusBadge status={run.status} />
                        {formatDateTime(run.created_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="rise rise-3">
            <CardHeader overline="This month" title="Provider cost" />
            <div className="space-y-2 p-5">
              <p className="font-mono text-2xl font-semibold">
                <Money micro={budget.spentThisMonthMicroUsd} />
              </p>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"
                role="img"
                aria-label={`${spentPct}% of budget used`}
              >
                <div
                  className={cx(
                    'h-full rounded-full',
                    spentPct >= budget.warnAtPercent ? 'bg-warn' : 'bg-accent-ink',
                  )}
                  style={{ width: `${spentPct}%` }}
                />
              </div>
              <p className="text-xs text-ink-soft">
                of <Money micro={budget.monthlyBudgetMicroUsd} /> budget ·{' '}
                <Link href="/usage" className="text-primary hover:underline">
                  details →
                </Link>
              </p>
            </div>
          </Card>

          <Card className="rise rise-4">
            <CardHeader overline="Health" title="Integrations" />
            <ul className="divide-y divide-line px-5 py-1 text-sm">
              {(connections ?? []).map((conn) => (
                <li
                  key={`${conn.provider}-${conn.label}`}
                  className="flex items-center justify-between py-2"
                >
                  <span className="capitalize">
                    {conn.provider} <span className="text-xs text-ink-faint">{conn.label}</span>
                  </span>
                  <Badge
                    tone={
                      conn.status === 'connected' && conn.last_test_ok !== false
                        ? 'ok'
                        : conn.status === 'error'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {conn.status}
                  </Badge>
                </li>
              ))}
              {(connections ?? []).length === 0 ? (
                <li className="py-2 text-ink-faint">
                  No providers connected —{' '}
                  <Link href="/integrations" className="text-primary hover:underline">
                    set up
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>

          {(recentFailures ?? []).length > 0 ? (
            <Card className="rise rise-4 border-danger/30">
              <CardHeader overline="Attention" title="Recent failures" />
              <ul className="divide-y divide-line px-5 py-1 text-sm">
                {(recentFailures ?? []).map((run) => (
                  <li key={run.id} className="py-2">
                    <Link href={`/runs/${run.id}`} className="text-danger hover:underline">
                      {run.error_summary ?? 'Run failed'}
                    </Link>
                    <p className="text-xs text-ink-faint">{formatDateTime(run.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
