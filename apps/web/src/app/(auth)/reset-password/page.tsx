import Link from 'next/link';
import { requestPasswordReset } from '@/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card className="rise p-6">
      <h1 className="mb-4 text-lg font-semibold">Reset password</h1>
      {params.sent ? (
        <p className="mb-4 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
          If an account exists for that address, a reset link is on its way.
        </p>
      ) : null}
      {params.error ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      <form action={requestPasswordReset} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/sign-in" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
