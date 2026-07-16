import Link from 'next/link';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import {
  Card,
  EmptyState,
  FixtureBadge,
  Money,
  RunStatusBadge,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Search Runs' };
const PAGE_SIZE = 25;

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const supabase = await createSupabaseServerClient();

  const { data: runs, count } = await supabase
    .from('search_runs')
    .select(
      'id, status, provider, config_snapshot, accepted_count, duplicate_count, enriched_count, estimate_expected_micro_usd, actual_cost_micro_usd, is_fixture, created_at',
      {
        count: 'exact',
      },
    )
    .eq('organization_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search Runs</h1>
        <Link href="/lead-finder" className="text-sm font-medium text-primary hover:underline">
          New search →
        </Link>
      </div>
      <Card className="rise">
        {(runs ?? []).length === 0 ? (
          <EmptyState
            title="No runs yet"
            body="Start your first search from the Lead Finder."
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
          <TableShell>
            <thead>
              <tr>
                <Th>Search</Th>
                <Th>Status</Th>
                <Th>Provider</Th>
                <Th className="text-right">Companies</Th>
                <Th className="text-right">Contacts</Th>
                <Th className="text-right">Est. / Actual</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => {
                const snapshot = run.config_snapshot as { name?: string } | null;
                return (
                  <tr key={run.id} className="hover:bg-canvas">
                    <Td>
                      <Link
                        href={`/runs/${run.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {snapshot?.name ?? 'Search'}
                      </Link>
                      {run.is_fixture ? (
                        <span className="ml-2">
                          <FixtureBadge />
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <RunStatusBadge status={run.status} />
                    </Td>
                    <Td className="text-ink-soft">{run.provider}</Td>
                    <Td className="text-right font-mono">{run.accepted_count}</Td>
                    <Td className="text-right font-mono">{run.enriched_count}</Td>
                    <Td className="text-right">
                      <Money micro={run.estimate_expected_micro_usd} className="text-xs" />
                      <span className="text-ink-faint"> / </span>
                      <Money micro={run.actual_cost_micro_usd} className="text-xs" />
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDateTime(run.created_at)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>
      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link className="text-primary hover:underline" href={`/runs?page=${page - 1}`}>
              ← Prev
            </Link>
          ) : null}
          <span className="text-ink-faint">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="text-primary hover:underline" href={`/runs?page=${page + 1}`}>
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
