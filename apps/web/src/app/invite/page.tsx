import Link from 'next/link';
import { brand } from '@leadfinder/config';
import { acceptInvitation } from '@/actions/team';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button, Card } from '@/components/ui';

export const metadata = { title: 'Invitation' };

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="header-wash flex min-h-dvh items-center justify-center px-4">
      <Card className="rise w-full max-w-sm p-6 text-center">
        <p className="font-display text-xl font-bold text-primary">{brand.name}</p>
        <h1 className="mt-3 text-lg font-semibold">Team invitation</h1>
        {!params.token ? (
          <p className="mt-2 text-sm text-ink-soft">This invitation link is malformed.</p>
        ) : !user ? (
          <>
            <p className="mt-2 text-sm text-ink-soft">
              Sign in (or create an account) with the invited email address, then reopen this link.
            </p>
            <Link
              href={`/sign-in?next=${encodeURIComponent(`/invite?token=${params.token}`)}`}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Sign in to continue
            </Link>
          </>
        ) : (
          <form action={acceptInvitation} className="mt-4">
            <input type="hidden" name="token" value={params.token} />
            <p className="mb-3 text-sm text-ink-soft">
              Accept the invitation as <strong>{user.email}</strong>?
            </p>
            <Button type="submit" className="w-full">
              Accept invitation
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
