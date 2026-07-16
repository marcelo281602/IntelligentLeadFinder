import { hasPermission } from '@leadfinder/core';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, Input, Button, TableShell, Td, Th } from '@/components/ui';

export const metadata = { title: 'Audit Logs' };
const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const q = (params.q ?? '').trim();

  if (!hasPermission(ctx.role, 'audit:read')) {
    return (
      <Card className="mx-auto max-w-2xl">
        <EmptyState
          title="Audit access restricted"
          body="Only workspace owners and admins can read the audit trail."
        />
      </Card>
    );
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('audit_logs')
    .select('id, action, actor_type, actor_user_id, entity_kind, entity_id, details, created_at', {
      count: 'exact',
    })
    .eq('organization_id', ctx.orgId);
  if (q) query = query.ilike('action', `%${q}%`);
  const { data: logs, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-ink-soft">
            Append-only record of every sensitive action. {count ?? 0} events.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Filter by action…"
            className="w-56"
            aria-label="Filter audit actions"
          />
          <Button variant="secondary" type="submit">
            Filter
          </Button>
        </form>
      </div>

      <Card className="rise">
        {(logs ?? []).length === 0 ? (
          <EmptyState
            title="No audit events"
            body="Actions like sign-ins, run confirmations, and exports appear here."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log) => (
                <tr key={log.id} className="hover:bg-canvas">
                  <Td>
                    <code className="mono text-xs font-medium">{log.action}</code>
                  </Td>
                  <Td>
                    <Badge tone={log.actor_type === 'worker' ? 'accent' : 'neutral'}>
                      {log.actor_type}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-ink-soft">
                    {log.entity_kind ?? '—'}
                    {log.entity_id ? (
                      <code className="mono block text-ink-faint">
                        {String(log.entity_id).slice(0, 8)}
                      </code>
                    ) : null}
                  </Td>
                  <Td className="max-w-[40ch]">
                    <code className="mono block truncate text-xs text-ink-faint">
                      {JSON.stringify(log.details)}
                    </code>
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-ink-faint">
                    {formatDateTime(log.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <a
              className="text-primary hover:underline"
              href={`/audit?page=${page - 1}&q=${encodeURIComponent(q)}`}
            >
              ← Prev
            </a>
          ) : null}
          <span className="text-ink-faint">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <a
              className="text-primary hover:underline"
              href={`/audit?page=${page + 1}&q=${encodeURIComponent(q)}`}
            >
              Next →
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
