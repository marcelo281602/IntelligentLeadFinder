import Link from 'next/link';
import { createList } from '@/actions/lists';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Lists' };

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: lists } = await supabase
    .from('lists')
    .select('id, name, description, created_at, list_companies(count), list_contacts(count)')
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Lists</h1>
      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="rise rise-1">
          {(lists ?? []).length === 0 ? (
            <EmptyState
              title="No lists yet"
              body="Create a list here, or select companies/contacts and add them to a new list directly."
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>List</Th>
                  <Th className="text-right">Companies</Th>
                  <Th className="text-right">Contacts</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {(lists ?? []).map((list) => (
                  <tr key={list.id} className="hover:bg-canvas">
                    <Td>
                      <Link
                        href={`/lists/${list.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {list.name}
                      </Link>
                      {list.description ? (
                        <p className="text-xs text-ink-faint">{list.description}</p>
                      ) : null}
                    </Td>
                    <Td className="text-right font-mono">
                      {(list.list_companies as unknown as Array<{ count: number }>)?.[0]?.count ??
                        0}
                    </Td>
                    <Td className="text-right font-mono">
                      {(list.list_contacts as unknown as Array<{ count: number }>)?.[0]?.count ?? 0}
                    </Td>
                    <Td className="text-xs text-ink-faint">{formatDate(list.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>

        <Card className="rise rise-2 h-fit">
          <CardHeader overline="New" title="Create a list" />
          <form action={createList} className="space-y-3 p-5">
            <Field label="Name" htmlFor="list-name">
              <Input
                id="list-name"
                name="name"
                required
                maxLength={200}
                placeholder="Q3 outreach candidates"
              />
            </Field>
            <Field label="Description" htmlFor="list-desc" hint="Optional">
              <Input id="list-desc" name="description" maxLength={500} />
            </Field>
            <Button type="submit" className="w-full">
              Create list
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
