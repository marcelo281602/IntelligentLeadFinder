import Link from 'next/link';
import { signUp } from '@/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const metadata = { title: 'Create account' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;
  if (params.sent) {
    return (
      <Card className="rise p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold">Check your inbox</h1>
        <p className="text-sm text-ink-soft">
          We sent a verification link to your email address. Verify it, then sign in.
        </p>
        <Link href="/sign-in" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </Card>
    );
  }
  return (
    <Card className="rise p-6">
      <h1 className="mb-4 text-lg font-semibold">Create your account</h1>
      {params.error ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      <form action={signUp} className="space-y-4">
        <Field label="Full name" htmlFor="fullName">
          <Input id="fullName" name="fullName" autoComplete="name" required />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink-soft">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
