import { columnsForKind } from '@leadfinder/core';
import { createExport } from '@/actions/exports';
import { requirePermission } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, Button, Card, CardHeader, Field, Select } from '@/components/ui';

export const metadata = { title: 'New export' };

export default async function NewExportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kind?: string; listId?: string }>;
}) {
  const ctx = await requirePermission('exports:create');
  const params = await searchParams;
  const kind = params.kind === 'contacts' ? 'contacts' : 'companies';
  const supabase = await createSupabaseServerClient();

  const [{ data: lists }, { count: companyCount }, { count: contactCount }] = await Promise.all([
    supabase
      .from('lists')
      .select('id, name')
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null),
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null),
  ]);

  const columns = columnsForKind(kind);
  const hasPersonal = columns.some((c) => c.personalData);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New export</h1>
        <p className="text-sm text-ink-soft">
          Choose the records and columns; the file is generated in the background with
          spreadsheet-injection protection and an expiring download link.
        </p>
      </div>
      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <a
          href="/exports/new?kind=companies"
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${kind === 'companies' ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink-soft hover:text-primary'}`}
        >
          Companies ({companyCount ?? 0})
        </a>
        <a
          href="/exports/new?kind=contacts"
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${kind === 'contacts' ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink-soft hover:text-primary'}`}
        >
          Decision makers ({contactCount ?? 0})
        </a>
      </div>

      <form action={createExport}>
        <input type="hidden" name="kind" value={kind} />
        <Card className="rise">
          <CardHeader overline="Step 1" title="Scope & format" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Records" htmlFor="exp-list">
              <Select id="exp-list" name="listId" defaultValue={params.listId ?? ''}>
                <option value="">
                  All {kind === 'companies' ? 'companies' : 'decision makers'}
                </option>
                {(lists ?? []).map((list) => (
                  <option key={list.id} value={list.id}>
                    List: {list.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" htmlFor="exp-format">
              <Select id="exp-format" name="format" defaultValue="csv">
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX (Excel)</option>
              </Select>
            </Field>
            {kind === 'contacts' ? (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="verifiedOnly" className="size-4 accent-[#2f4f7d]" />
                Verified work emails only
              </label>
            ) : null}
          </div>

          <CardHeader overline="Step 2" title="Columns" />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {columns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="columns"
                  value={col.key}
                  defaultChecked={col.defaultSelected}
                  className="size-4 accent-[#2f4f7d]"
                />
                {col.label}
                {col.personalData ? <Badge tone="warn">personal</Badge> : null}
              </label>
            ))}
          </div>

          <div className="space-y-3 border-t border-line p-5">
            {hasPersonal ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="confirmPersonalData"
                  className="mt-0.5 size-4 accent-[#2f4f7d]"
                />
                <span>
                  <strong>Personal-data acknowledgement.</strong> This export can contain personal
                  data (names, work emails, phones, LinkedIn profiles). I confirm a lawful basis for
                  this export and will handle the file according to our privacy policy. The export
                  is logged in the audit trail.
                </span>
              </label>
            ) : null}
            <Button type="submit">Confirm &amp; generate export</Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
