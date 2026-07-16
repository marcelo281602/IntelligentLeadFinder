import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import {
  Badge,
  Card,
  CardHeader,
  EmailStatusBadge,
  FixtureBadge,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Company' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words">
        {children ?? <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!company) notFound();

  const [
    { data: contacts },
    { data: sources },
    { data: emails },
    { data: phones },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from('contacts')
      .select(
        'id, full_name, job_title, work_email, work_email_status, phone, personal_linkedin_url, company_linkedin_url',
      )
      .eq('company_id', id)
      .is('deleted_at', null),
    supabase
      .from('company_sources')
      .select('provider, provider_record_id, retrieved_at, run_id, permitted_use')
      .eq('company_id', id)
      .order('retrieved_at', { ascending: false }),
    supabase.from('company_emails').select('email, status, is_primary').eq('company_id', id),
    supabase
      .from('company_phones')
      .select('phone, phone_e164, phone_type, is_primary')
      .eq('company_id', id),
    supabase.from('list_companies').select('list_id, lists(name)').eq('company_id', id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-primary hover:underline">
          ← Companies
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{company.canonical_name}</h1>
          {company.is_fixture ? <FixtureBadge /> : null}
          <Badge tone="neutral">{String(company.lead_status).replaceAll('_', ' ')}</Badge>
        </div>
        <p className="text-sm text-ink-soft">
          {[company.primary_category, company.city, company.region, company.country_code]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rise rise-1">
          <CardHeader overline="Company" title="Profile" />
          <dl className="divide-y divide-line px-5 py-2">
            <Row label="Website">
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.website}
                </a>
              ) : null}
            </Row>
            <Row label="Company email">
              {(emails ?? []).length > 0 ? (
                <ul className="space-y-1">
                  {(emails ?? []).map((e) => (
                    <li key={e.email} className="flex items-center gap-2">
                      <span>{e.email}</span> <EmailStatusBadge status={e.status} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </Row>
            <Row label="Company phone">
              {(phones ?? []).length > 0 ? (
                <ul className="space-y-0.5">
                  {(phones ?? []).map((p) => (
                    <li key={p.phone} className="font-mono text-xs">
                      {p.phone}{' '}
                      {p.phone_e164 && p.phone_e164 !== p.phone ? `(${p.phone_e164})` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Row>
            <Row label="Company LinkedIn">
              {company.company_linkedin_url ? (
                <a
                  href={company.company_linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.company_linkedin_url}
                </a>
              ) : null}
            </Row>
            <Row label="Address">{company.full_address}</Row>
            <Row label="Rating">
              {company.rating != null
                ? `${Number(company.rating).toFixed(1)} · ${company.review_count ?? 0} reviews`
                : null}
            </Row>
            <Row label="Business status">{company.business_status}</Row>
            <Row label="Google Maps">
              {company.google_maps_url ? (
                <a
                  href={company.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open place page
                </a>
              ) : null}
            </Row>
            <Row label="Place ID">
              <code className="mono text-xs">{company.google_place_id}</code>
            </Row>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card className="rise rise-2">
            <CardHeader overline="Provenance" title="Sources & freshness" />
            <ul className="divide-y divide-line px-5 py-2 text-sm">
              {(sources ?? []).map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span>
                    <Badge tone={s.provider === 'fixture' ? 'warn' : 'primary'}>{s.provider}</Badge>
                    <span className="ml-2 text-xs text-ink-faint">{s.permitted_use}</span>
                  </span>
                  <span className="text-xs text-ink-faint">
                    {formatDateTime(s.retrieved_at)}
                    {s.run_id ? (
                      <Link
                        href={`/runs/${s.run_id}`}
                        className="ml-2 text-primary hover:underline"
                      >
                        run →
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
              {(sources ?? []).length === 0 ? (
                <li className="py-2 text-ink-faint">No source records.</li>
              ) : null}
            </ul>
          </Card>

          <Card className="rise rise-3">
            <CardHeader overline="Organization" title="Lists" />
            <div className="px-5 py-3 text-sm">
              {(memberships ?? []).length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {(memberships ?? []).map((m) => (
                    <li key={m.list_id}>
                      <Link href={`/lists/${m.list_id}`}>
                        <Badge tone="accent">
                          {(m.lists as { name?: string } | null)?.name ?? 'List'}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-faint">
                  Not on any list yet — select it on the Companies page.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="rise rise-4">
        <CardHeader overline="Decision makers" title={`Contacts (${(contacts ?? []).length})`} />
        {(contacts ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-faint">
            No decision-makers found for this company. Enable decision-maker discovery in a search
            to request them — missing data stays missing, it is never invented.
          </p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Title</Th>
                <Th>Work email</Th>
                <Th>Email status</Th>
                <Th>Phone</Th>
                <Th>Personal LinkedIn</Th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-canvas">
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
                  <Td className="font-mono text-xs">
                    {c.phone ?? <span className="text-ink-faint">—</span>}
                  </Td>
                  <Td className="max-w-[26ch] truncate text-xs">
                    {c.personal_linkedin_url ? (
                      <a
                        href={c.personal_linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {c.personal_linkedin_url.replace('https://www.linkedin.com', '')}
                      </a>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
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
