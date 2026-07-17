import { extendTrial, setPlan } from '@/actions/admin';
import { requireSuperAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  Select,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Clients · Admin' };

function trialBadge(plan: string, trialEndsAt: string) {
  if (plan === 'suspended') return <Badge tone="danger">Suspended</Badge>;
  if (plan === 'active') return <Badge tone="ok">Active</Badge>;
  const daysLeft = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft <= 0) return <Badge tone="danger">Trial expired</Badge>;
  if (daysLeft <= 3) return <Badge tone="warn">Trial · {daysLeft}d left</Badge>;
  return <Badge tone="accent">Trial · {daysLeft}d left</Badge>;
}

export default async function AdminClientsPage() {
  await requireSuperAdmin();
  const service = createServiceClient();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { data: orgs },
    { data: memberships },
    { data: profiles },
    { data: usage },
    { data: companies },
  ] = await Promise.all([
    service
      .from('organizations')
      .select('id, name, slug, plan, trial_ends_at, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    service.from('organization_memberships').select('organization_id, user_id, role'),
    service.from('user_profiles').select('id, email'),
    service
      .from('usage_events')
      .select('organization_id, cost_micro_usd')
      .gte('occurred_at', monthStart.toISOString()),
    service.from('companies').select('organization_id').is('deleted_at', null),
  ]);

  const emailById = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string]));
  const membersByOrg = new Map<string, { count: number; ownerEmail: string | null }>();
  for (const m of memberships ?? []) {
    const entry = membersByOrg.get(m.organization_id as string) ?? { count: 0, ownerEmail: null };
    entry.count += 1;
    if (m.role === 'owner' && !entry.ownerEmail) {
      entry.ownerEmail = emailById.get(m.user_id as string) ?? null;
    }
    membersByOrg.set(m.organization_id as string, entry);
  }
  const spendByOrg = new Map<string, number>();
  for (const u of usage ?? []) {
    spendByOrg.set(
      u.organization_id as string,
      (spendByOrg.get(u.organization_id as string) ?? 0) + Number(u.cost_micro_usd ?? 0),
    );
  }
  const companiesByOrg = new Map<string, number>();
  for (const c of companies ?? []) {
    companiesByOrg.set(
      c.organization_id as string,
      (companiesByOrg.get(c.organization_id as string) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-sm text-ink-soft">
          Every workspace on the platform. New workspaces start a 14-day trial; expired trials keep
          full read access but cannot start paid provider runs until extended or activated.
        </p>
      </div>

      <Card className="rise">
        {(orgs ?? []).length === 0 ? (
          <EmptyState title="No workspaces yet" />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Workspace</Th>
                <Th>Owner</Th>
                <Th className="text-right">Members</Th>
                <Th className="text-right">Companies</Th>
                <Th className="text-right">Spend (month)</Th>
                <Th>Status</Th>
                <Th>Trial ends</Th>
                <Th>Created</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {(orgs ?? []).map((org) => {
                const members = membersByOrg.get(org.id as string);
                return (
                  <tr key={org.id} className="hover:bg-canvas">
                    <Td>
                      <span className="font-medium">{org.name}</span>
                      <code className="mono block text-xs text-ink-faint">{org.slug}</code>
                    </Td>
                    <Td className="max-w-[22ch] truncate text-xs">{members?.ownerEmail ?? '—'}</Td>
                    <Td className="text-right font-mono">{members?.count ?? 0}</Td>
                    <Td className="text-right font-mono">
                      {companiesByOrg.get(org.id as string) ?? 0}
                    </Td>
                    <Td className="text-right">
                      <Money micro={spendByOrg.get(org.id as string) ?? 0} />
                    </Td>
                    <Td>{trialBadge(org.plan as string, org.trial_ends_at as string)}</Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDate(org.trial_ends_at)}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-ink-faint">
                      {formatDate(org.created_at)}
                    </Td>
                    <Td>
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-primary select-none">
                          Manage
                        </summary>
                        <div className="mt-2 space-y-2">
                          <form action={extendTrial} className="flex items-center gap-1">
                            <input type="hidden" name="orgId" value={org.id as string} />
                            <input type="hidden" name="days" value="14" />
                            <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
                              Extend trial +14d
                            </Button>
                          </form>
                          <form action={setPlan} className="flex items-center gap-1">
                            <input type="hidden" name="orgId" value={org.id as string} />
                            <Select
                              name="plan"
                              defaultValue={org.plan as string}
                              className="w-28 py-1 text-xs"
                              aria-label="Plan"
                            >
                              <option value="trial">trial</option>
                              <option value="active">active</option>
                              <option value="suspended">suspended</option>
                            </Select>
                            <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
                              Set
                            </Button>
                          </form>
                        </div>
                      </details>
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
