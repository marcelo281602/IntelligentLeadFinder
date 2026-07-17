import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, TableShell, Td, Th, cx } from '@/components/ui';

export const metadata = { title: 'Platform · Admin' };

export default async function AdminOverviewPage() {
  await requireSuperAdmin();
  const service = createServiceClient();

  const [
    { count: orgCount },
    { count: userCount },
    { count: activeRuns },
    { data: queue },
    { data: deadLetters },
    { data: recentFailures },
    { data: flags },
  ] = await Promise.all([
    service
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null),
    service.from('user_profiles').select('id', { count: 'exact', head: true }),
    service
      .from('search_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', [
        'queued',
        'starting',
        'running',
        'ingesting',
        'normalizing',
        'deduplicating',
        'enriching',
      ]),
    service.from('provider_jobs').select('status'),
    service
      .from('provider_jobs')
      .select('id, kind, last_error, updated_at, organization_id')
      .eq('status', 'dead_letter')
      .order('updated_at', { ascending: false })
      .limit(10),
    service
      .from('search_runs')
      .select('id, error_summary, created_at, organization_id')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(5),
    service.from('feature_flags').select('key, enabled').is('organization_id', null).order('key'),
  ]);

  const queueCounts = new Map<string, number>();
  for (const job of queue ?? []) {
    queueCounts.set(job.status as string, (queueCounts.get(job.status as string) ?? 0) + 1);
  }

  const stats: Array<[string, string | number]> = [
    ['Workspaces', orgCount ?? 0],
    ['Users', userCount ?? 0],
    ['Active runs', activeRuns ?? 0],
    ['Queue pending', queueCounts.get('pending') ?? 0],
    ['Dead letters', (deadLetters ?? []).length],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Platform health</h1>
        <Link href="/admin/clients" className="text-sm font-medium text-primary hover:underline">
          Manage clients →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value], i) => (
          <Card key={label} className={cx('rise p-4', `rise-${Math.min(i + 1, 4)}`)}>
            <p className="overline">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rise rise-2">
          <CardHeader overline="Reliability" title="Dead-letter jobs" />
          {(deadLetters ?? []).length === 0 ? (
            <EmptyState
              title="No dead letters"
              body="All jobs are completing or retrying normally."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Kind</Th>
                  <Th>Error</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {(deadLetters ?? []).map((job) => (
                  <tr key={job.id}>
                    <Td>
                      <code className="mono text-xs">{job.kind}</code>
                    </Td>
                    <Td className="max-w-[40ch]">
                      <span className="block truncate text-xs text-danger">{job.last_error}</span>
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDateTime(job.updated_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="rise rise-3">
            <CardHeader overline="Recent" title="Failed runs" />
            {(recentFailures ?? []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-faint">No failed runs.</p>
            ) : (
              <ul className="divide-y divide-line px-5 py-1 text-sm">
                {(recentFailures ?? []).map((run) => (
                  <li key={run.id} className="py-2">
                    <p className="truncate text-danger">{run.error_summary ?? 'Run failed'}</p>
                    <p className="text-xs text-ink-faint">{formatDateTime(run.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="rise rise-4">
            <CardHeader overline="Gates" title="Global feature flags" />
            <ul className="divide-y divide-line px-5 py-1 text-sm">
              {(flags ?? []).map((flag) => (
                <li key={flag.key} className="flex items-center justify-between py-2">
                  <code className="mono text-xs">{flag.key}</code>
                  <Badge tone={flag.enabled ? 'ok' : 'neutral'}>
                    {flag.enabled ? 'on' : 'off'}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
