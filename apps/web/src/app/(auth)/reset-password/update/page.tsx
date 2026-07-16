import { updatePassword } from '@/actions/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const metadata = { title: 'Choose a new password' };

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card className="rise p-6">
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      {params.error ? (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      <form action={updatePassword} className="space-y-4">
        <Field label="New password" htmlFor="password" hint="At least 8 characters">
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
          Update password
        </Button>
      </form>
    </Card>
  );
}
