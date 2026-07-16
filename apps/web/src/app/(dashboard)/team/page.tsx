import { hasPermission, invitableRoles } from '@leadfinder/core';
import { changeMemberRole, inviteMember, removeMember } from '@/actions/team';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  TableShell,
  Td,
  Th,
} from '@/components/ui';

export const metadata = { title: 'Team' };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; inviteToken?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const canManage = hasPermission(ctx.role, 'members:manage');
  const canInvite = hasPermission(ctx.role, 'members:invite');
  const roles = invitableRoles(ctx.role);
  const supabase = await createSupabaseServerClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('id, role, can_export, created_at, user_id, user_profiles(email, full_name)')
      .eq('organization_id', ctx.orgId)
      .order('created_at'),
    supabase
      .from('invitations')
      .select('id, email, role, expires_at, accepted_at, created_at')
      .eq('organization_id', ctx.orgId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Team</h1>
      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      {params.inviteToken ? (
        <div className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          <p className="font-medium">Invitation created — share this link (shown once):</p>
          <code className="mono mt-1 block break-all text-xs">
            {appUrl}/invite?token={params.inviteToken}
          </code>
          <p className="mt-1 text-xs">
            Email delivery is not configured in this environment, so send the link yourself. It
            expires in 7 days and only works for the invited email address.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="rise rise-1">
          <CardHeader overline="Members" title={`${(members ?? []).length} member(s)`} />
          <TableShell>
            <thead>
              <tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Export</Th>
                <Th>Joined</Th>
                {canManage ? (
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((member) => {
                const profile = member.user_profiles as {
                  email?: string;
                  full_name?: string;
                } | null;
                const isSelf = member.user_id === ctx.userId;
                return (
                  <tr key={member.id} className="hover:bg-canvas">
                    <Td>
                      <span className="font-medium">
                        {profile?.full_name ?? profile?.email ?? 'Member'}
                      </span>
                      {isSelf ? <Badge tone="accent">you</Badge> : null}
                      <p className="text-xs text-ink-faint">{profile?.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={member.role === 'owner' ? 'primary' : 'neutral'}>
                        {member.role}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {member.role === 'researcher'
                        ? member.can_export
                          ? 'granted'
                          : 'not granted'
                        : 'by role'}
                    </Td>
                    <Td className="text-xs text-ink-faint">{formatDate(member.created_at)}</Td>
                    {canManage ? (
                      <Td>
                        {member.role !== 'owner' && !isSelf ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-primary select-none">
                              Manage
                            </summary>
                            <div className="mt-2 space-y-2">
                              <form
                                action={changeMemberRole}
                                className="flex flex-wrap items-center gap-2"
                              >
                                <input type="hidden" name="membershipId" value={member.id} />
                                <Select
                                  name="role"
                                  defaultValue={member.role}
                                  className="w-32 text-xs"
                                  aria-label="Role"
                                >
                                  {roles
                                    .filter((r) => r !== 'owner')
                                    .map((r) => (
                                      <option key={r} value={r}>
                                        {r}
                                      </option>
                                    ))}
                                </Select>
                                <label className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    name="canExport"
                                    defaultChecked={member.can_export}
                                    className="size-3.5"
                                  />
                                  export grant
                                </label>
                                <Button
                                  variant="secondary"
                                  type="submit"
                                  className="px-2 py-1 text-xs"
                                >
                                  Save
                                </Button>
                              </form>
                              <form action={removeMember}>
                                <input type="hidden" name="membershipId" value={member.id} />
                                <Button
                                  variant="danger"
                                  type="submit"
                                  className="px-2 py-1 text-xs"
                                >
                                  Remove
                                </Button>
                              </form>
                            </div>
                          </details>
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Card>

        <div className="space-y-6">
          {canInvite ? (
            <Card className="rise rise-2 h-fit">
              <CardHeader overline="Invite" title="Add a member" />
              <form action={inviteMember} className="space-y-3 p-5">
                <Field label="Email" htmlFor="invite-email">
                  <Input id="invite-email" name="email" type="email" required />
                </Field>
                <Field label="Role" htmlFor="invite-role">
                  <Select id="invite-role" name="role" defaultValue="researcher">
                    {roles
                      .filter((r) => r !== 'owner')
                      .map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Button type="submit" className="w-full">
                  Create invitation
                </Button>
              </form>
            </Card>
          ) : null}

          {(invitations ?? []).length > 0 ? (
            <Card className="rise rise-3">
              <CardHeader overline="Pending" title="Open invitations" />
              <ul className="divide-y divide-line px-5 py-2 text-sm">
                {(invitations ?? []).map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between py-2">
                    <span>
                      {invite.email}
                      <Badge tone="neutral">{invite.role}</Badge>
                    </span>
                    <span className="text-xs text-ink-faint">
                      expires {formatDate(invite.expires_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {(members ?? []).length <= 1 && (invitations ?? []).length === 0 ? (
            <Card className="rise rise-4">
              <EmptyState
                title="Just you so far"
                body="Invite teammates with the right role — every permission is enforced server-side."
              />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
