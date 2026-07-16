import Link from 'next/link';
import { addToList } from '@/actions/lists';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  EmailStatusBadge,
  EmptyState,
  FixtureBadge,
  Input,
  Select,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Decision Makers' };
const PAGE_SIZE = 25;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; email?: string; error?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const q = (params.q ?? '').trim();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('contacts')
    .select(
      'id, full_name, job_title, seniority, work_email, work_email_status, phone, personal_linkedin_url, company_linkedin_url, provider, is_fixture, last_enriched_at, companies(canonical_name)',
      { count: 'exact' },
    )
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null);
  if (q) query = query.ilike('full_name', `%${q}%`);
  if (params.email) query = query.eq('work_email_status', params.email);

  const { data: contacts, count } = await query
    .order('updated_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .order('name');

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Decision Makers</h1>
          <p className="text-sm text-ink-soft">
            {count ?? 0} contacts — work emails and personal LinkedIn profiles are labeled exactly
            as the provider returned them.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search name…"
            className="w-48"
            aria-label="Search contacts"
          />
          <Select
            name="email"
            defaultValue={params.email ?? ''}
            aria-label="Filter by email status"
            className="w-44"
          >
            <option value="">Any email status</option>
            {[
              'verified',
              'found',
              'unverified',
              'catch_all',
              'invalid',
              'unavailable',
              'not_requested',
            ].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
          <Button variant="secondary" type="submit">
            Filter
          </Button>
        </form>
      </div>

      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      <form action={addToList}>
        <input type="hidden" name="entityKind" value="contact" />
        <Card className="rise">
          {(contacts ?? []).length === 0 ? (
            <EmptyState
              title="No decision-makers yet"
              body="Enable decision-maker discovery when creating a search. Contacts appear here with honest verification states."
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
                  <Th className="w-8">
                    <span className="sr-only">Select</span>
                  </Th>
                  <Th>Name</Th>
                  <Th>Title</Th>
                  <Th>Company</Th>
                  <Th>Work email</Th>
                  <Th>Email status</Th>
                  <Th>Phone</Th>
                  <Th>Personal LinkedIn</Th>
                  <Th>Source</Th>
                  <Th>Enriched</Th>
                </tr>
              </thead>
              <tbody>
                {(contacts ?? []).map((contact) => (
                  <tr key={contact.id} className="hover:bg-canvas">
                    <Td>
                      <input
                        type="checkbox"
                        name="ids"
                        value={contact.id}
                        aria-label={`Select ${contact.full_name}`}
                        className="size-4 accent-[#2f4f7d]"
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {contact.full_name}
                      </Link>
                      {contact.is_fixture ? (
                        <span className="ml-2">
                          <FixtureBadge />
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-ink-soft">
                      {contact.job_title ?? '—'}
                      {contact.seniority ? (
                        <span className="block text-xs text-ink-faint">{contact.seniority}</span>
                      ) : null}
                    </Td>
                    <Td className="text-ink-soft">
                      {(contact.companies as { canonical_name?: string } | null)?.canonical_name ??
                        '—'}
                    </Td>
                    <Td className="max-w-[22ch] truncate text-xs">
                      {contact.work_email ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td>
                      <EmailStatusBadge status={contact.work_email_status} />
                    </Td>
                    <Td className="font-mono text-xs">
                      {contact.phone ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td className="max-w-[20ch] truncate text-xs">
                      {contact.personal_linkedin_url ? (
                        <a
                          href={contact.personal_linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {contact.personal_linkedin_url.replace('https://www.linkedin.com', '')}
                        </a>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={contact.provider === 'fixture' ? 'warn' : 'primary'}>
                        {contact.provider}
                      </Badge>
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDate(contact.last_enriched_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
          {(contacts ?? []).length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
              <span className="text-ink-soft">With selected:</span>
              <Select
                name="listId"
                aria-label="Choose a list"
                className="w-52"
                defaultValue={lists?.[0]?.id ?? '__new__'}
              >
                {(lists ?? []).map((list) => (
                  <option key={list.id} value={list.id}>
                    Add to “{list.name}”
                  </option>
                ))}
                <option value="__new__">Add to a new list…</option>
              </Select>
              <Input
                name="newListName"
                placeholder="New list name"
                className="w-44"
                aria-label="New list name"
              />
              <Button variant="secondary" type="submit">
                Add to list
              </Button>
            </div>
          ) : null}
        </Card>
      </form>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link
              className="text-primary hover:underline"
              href={`/contacts?page=${page - 1}&q=${encodeURIComponent(q)}`}
            >
              ← Prev
            </Link>
          ) : null}
          <span className="text-ink-faint">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              className="text-primary hover:underline"
              href={`/contacts?page=${page + 1}&q=${encodeURIComponent(q)}`}
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
