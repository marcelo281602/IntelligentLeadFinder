import Link from 'next/link';
import type { RateCard } from '@leadfinder/core';
import { requirePermission } from '@/lib/auth';
import { getBudgetStatus, loadRateCard, rateCardKeyFor } from '@/lib/estimate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SearchBuilder } from '@/components/search-builder';
import { Badge, Card, EmptyState, RunStatusBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const metadata = { title: 'Lead Finder' };

const STEPS = [
  { n: 1, label: 'Search', hint: 'Industry + location' },
  { n: 2, label: 'Enrich', hint: 'Optional decision-makers' },
  { n: 3, label: 'Review', hint: 'Dedupe & quality' },
  { n: 4, label: 'Export', hint: 'CSV / XLSX / lists' },
];

export default async function LeadFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requirePermission('searches:run');
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const [{ data: connections }, budget, { data: org }, { data: policy }, { data: recent }] =
    await Promise.all([
      supabase
        .from('integration_connections')
        .select('id, provider, label, status, config')
        .eq('organization_id', ctx.orgId)
        .eq('status', 'connected')
        .is('deleted_at', null)
        .in('provider', ['apify', 'outscraper', 'fixture']),
      getBudgetStatus(ctx.orgId),
      supabase.from('organizations').select('default_country_code').eq('id', ctx.orgId).single(),
      supabase
        .from('quota_policies')
        .select('max_results_per_run')
        .eq('organization_id', ctx.orgId)
        .maybeSingle(),
      supabase
        .from('search_runs')
        .select('id, status, config_snapshot, created_at, accepted_count')
        .eq('organization_id', ctx.orgId)
        .neq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

  const connectionOptions: Array<{
    id: string;
    provider: string;
    label: string;
    planTier: string;
    rateCard: RateCard;
  }> = [];
  for (const conn of connections ?? []) {
    const config = (conn.config ?? {}) as { actorId?: string; planTier?: string };
    const key = rateCardKeyFor(conn.provider, config);
    try {
      const { card } = await loadRateCard(conn.provider, key.scope, key.planTier);
      connectionOptions.push({
        id: conn.id,
        provider: conn.provider,
        label: conn.label,
        planTier: conn.provider === 'fixture' ? 'free' : key.planTier,
        rateCard: card,
      });
    } catch {
      // Connection without a published rate card is not offered for runs.
    }
  }

  const apifyConnected = connectionOptions.some((c) => c.provider === 'apify');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="header-wash -mx-4 -mt-6 px-4 pt-8 pb-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Lead Finder</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-soft">
              Collect business data from Google Maps, optionally enrich decision-makers, review, and
              export. Every paid run needs your confirmation and a hard cost cap.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {apifyConnected ? (
              <Badge tone="ok">Apify connected</Badge>
            ) : (
              <Link href="/integrations">
                <Badge tone="warn">Apify not connected — set up</Badge>
              </Link>
            )}
          </div>
        </div>
        <ol className="mt-5 flex flex-wrap gap-2" aria-label="Process">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
            >
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-primary">
                {step.n}
              </span>
              <span className="font-medium">{step.label}</span>
              <span className="hidden text-xs text-ink-faint sm:inline">{step.hint}</span>
              {i < STEPS.length - 1 ? (
                <span aria-hidden className="text-ink-faint">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </header>

      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      {connectionOptions.length === 0 ? (
        <Card>
          <EmptyState
            title="Connect a data provider first"
            body="Connect Apify in Settings → Integrations (or use the built-in fixture provider) to start searching."
            action={
              <Link
                href="/integrations"
                className="text-sm font-medium text-primary hover:underline"
              >
                Go to Integrations →
              </Link>
            }
          />
        </Card>
      ) : (
        <SearchBuilder
          connections={connectionOptions}
          maxResultsLimit={policy?.max_results_per_run ?? 1000}
          remainingBudgetMicroUsd={budget.remainingMicroUsd}
          perRunCapMicroUsd={budget.perRunCapMicroUsd}
          defaultCountry={org?.default_country_code ?? 'US'}
        />
      )}

      {(recent ?? []).length > 0 ? (
        <Card className="rise rise-4">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold">Recent searches</h2>
            <Link href="/runs" className="text-sm text-primary hover:underline">
              All runs →
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {(recent ?? []).map((run) => {
              const snapshot = run.config_snapshot as { name?: string } | null;
              return (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-canvas"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {snapshot?.name ?? 'Search'}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                      {run.accepted_count > 0 ? `${run.accepted_count} companies` : null}
                      <RunStatusBadge status={run.status} />
                      {formatDateTime(run.created_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
