import { hasPermission, microToUsd } from '@leadfinder/core';
import { updateOrgSettings, updateQuotas } from '@/actions/org';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Button, Card, CardHeader, EmptyState, Field, Input } from '@/components/ui';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const canManage = hasPermission(ctx.role, 'org:manage');
  const canLimits = hasPermission(ctx.role, 'limits:manage');
  const supabase = await createSupabaseServerClient();

  const [{ data: org }, { data: policy }] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, slug, default_country_code, data_retention_days, raw_payload_retention_days')
      .eq('id', ctx.orgId)
      .single(),
    supabase
      .from('quota_policies')
      .select(
        'monthly_budget_micro_usd, per_run_cap_micro_usd, warn_at_percent, max_results_per_run',
      )
      .eq('organization_id', ctx.orgId)
      .maybeSingle(),
  ]);

  if (!canManage && !canLimits) {
    return (
      <Card className="mx-auto max-w-2xl">
        <EmptyState
          title="Settings restricted"
          body="Only owners and admins can change workspace settings."
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      {params.saved ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">Settings saved.</p>
      ) : null}

      {canManage ? (
        <Card className="rise rise-1">
          <CardHeader overline="Workspace" title="Organization" />
          <form action={updateOrgSettings} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="org-name">
              <Input id="org-name" name="name" defaultValue={org?.name ?? ''} required />
            </Field>
            <Field label="Default country (ISO-2)" htmlFor="org-country">
              <Input
                id="org-country"
                name="defaultCountryCode"
                defaultValue={org?.default_country_code ?? 'US'}
                maxLength={2}
              />
            </Field>
            <Field
              label="Data retention (days)"
              htmlFor="org-retention"
              hint={`Normalized records kept ${org?.data_retention_days ?? 365} days; raw provider payloads only ${org?.raw_payload_retention_days ?? 30} days.`}
            >
              <Input
                id="org-retention"
                name="dataRetentionDays"
                type="number"
                min={30}
                max={3650}
                defaultValue={org?.data_retention_days ?? 365}
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Save organization</Button>
            </div>
          </form>
        </Card>
      ) : null}

      {canLimits ? (
        <Card className="rise rise-2">
          <CardHeader overline="Cost controls" title="Budgets & caps" />
          <form action={updateQuotas} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field
              label="Monthly budget (USD)"
              htmlFor="q-month"
              hint="Paid runs are blocked once reached"
            >
              <Input
                id="q-month"
                name="monthlyBudgetUsd"
                type="number"
                min={1}
                step="1"
                className="money"
                defaultValue={
                  policy?.monthly_budget_micro_usd
                    ? microToUsd(Number(policy.monthly_budget_micro_usd))
                    : 100
                }
              />
            </Field>
            <Field
              label="Per-run cap (USD)"
              htmlFor="q-run"
              hint="Upper bound for any single run's hard cap"
            >
              <Input
                id="q-run"
                name="perRunCapUsd"
                type="number"
                min={1}
                step="1"
                className="money"
                defaultValue={
                  policy?.per_run_cap_micro_usd
                    ? microToUsd(Number(policy.per_run_cap_micro_usd))
                    : 25
                }
              />
            </Field>
            <Field label="Warn at (% of budget)" htmlFor="q-warn">
              <Input
                id="q-warn"
                name="warnAtPercent"
                type="number"
                min={1}
                max={100}
                defaultValue={policy?.warn_at_percent ?? 80}
              />
            </Field>
            <Field label="Your password" htmlFor="q-pass" hint="Required only when raising limits">
              <Input
                id="q-pass"
                name="confirmPassword"
                type="password"
                autoComplete="current-password"
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Save limits</Button>
              <p className="mt-2 text-xs text-ink-faint">
                Lowering limits applies immediately. Raising them requires re-authentication and is
                written to the audit trail. Running jobs keep the cap they were approved with.
              </p>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
