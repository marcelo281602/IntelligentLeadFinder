import Link from 'next/link';
import { addToList } from '@/actions/lists';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FixtureBadge,
  Input,
  Select,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Companies' };
const PAGE_SIZE = 25;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    source?: string;
    sort?: string;
    error?: string;
  }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const q = (params.q ?? '').trim();
  const supabase = await createSupabaseServerClient();

  // Server-validated sort allowlist; anything else falls back to recency.
  const SORTS: Record<string, { column: string; ascending: boolean; label: string }> = {
    updated: { column: 'updated_at', ascending: false, label: 'Last updated' },
    category: { column: 'primary_category', ascending: true, label: 'Category (A–Z)' },
    name: { column: 'canonical_name', ascending: true, label: 'Name (A–Z)' },
    rating: { column: 'rating', ascending: false, label: 'Rating (high first)' },
  };
  const sortKey = params.sort && params.sort in SORTS ? params.sort : 'updated';
  const sort = SORTS[sortKey]!;

  let query = supabase
    .from('companies')
    .select(
      'id, canonical_name, primary_category, city, country_code, rating, review_count, website, primary_email, primary_phone, company_linkedin_url, lead_status, is_fixture, updated_at, google_place_id, yelp_business_id, contacts(count)',
      { count: 'exact' },
    )
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null);
  if (q) query = query.ilike('canonical_name', `%${q}%`);
  if (params.status) query = query.eq('lead_status', params.status);
  // Lead-source filter: which provider namespace the record came from.
  if (params.source === 'google') query = query.not('google_place_id', 'is', null);
  if (params.source === 'yelp') query = query.not('yelp_business_id', 'is', null);

  const { data: companies, count } = await query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
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
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-ink-soft">{count ?? 0} records</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search company name…"
            className="w-56"
            aria-label="Search companies"
          />
          <Select
            name="status"
            defaultValue={params.status ?? ''}
            aria-label="Filter by lead status"
            className="w-40"
          >
            <option value="">All statuses</option>
            {['new', 'reviewing', 'qualified', 'not_a_fit', 'suppressed', 'archived'].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
          <Select
            name="source"
            defaultValue={params.source ?? ''}
            aria-label="Filter by lead source"
            className="w-44"
          >
            <option value="">All sources</option>
            <option value="google">Google Maps leads</option>
            <option value="yelp">Yelp leads</option>
          </Select>
          <Select name="sort" defaultValue={sortKey} aria-label="Sort companies" className="w-44">
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                Sort: {s.label}
              </option>
            ))}
          </Select>
          <Button variant="secondary" type="submit">
            Apply
          </Button>
        </form>
      </div>

      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      <form action={addToList}>
        <input type="hidden" name="entityKind" value="company" />
        <Card className="rise">
          {(companies ?? []).length === 0 ? (
            <EmptyState
              title={q ? 'No companies match' : 'No companies yet'}
              body={
                q
                  ? 'Try a different search.'
                  : 'Run a search in the Lead Finder to collect companies.'
              }
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
                  <Th>Company</Th>
                  <Th>Category</Th>
                  <Th>Source</Th>
                  <Th>Location</Th>
                  <Th className="text-right">Rating</Th>
                  <Th>Company email</Th>
                  <Th>Phone</Th>
                  <Th className="text-right">DMs</Th>
                  <Th>Status</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {(companies ?? []).map((company) => (
                  <tr key={company.id} className="hover:bg-canvas">
                    <Td>
                      <input
                        type="checkbox"
                        name="ids"
                        value={company.id}
                        aria-label={`Select ${company.canonical_name}`}
                        className="size-4 accent-[#2f4f7d]"
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/companies/${company.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {company.canonical_name}
                      </Link>
                      {company.is_fixture ? (
                        <span className="ml-2">
                          <FixtureBadge />
                        </span>
                      ) : null}
                      {company.website ? (
                        <p className="max-w-[24ch] truncate text-xs text-ink-faint">
                          {company.website}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-ink-soft">{company.primary_category ?? '—'}</Td>
                    <Td>
                      {company.google_place_id && company.yelp_business_id ? (
                        <Badge tone="accent">Maps + Yelp</Badge>
                      ) : company.yelp_business_id ? (
                        <Badge tone="accent">Yelp</Badge>
                      ) : company.google_place_id ? (
                        <Badge tone="neutral">Google Maps</Badge>
                      ) : (
                        <span className="text-xs text-ink-faint">—</span>
                      )}
                    </Td>
                    <Td className="text-ink-soft">
                      {[company.city, company.country_code].filter(Boolean).join(', ') || '—'}
                    </Td>
                    <Td className="text-right font-mono text-xs">
                      {company.rating != null
                        ? `${Number(company.rating).toFixed(1)} (${company.review_count ?? 0})`
                        : '—'}
                    </Td>
                    <Td className="max-w-[20ch] truncate text-xs">
                      {company.primary_email ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td className="font-mono text-xs">
                      {company.primary_phone ?? <span className="text-ink-faint">—</span>}
                    </Td>
                    <Td className="text-right font-mono">
                      {(company.contacts as unknown as Array<{ count: number }>)?.[0]?.count ?? 0}
                    </Td>
                    <Td>
                      <Badge tone={company.lead_status === 'qualified' ? 'ok' : 'neutral'}>
                        {String(company.lead_status).replaceAll('_', ' ')}
                      </Badge>
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDate(company.updated_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
          {(companies ?? []).length > 0 ? (
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
              <span className="ml-auto text-xs text-ink-faint">
                Exports are built from lists or all records on the Exports page.
              </span>
            </div>
          ) : null}
        </Card>
      </form>

      {totalPages > 1 ? (
        <nav className="flex justify-center gap-2 text-sm" aria-label="Pagination">
          {page > 1 ? (
            <Link
              className="text-primary hover:underline"
              href={`/companies?page=${page - 1}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(params.status ?? '')}&source=${encodeURIComponent(params.source ?? '')}&sort=${sortKey}`}
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
              href={`/companies?page=${page + 1}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(params.status ?? '')}&source=${encodeURIComponent(params.source ?? '')}&sort=${sortKey}`}
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
