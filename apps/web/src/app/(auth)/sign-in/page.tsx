import Link from 'next/link';
import { signIn } from '@/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card className="rise p-6">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      {params.error ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={params.next ?? '/'} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <Link href="/reset-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        <Link href="/sign-up" className="text-primary hover:underline">
          Create account
        </Link>
      </div>
    </Card>
  );
}
