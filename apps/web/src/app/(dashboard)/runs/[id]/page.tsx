import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVE_RUN_STATUSES, hasPermission, microToUsd, type RunStatus } from '@leadfinder/core';
import { cancelRun, confirmRun, retryRun } from '@/actions/search';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime, humanize } from '@/lib/format';
import { RefreshPoller } from '@/components/refresh-poller';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  FixtureBadge,
  Input,
  Money,
  RunStatusBadge,
  cx,
} from '@/components/ui';

export const metadata = { title: 'Run detail' };

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; confirm?: string }>;
}) {
  const ctx = await requireOrg();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: run } = await supabase
    .from('search_runs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!run) notFound();

  const { data: stages } = await supabase
    .from('search_run_stages')
    .select('stage, status, started_at, finished_at, error, attempt')
    .eq('run_id', id)
    .order('started_at');

  const status = run.status as RunStatus;
  const snapshot = run.config_snapshot as {
    name?: string;
    searchTerm?: string;
    maxResults?: number;
    locations?: Array<{ countryCode?: string; city?: string; region?: string }>;
    decisionMakers?: {
      enabled?: boolean;
      maxContactsPerCompany?: number;
      verifyWorkEmail?: boolean;
    };
  };
  const estimate = run.estimate as {
    totalLow: number;
    totalExpected: number;
    totalHigh: number;
    recommendedCapMicroUsd: number;
    rateCardLastVerifiedAt?: string;
    lines?: Array<{ eventKey: string; label: string; expectedUnits: number; expected: number }>;
  } | null;

  const active = ACTIVE_RUN_STATUSES.includes(status);
  const canRun = hasPermission(ctx.role, 'searches:run', ctx.overrides);
  const awaiting = status === 'awaiting_confirmation';
  const location = snapshot.locations?.[0];

  const counts: Array<[string, number]> = [
    ['Discovered', run.discovered_count],
    ['Ingested', run.ingested_count],
    ['Accepted', run.accepted_count],
    ['Duplicates', run.duplicate_count],
    ['Rejected', run.rejected_count],
    ['Contacts', run.enriched_count],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {active ? <RefreshPoller intervalMs={3000} /> : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{snapshot.name ?? 'Search run'}</h1>
            {run.is_fixture ? <FixtureBadge /> : null}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            “{snapshot.searchTerm}” ·{' '}
            {[location?.city, location?.region, location?.countryCode].filter(Boolean).join(', ')} ·
            max {snapshot.maxResults} results
            {snapshot.decisionMakers?.enabled
              ? ` · up to ${snapshot.decisionMakers.maxContactsPerCompany} decision-maker(s)/company${snapshot.decisionMakers.verifyWorkEmail ? ' with email verification' : ''}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RunStatusBadge status={status} />
          {canRun && active ? (
            <form action={cancelRun}>
              <input type="hidden" name="runId" value={run.id} />
              <Button variant="danger" type="submit">
                Cancel run
              </Button>
            </form>
          ) : null}
          {canRun && (status === 'failed' || status === 'partially_completed') ? (
            <form action={retryRun}>
              <input type="hidden" name="runId" value={run.id} />
              <Button variant="secondary" type="submit">
                Retry / resume
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {query.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {query.error}
        </p>
      ) : null}
      {run.error_summary ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          <strong>Provider error:</strong> {run.error_summary}
        </p>
      ) : null}

      {/* Confirmation panel — the paid-run gate */}
      {awaiting && estimate ? (
        <Card className="rise border-primary/40">
          <CardHeader
            overline="Confirmation required"
            title="Review the estimate and set the hard cost cap"
          />
          <div className="grid gap-6 p-5 md:grid-cols-2">
            <div className="text-sm">
              <ul className="divide-y divide-line border-y border-line">
                {(estimate.lines ?? []).map((line) => (
                  <li key={line.eventKey} className="flex justify-between py-1.5">
                    <span className="text-ink-soft">
                      {line.label}
                      <span className="ml-1 text-xs text-ink-faint">
                        ×{line.expectedUnits.toLocaleString()}
                      </span>
                    </span>
                    <Money micro={line.expected} className="text-xs" />
                  </li>
                ))}
              </ul>
              <dl className="mt-3 space-y-1">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Low estimate</dt>
                  <dd>
                    <Money micro={estimate.totalLow} />
                  </dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Expected</dt>
                  <dd>
                    <Money micro={estimate.totalExpected} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">High estimate</dt>
                  <dd>
                    <Money micro={estimate.totalHigh} />
                  </dd>
                </div>
              </dl>
              {estimate.rateCardLastVerifiedAt ? (
                <p className="mt-2 text-xs text-ink-faint">
                  Provider prices last verified {estimate.rateCardLastVerifiedAt}. Actual records
                  available may be lower than requested.
                </p>
              ) : null}
            </div>
            <form action={confirmRun} className="space-y-3">
              <input type="hidden" name="runId" value={run.id} />
              <label htmlFor="capUsd" className="block text-sm font-medium">
                Hard maximum cost (USD)
              </label>
              <Input
                id="capUsd"
                name="capUsd"
                type="number"
                step="0.01"
                min={microToUsd(estimate.totalLow).toFixed(2)}
                defaultValue={microToUsd(estimate.recommendedCapMicroUsd).toFixed(2)}
                className="money text-lg"
                required
              />
              <p className="text-xs text-ink-soft">
                Sent to the provider as an enforced spending limit (
                <code className="mono">maxTotalChargeUsd</code>). The run stops when it is reached.
                You can lower it; raising beyond workspace limits is blocked.
              </p>
              <Button type="submit" className="w-full" disabled={!canRun}>
                Confirm and start run
              </Button>
              {!canRun ? (
                <p className="text-xs text-danger">Your role cannot start paid runs.</p>
              ) : null}
            </form>
          </div>
        </Card>
      ) : null}

      {/* Progress */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {counts.map(([label, value], i) => (
          <Card key={label} className={cx('rise p-4', `rise-${Math.min(i + 1, 4)}`)}>
            <p className="overline">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rise rise-2">
          <CardHeader overline="Pipeline" title="Stage history" />
          {(stages ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-faint">
              No stages yet — the run has not started.
            </p>
          ) : (
            <ol className="divide-y divide-line">
              {(stages ?? []).map((stage, i) => (
                <li
                  key={`${stage.stage}-${i}`}
                  className="flex items-center justify-between px-5 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cx(
                        'size-2 rounded-full',
                        stage.status === 'succeeded' && 'bg-ok',
                        stage.status === 'failed' && 'bg-danger',
                        stage.status === 'running' && 'animate-pulse bg-primary',
                        stage.status === 'skipped' && 'bg-line-strong',
                      )}
                    />
                    {humanize(stage.stage)}
                    {stage.attempt > 1 ? (
                      <span className="text-xs text-ink-faint">attempt {stage.attempt}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {formatDateTime(stage.started_at)}
                    {stage.error ? <span className="ml-2 text-danger">{stage.error}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="rise rise-3">
          <CardHeader overline="Billing" title="Cost" />
          <dl className="space-y-2 p-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Expected estimate</dt>
              <dd>
                <Money micro={run.estimate_expected_micro_usd} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Hard cap (approved)</dt>
              <dd>
                <Money micro={run.hard_cap_micro_usd} />
              </dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Actual provider cost</dt>
              <dd>
                {run.cost_reconciled_at ? (
                  <Money micro={run.actual_cost_micro_usd} />
                ) : (
                  <span className="text-ink-faint">pending reconciliation</span>
                )}
              </dd>
            </div>
            <div className="border-t border-line pt-2 text-xs text-ink-faint">
              <p>
                Provider: {run.provider}
                {run.provider_run_id ? (
                  <>
                    {' '}
                    · run <code className="mono">{run.provider_run_id}</code>
                  </>
                ) : null}
              </p>
              {run.provider_dataset_id ? (
                <p>
                  Dataset: <code className="mono">{run.provider_dataset_id}</code>
                </p>
              ) : null}
              <p>
                Started {formatDateTime(run.started_at)} · heartbeat{' '}
                {formatDateTime(run.last_heartbeat_at)} · finished{' '}
                {formatDateTime(run.completed_at)}
              </p>
            </div>
          </dl>
        </Card>
      </div>

      {run.accepted_count > 0 ? (
        <div className="flex flex-wrap gap-3">
          <Link href="/companies" className="text-sm font-medium text-primary hover:underline">
            Review {run.accepted_count} companies →
          </Link>
          {run.enriched_count > 0 ? (
            <Link href="/contacts" className="text-sm font-medium text-primary hover:underline">
              Review {run.enriched_count} decision-makers →
            </Link>
          ) : null}
        </div>
      ) : null}

      {awaiting ? (
        <p className="text-xs text-ink-faint">
          Nothing has been sent to the provider yet.{' '}
          <Badge tone="accent">No charge until confirmed</Badge>
        </p>
      ) : null}
    </div>
  );
}
