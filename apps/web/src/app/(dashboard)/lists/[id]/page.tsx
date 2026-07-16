import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  Badge,
  Card,
  CardHeader,
  EmailStatusBadge,
  EmptyState,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'List' };

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const ctx = await requireOrg();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: list } = await supabase
    .from('lists')
    .select('id, name, description')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!list) notFound();

  const [{ data: companies }, { data: contacts }] = await Promise.all([
    supabase
      .from('list_companies')
      .select(
        'company_id, companies(id, canonical_name, primary_category, city, country_code, primary_email, primary_phone)',
      )
      .eq('list_id', id)
      .limit(500),
    supabase
      .from('list_contacts')
      .select('contact_id, contacts(id, full_name, job_title, work_email, work_email_status)')
      .eq('list_id', id)
      .limit(500),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/lists" className="text-sm text-primary hover:underline">
            ← Lists
          </Link>
          <h1 className="text-2xl font-bold">{list.name}</h1>
          {list.description ? <p className="text-sm text-ink-soft">{list.description}</p> : null}
        </div>
        <Link
          href={`/exports/new?listId=${list.id}`}
          className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Export this list
        </Link>
      </div>

      {query.added ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Added {query.added} record(s) to the list.
        </p>
      ) : null}

      <Card className="rise rise-1">
        <CardHeader overline="Companies" title={`Companies (${(companies ?? []).length})`} />
        {(companies ?? []).length === 0 ? (
          <EmptyState
            title="No companies on this list"
            body="Add companies from the Companies page."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Category</Th>
                <Th>Location</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
              </tr>
            </thead>
            <tbody>
              {(companies ?? []).map((row) => {
                const c = row.companies as unknown as {
                  id: string;
                  canonical_name: string;
                  primary_category: string | null;
                  city: string | null;
                  country_code: string | null;
                  primary_email: string | null;
                  primary_phone: string | null;
                } | null;
                if (!c) return null;
                return (
                  <tr key={row.company_id} className="hover:bg-canvas">
                    <Td>
                      <Link
                        href={`/companies/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.canonical_name}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{c.primary_category ?? '—'}</Td>
                    <Td className="text-ink-soft">
                      {[c.city, c.country_code].filter(Boolean).join(', ') || '—'}
                    </Td>
                    <Td className="text-xs">
                      {c.primary_email ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td className="font-mono text-xs">
                      {c.primary_phone ?? <span className="text-ink-faint">—</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <Card className="rise rise-2">
        <CardHeader overline="Decision makers" title={`Contacts (${(contacts ?? []).length})`} />
        {(contacts ?? []).length === 0 ? (
          <EmptyState
            title="No contacts on this list"
            body="Add decision-makers from the Decision Makers page."
          />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Title</Th>
                <Th>Work email</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((row) => {
                const c = row.contacts as unknown as {
                  id: string;
                  full_name: string;
                  job_title: string | null;
                  work_email: string | null;
                  work_email_status: string;
                } | null;
                if (!c) return null;
                return (
                  <tr key={row.contact_id} className="hover:bg-canvas">
                    <Td>
                      <Link
                        href={`/contacts/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.full_name}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{c.job_title ?? '—'}</Td>
                    <Td className="text-xs">
                      {c.work_email ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td>
                      <EmailStatusBadge status={c.work_email_status} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>

      <p className="text-xs text-ink-faint">
        <Badge tone="neutral">Tip</Badge> Lists cap at 500 rows in this view; exports include all
        members.
      </p>
    </div>
  );
}
