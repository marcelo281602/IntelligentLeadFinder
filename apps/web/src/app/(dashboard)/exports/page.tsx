import Link from 'next/link';
import { hasPermission } from '@leadfinder/core';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, TableShell, Td, Th } from '@/components/ui';

export const metadata = { title: 'Exports' };

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'primary'> = {
  ready: 'ok',
  generating: 'primary',
  pending: 'neutral',
  failed: 'danger',
  purged: 'neutral',
};

export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const canExport = hasPermission(ctx.role, 'exports:create', ctx.overrides);

  const { data: exports } = await supabase
    .from('exports')
    .select(
      'id, format, status, config, row_count, includes_personal_data, generated_at, expires_at, download_count, created_at, error',
    )
    .eq('organization_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exports</h1>
          <p className="text-sm text-ink-soft">
            Files are generated in the background, download links expire after 24 hours, and files
            are purged after 7 days.
          </p>
        </div>
        {canExport ? (
          <Link
            href="/exports/new"
            className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            New export
          </Link>
        ) : null}
      </div>

      {params.created ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Export queued — it will appear as “ready” below shortly.
        </p>
      ) : null}

      <Card className="rise">
        {(exports ?? []).length === 0 ? (
          <EmptyState
            title="No exports yet"
            body={
              canExport
                ? 'Create a CSV or XLSX export of your companies or decision-makers.'
                : 'Your role cannot create exports.'
            }
            action={
              canExport ? (
                <Link
                  href="/exports/new"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  New export →
                </Link>
              ) : undefined
            }
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Export</Th>
                <Th>Status</Th>
                <Th className="text-right">Rows</Th>
                <Th>Personal data</Th>
                <Th>Created</Th>
                <Th>Expires</Th>
                <Th>
                  <span className="sr-only">Download</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {(exports ?? []).map((exp) => {
                const config = exp.config as { kind?: string } | null;
                return (
                  <tr key={exp.id} className="hover:bg-canvas">
                    <Td>
                      <span className="font-medium">
                        {config?.kind === 'contacts' ? 'Decision makers' : 'Companies'}
                      </span>
                      <span className="ml-2 font-mono text-xs text-ink-faint uppercase">
                        {exp.format}
                      </span>
                      {exp.error ? <p className="text-xs text-danger">{exp.error}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[exp.status] ?? 'neutral'}>{exp.status}</Badge>
                    </Td>
                    <Td className="text-right font-mono">{exp.row_count ?? '—'}</Td>
                    <Td>
                      {exp.includes_personal_data ? (
                        <Badge tone="warn">Yes</Badge>
                      ) : (
                        <span className="text-xs text-ink-faint">No</span>
                      )}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDateTime(exp.created_at)}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {exp.status === 'ready' ? formatDateTime(exp.expires_at) : '—'}
                    </Td>
                    <Td>
                      {exp.status === 'ready' ? (
                        <Link
                          href={`/exports/${exp.id}/link`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Download
                        </Link>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}
