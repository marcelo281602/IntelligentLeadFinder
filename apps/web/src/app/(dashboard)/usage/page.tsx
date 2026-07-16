import { requireOrg } from '@/lib/auth';
import { getBudgetStatus } from '@/lib/estimate';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime, humanize } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, Money, TableShell, Td, Th } from '@/components/ui';

export const metadata = { title: 'Usage & Costs' };

export default async function UsagePage() {
  const ctx = await requireOrg();
  const supabase = await createSupabaseServerClient();
  const budget = await getBudgetStatus(ctx.orgId);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: events }, { data: ledger }] = await Promise.all([
    supabase
      .from('usage_events')
      .select('feature, provider, quantity, unit, cost_micro_usd, occurred_at')
      .eq('organization_id', ctx.orgId)
      .gte('occurred_at', monthStart.toISOString())
      .order('occurred_at', { ascending: false })
      .limit(200),
    supabase
      .from('cost_ledger')
      .select(
        'run_id, provider, estimated_micro_usd, capped_micro_usd, actual_micro_usd, variance_micro_usd, variance_explanation, reconciled_at',
      )
      .eq('organization_id', ctx.orgId)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  const byFeature = new Map<string, { quantity: number; cost: number }>();
  for (const event of events ?? []) {
    const entry = byFeature.get(event.feature) ?? { quantity: 0, cost: 0 };
    entry.quantity += Number(event.quantity ?? 0);
    entry.cost += Number(event.cost_micro_usd ?? 0);
    byFeature.set(event.feature, entry);
  }

  const spentPct =
    budget.monthlyBudgetMicroUsd && budget.monthlyBudgetMicroUsd > 0
      ? Math.min(
          100,
          Math.round((budget.spentThisMonthMicroUsd / budget.monthlyBudgetMicroUsd) * 100),
        )
      : 0;
  const warn = spentPct >= budget.warnAtPercent;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Usage &amp; Costs</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rise rise-1 p-5">
          <p className="overline">Spent this month</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            <Money micro={budget.spentThisMonthMicroUsd} />
          </p>
        </Card>
        <Card className="rise rise-2 p-5">
          <p className="overline">Monthly budget</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            <Money micro={budget.monthlyBudgetMicroUsd} />
          </p>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas"
            role="img"
            aria-label={`${spentPct}% of budget used`}
          >
            <div
              className={`h-full rounded-full ${warn ? 'bg-warn' : 'bg-accent-ink'}`}
              style={{ width: `${spentPct}%` }}
            />
          </div>
          {warn ? (
            <p className="mt-1 text-xs text-warn">
              Past the {budget.warnAtPercent}% warning threshold.
            </p>
          ) : null}
        </Card>
        <Card className="rise rise-3 p-5">
          <p className="overline">Per-run cap</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            <Money micro={budget.perRunCapMicroUsd} />
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            New paid runs are blocked at the monthly limit.
          </p>
        </Card>
      </div>

      <Card className="rise rise-2">
        <CardHeader overline="This month" title="Usage by feature" />
        {byFeature.size === 0 ? (
          <EmptyState
            title="No usage yet this month"
            body="Usage is recorded when runs and exports complete."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Feature</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="text-right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {[...byFeature.entries()].map(([feature, entry]) => (
                <tr key={feature}>
                  <Td className="font-medium">{humanize(feature)}</Td>
                  <Td className="text-right font-mono">{entry.quantity.toLocaleString()}</Td>
                  <Td className="text-right">
                    <Money micro={entry.cost} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card className="rise rise-3">
        <CardHeader overline="Estimate vs actual" title="Cost reconciliation by run" />
        {(ledger ?? []).length === 0 ? (
          <EmptyState
            title="No reconciled runs yet"
            body="Each completed run reconciles its estimate against the provider-reported cost."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Run</Th>
                <Th>Provider</Th>
                <Th className="text-right">Estimated</Th>
                <Th className="text-right">Cap</Th>
                <Th className="text-right">Actual</Th>
                <Th className="text-right">Variance</Th>
                <Th>Reconciled</Th>
              </tr>
            </thead>
            <tbody>
              {(ledger ?? []).map((row) => (
                <tr key={row.run_id} className="hover:bg-canvas">
                  <Td>
                    <a
                      href={`/runs/${row.run_id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {String(row.run_id).slice(0, 8)}
                    </a>
                    {row.variance_explanation ? (
                      <p className="max-w-[36ch] text-xs text-ink-faint">
                        {row.variance_explanation}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={row.provider === 'fixture' ? 'warn' : 'primary'}>
                      {row.provider}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Money micro={row.estimated_micro_usd} />
                  </Td>
                  <Td className="text-right">
                    <Money micro={row.capped_micro_usd} />
                  </Td>
                  <Td className="text-right">
                    <Money micro={row.actual_micro_usd} />
                  </Td>
                  <Td className="text-right">
                    <Money
                      micro={row.variance_micro_usd}
                      className={Number(row.variance_micro_usd ?? 0) > 0 ? 'text-warn' : 'text-ok'}
                    />
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-ink-faint">
                    {formatDateTime(row.reconciled_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}
