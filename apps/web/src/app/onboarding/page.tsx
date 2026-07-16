import { brand } from '@leadfinder/config';
import { createOrganization } from '@/actions/org';
import { requireUser } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const metadata = { title: 'Create your workspace' };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  return (
    <main className="header-wash flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <p className="font-display text-2xl font-bold tracking-tight text-primary">
            {brand.name}
          </p>
          <h1 className="mt-3 text-xl font-semibold">Create your workspace</h1>
          <p className="mt-1 text-sm text-ink-soft">
            One workspace per team. You can invite members and connect data providers next.
          </p>
        </div>
        <Card className="rise p-6">
          {params.error ? (
            <p
              role="alert"
              className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {params.error}
            </p>
          ) : null}
          <form action={createOrganization} className="space-y-4">
            <Field label="Organization name" htmlFor="name">
              <Input id="name" name="name" placeholder="Acme Growth Team" required minLength={2} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Default country" htmlFor="countryCode">
                <Input id="countryCode" name="countryCode" defaultValue="US" maxLength={2} />
              </Field>
              <Field label="Monthly budget (USD)" htmlFor="monthlyBudgetUsd">
                <Input
                  id="monthlyBudgetUsd"
                  name="monthlyBudgetUsd"
                  type="number"
                  min={1}
                  defaultValue={100}
                  className="money"
                />
              </Field>
              <Field label="Per-run cap (USD)" htmlFor="perRunCapUsd">
                <Input
                  id="perRunCapUsd"
                  name="perRunCapUsd"
                  type="number"
                  min={1}
                  defaultValue={25}
                  className="money"
                />
              </Field>
            </div>
            <p className="text-xs text-ink-faint">
              Budgets are hard limits: paid searches are blocked once reached, and every run sends a
              provider-enforced cost cap. You can adjust them later in Settings (raising requires
              re-authentication).
            </p>
            <label className="flex items-start gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="acknowledge" required className="mt-1" />
              <span>
                I acknowledge this workspace will be used for lawful business research only, in line
                with the acceptable-use policy and each connected provider&apos;s terms.
              </span>
            </label>
            <Button type="submit" className="w-full">
              Create workspace
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
