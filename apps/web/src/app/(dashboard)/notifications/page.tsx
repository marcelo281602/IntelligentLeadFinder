import Link from 'next/link';
import { markAllNotificationsRead } from '@/actions/notifications';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Button, Card, EmptyState, cx } from '@/components/ui';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const ctx = await requireOrg();
  const supabase = await createSupabaseServerClient();
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, notification_type, title, body, href, read_at, created_at')
    .eq('organization_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <form action={markAllNotificationsRead}>
          <Button variant="secondary" type="submit">
            Mark all read
          </Button>
        </form>
      </div>
      <Card className="rise">
        {(notifications ?? []).length === 0 ? (
          <EmptyState
            title="Nothing yet"
            body="Run completions, cost warnings, and export links show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {(notifications ?? []).map((n) => (
              <li key={n.id} className={cx('px-5 py-3', !n.read_at && 'bg-primary-soft/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {!n.read_at ? (
                        <span
                          aria-hidden
                          className="mr-1.5 inline-block size-1.5 rounded-full bg-accent-ink align-middle"
                        />
                      ) : null}
                      {n.title}
                    </p>
                    {n.body ? <p className="text-sm text-ink-soft">{n.body}</p> : null}
                    {n.href ? (
                      <Link
                        href={n.href}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View →
                      </Link>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {formatDateTime(n.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
