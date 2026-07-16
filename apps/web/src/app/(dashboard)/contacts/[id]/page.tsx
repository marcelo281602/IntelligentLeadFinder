import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Card, CardHeader, EmailStatusBadge, FixtureBadge } from '@/components/ui';

export const metadata = { title: 'Decision maker' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words">
        {children ?? <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  );
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*, companies(id, canonical_name)')
    .eq('id', id)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!contact) notFound();

  const { data: sources } = await supabase
    .from('contact_sources')
    .select('provider, retrieved_at, run_id')
    .eq('contact_id', id)
    .order('retrieved_at', { ascending: false });

  const company = contact.companies as { id: string; canonical_name: string } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/contacts" className="text-sm text-primary hover:underline">
          ← Decision Makers
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{contact.full_name}</h1>
          {contact.is_fixture ? <FixtureBadge /> : null}
        </div>
        <p className="text-sm text-ink-soft">
          {[contact.job_title, contact.seniority, contact.department].filter(Boolean).join(' · ')}
        </p>
      </div>

      <Card className="rise rise-1">
        <CardHeader overline="Contact" title="Details" />
        <dl className="divide-y divide-line px-5 py-2">
          <Row label="Company">
            {company ? (
              <Link href={`/companies/${company.id}`} className="text-primary hover:underline">
                {company.canonical_name}
              </Link>
            ) : null}
          </Row>
          <Row label="Work email">
            {contact.work_email ? (
              <span className="flex flex-wrap items-center gap-2">
                {contact.work_email} <EmailStatusBadge status={contact.work_email_status} />
                {contact.email_verified_at ? (
                  <span className="text-xs text-ink-faint">
                    verified {formatDateTime(contact.email_verified_at)}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-ink-faint">—</span>
                <EmailStatusBadge status={contact.work_email_status} />
              </span>
            )}
          </Row>
          <Row label="Phone">
            {contact.phone ? (
              <span className="font-mono text-sm">
                {contact.phone} <Badge tone="neutral">{contact.phone_type}</Badge>
              </span>
            ) : null}
          </Row>
          <Row label="Personal LinkedIn">
            {contact.personal_linkedin_url ? (
              <a
                href={contact.personal_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {contact.personal_linkedin_url}
              </a>
            ) : null}
          </Row>
          <Row label="Company LinkedIn">
            {contact.company_linkedin_url ? (
              <a
                href={contact.company_linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {contact.company_linkedin_url}
              </a>
            ) : null}
          </Row>
          <Row label="Location">{contact.person_location}</Row>
          <Row label="Provider">
            <Badge tone={contact.provider === 'fixture' ? 'warn' : 'primary'}>
              {contact.provider}
            </Badge>
            {contact.provider_person_id ? (
              <code className="mono ml-2 text-xs">{contact.provider_person_id}</code>
            ) : null}
          </Row>
          <Row label="Last enriched">{formatDateTime(contact.last_enriched_at)}</Row>
        </dl>
      </Card>

      <Card className="rise rise-2">
        <CardHeader overline="Provenance" title="Sources" />
        <ul className="divide-y divide-line px-5 py-2 text-sm">
          {(sources ?? []).map((s, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <Badge tone={s.provider === 'fixture' ? 'warn' : 'primary'}>{s.provider}</Badge>
              <span className="text-xs text-ink-faint">
                {formatDateTime(s.retrieved_at)}
                {s.run_id ? (
                  <Link href={`/runs/${s.run_id}`} className="ml-2 text-primary hover:underline">
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
    </div>
  );
}
