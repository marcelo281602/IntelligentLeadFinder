import Link from 'next/link';
import { APPROVED_YELP_ACTOR_ID, hasPermission } from '@leadfinder/core';
import { createYelpDraftAndEstimate } from '@/actions/yelp';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime, formatMicroUsd } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, RunStatusBadge, Select } from '@/components/ui';

export const metadata = { title: 'Yelp Leads Scraper' };

const STEPS = [
  { n: 1, label: 'Search', hint: 'Industry + location' },
  { n: 2, label: 'Confirm', hint: 'Estimate + hard cap' },
  { n: 3, label: 'Review', hint: 'Dedupe & quality' },
  { n: 4, label: 'Export', hint: 'CSV / XLSX / lists' },
];

export default async function YelpLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const canRun = hasPermission(ctx.role, 'searches:run', ctx.overrides);
  const canManage = hasPermission(ctx.role, 'integrations:manage', ctx.overrides);
  const supabase = await createSupabaseServerClient();

  const [{ data: flags }, { data: connections }, { data: org }, { data: policy }, { data: card }] =
    await Promise.all([
      supabase
        .from('feature_flags')
        .select('key, enabled')
        .in('key', ['provider_yelp_apify', 'yelp_legal_approved'])
        .is('organization_id', null),
      supabase
        .from('integration_connections')
        .select('id, label, status, last_test_ok, last_test_at')
        .eq('organization_id', ctx.orgId)
        .eq('provider', 'yelp_apify')
        .eq('status', 'connected')
        .is('deleted_at', null)
        .order('created_at'),
      supabase.from('organizations').select('default_country_code').eq('id', ctx.orgId).single(),
      supabase
        .from('quota_policies')
        .select('max_results_per_run')
        .eq('organization_id', ctx.orgId)
        .maybeSingle(),
      supabase
        .from('provider_rate_cards')
        .select('events, last_verified_at, version')
        .eq('provider', 'yelp_apify')
        .eq('active', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const flagOn = (key: string) => (flags ?? []).find((f) => f.key === key)?.enabled ?? false;
  const featureOn = flagOn('provider_yelp_apify');
  const legalOn = flagOn('yelp_legal_approved');
  const connection = (connections ?? [])[0] ?? null;

  // Feature flag off: safe, unmistakable disabled state (kill switch).
  if (!featureOn) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <EmptyState
            title="Yelp Leads Scraper is not enabled"
            body="This feature is switched off for this deployment. Existing Google Maps, Outscraper, and Prospeo workflows are unaffected."
          />
        </Card>
      </div>
    );
  }

  const [{ data: recentRuns }, { data: yelpCompanies }] = await Promise.all([
    supabase
      .from('search_runs')
      .select('id, status, config_snapshot, created_at, accepted_count, actual_cost_micro_usd')
      .eq('organization_id', ctx.orgId)
      .eq('provider', 'yelp_apify')
      .neq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('companies')
      .select('id, canonical_name, city, region, rating, review_count, primary_phone, website, yelp_url')
      .eq('organization_id', ctx.orgId)
      .not('yelp_business_id', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  const perResultMicro = Number(
    (card?.events as Record<string, number> | null)?.business_result ?? 2750,
  );
  const maxAllowed = Math.min(policy?.max_results_per_run ?? 1000, 1000);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="header-wash -mx-4 -mt-6 px-4 pt-8 pb-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Yelp Leads Scraper</h1>
            <p className="mt-1 max-w-xl text-sm text-ink-soft">
              Collect Yelp business data through your connected Apify Actor. Searches run
              asynchronously; every paid run needs your confirmation and a hard cost cap.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connection ? (
              <Badge tone="ok">Yelp via Apify connected</Badge>
            ) : (
              <Link href="/integrations">
                <Badge tone="warn">Yelp not connected — set up</Badge>
              </Link>
            )}
            {!legalOn ? <Badge tone="neutral">Legal review pending</Badge> : null}
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

      {!legalOn ? (
        <div className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="font-medium">Yelp runs are gated behind a legal &amp; terms review.</p>
          <p className="mt-0.5 text-xs">
            Yelp&apos;s terms restrict automated data extraction. New paid Yelp runs stay disabled
            until a documented review is recorded for your intended markets. Connections can be
            prepared in the meantime.
          </p>
        </div>
      ) : null}

      {!connection ? (
        <Card>
          <EmptyState
            title="Connect Yelp via Apify first"
            body={`Yelp searches use a separate Apify connection bound to the approved Actor ${APPROVED_YELP_ACTOR_ID}. Your existing Google Maps Apify connection is not reused — submit a token (it may be the same one) on the Yelp via Apify card.`}
            action={
              canManage ? (
                <Link
                  href="/integrations"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Go to Integrations →
                </Link>
              ) : (
                <span className="text-xs text-ink-faint">
                  Ask a workspace owner or admin to connect it.
                </span>
              )
            }
          />
        </Card>
      ) : (
        <Card className="rise rise-1">
          <CardHeader
            overline={`Approved Actor ${APPROVED_YELP_ACTOR_ID} · ${formatMicroUsd(perResultMicro)} per business result · pricing verified ${card?.last_verified_at ?? '2026-07-18'}`}
            title="New Yelp search"
          />
          {canRun ? (
            <form action={createYelpDraftAndEstimate} className="grid gap-4 p-5 sm:grid-cols-2">
              <input type="hidden" name="connectionId" value={connection.id} />
              <Field
                label="Industry or search term"
                htmlFor="yelp-term"
                hint='e.g. "plumber", "coffee shop", "wedding photographer"'
              >
                <Input id="yelp-term" name="searchTerm" required maxLength={200} />
              </Field>
              <Field label="Search name" htmlFor="yelp-name" hint="Defaults to the search term">
                <Input id="yelp-name" name="name" maxLength={200} />
              </Field>
              <Field label="Country" htmlFor="yelp-country">
                <Select
                  id="yelp-country"
                  name="countryCode"
                  defaultValue={org?.default_country_code ?? 'US'}
                >
                  <option value="US">United States</option>
                  <option value="CA">Canada</option>
                  <option value="GB">United Kingdom</option>
                  <option value="AU">Australia</option>
                  <option value="IE">Ireland</option>
                  <option value="NZ">New Zealand</option>
                </Select>
              </Field>
              <Field label="City" htmlFor="yelp-city">
                <Input id="yelp-city" name="city" maxLength={120} />
              </Field>
              <Field label="State / region" htmlFor="yelp-region">
                <Input id="yelp-region" name="region" maxLength={120} />
              </Field>
              <Field label="Postal / ZIP code" htmlFor="yelp-postal">
                <Input id="yelp-postal" name="postalCode" maxLength={20} />
              </Field>
              <Field
                label="Maximum results"
                htmlFor="yelp-max"
                hint={`Caps the paid item count. Workspace limit: ${maxAllowed}`}
              >
                <Input
                  id="yelp-max"
                  name="maxResults"
                  type="number"
                  min={1}
                  max={maxAllowed}
                  defaultValue={Math.min(100, maxAllowed)}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <details className="rounded-md border border-line bg-raised">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary select-none">
                    Advanced Yelp options
                  </summary>
                  <div className="space-y-3 border-t border-line px-4 py-3 text-sm">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="fetchBusinessDetails"
                        defaultChecked
                        className="mt-0.5"
                      />
                      <span>
                        Fetch full business details
                        <span className="block text-xs text-ink-faint">
                          Visits each profile for hours, website, and services. Recommended.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="scrapeReviews" className="mt-0.5" />
                      <span>
                        Collect reviews
                        <span className="block text-xs text-ink-faint">
                          Billed at {formatMicroUsd(Number((card?.events as Record<string, number> | null)?.review_detail ?? 1500))}{' '}
                          per review. Off by default — adds cost and retention obligations.
                        </span>
                      </span>
                    </label>
                    <Field
                      label="Max reviews per business"
                      htmlFor="yelp-max-reviews"
                      hint="Applies only when review collection is on"
                    >
                      <Input
                        id="yelp-max-reviews"
                        name="maxReviewsPerBusiness"
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={10}
                      />
                    </Field>
                    <label className="flex items-start gap-2 opacity-60">
                      <input type="checkbox" disabled className="mt-0.5" />
                      <span>
                        Website contact-email enrichment
                        <span className="block text-xs text-ink-faint">
                          Disabled: the Actor&apos;s email-enrichment event has no published price,
                          so it cannot be estimated honestly. Any future email found this way is a
                          company contact email — never a decision-maker email.
                        </span>
                      </span>
                    </label>
                  </div>
                </details>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button type="submit" disabled={!legalOn}>
                  Estimate cost →
                </Button>
                <p className="text-xs text-ink-faint">
                  Next step shows the low / expected / high estimate and requires a hard maximum
                  cost before anything is paid.
                  {!legalOn ? ' Disabled until the legal review gate is recorded.' : ''}
                </p>
              </div>
            </form>
          ) : (
            <p className="p-5 text-sm text-ink-faint">
              Your role can review Yelp results but cannot start paid searches.
            </p>
          )}
        </Card>
      )}

      {(recentRuns ?? []).length > 0 ? (
        <Card className="rise rise-3">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold">Recent Yelp searches</h2>
            <Link href="/runs" className="text-sm text-primary hover:underline">
              All runs →
            </Link>
          </div>
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
                      {snapshot?.name ?? 'Yelp search'}
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-ink-faint">
                      {run.accepted_count > 0 ? `${run.accepted_count} companies` : null}
                      {run.actual_cost_micro_usd !== null
                        ? formatMicroUsd(Number(run.actual_cost_micro_usd))
                        : null}
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

      {(yelpCompanies ?? []).length > 0 ? (
        <Card className="rise rise-4">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold">Latest Yelp leads</h2>
            <Link href="/companies" className="text-sm text-primary hover:underline">
              All companies (lists, exports, enrichment) →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-faint">
                  <th className="px-5 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Rating</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(yelpCompanies ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-canvas">
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.canonical_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {[c.city, c.region].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {c.rating != null ? `${c.rating}★ (${c.review_count ?? 0})` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{c.primary_phone ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {c.website ? (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline"
                        >
                          Website
                        </a>
                      ) : null}
                      {c.website && c.yelp_url ? ' · ' : null}
                      {c.yelp_url ? (
                        <a
                          href={c.yelp_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-primary hover:underline"
                        >
                          Yelp
                        </a>
                      ) : null}
                      {!c.website && !c.yelp_url ? '—' : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
