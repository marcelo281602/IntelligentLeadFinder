import { hasPermission } from '@leadfinder/core';
import {
  apolloCapabilities,
  outscraperCapabilities,
  prospeoCapabilities,
} from '@leadfinder/providers';
import {
  connectApify,
  disconnectConnection,
  rotateCredential,
  testConnection,
} from '@/actions/integrations';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; tested?: string; rotated?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const canManage = hasPermission(ctx.role, 'integrations:manage');
  const supabase = await createSupabaseServerClient();

  const [{ data: connections }, { data: flags }, { data: approvals }] = await Promise.all([
    supabase
      .from('integration_connections')
      .select(
        'id, provider, label, status, config, secret_fingerprint, last_test_at, last_test_ok, last_error, last_used_at, created_at',
      )
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .order('created_at'),
    supabase.from('feature_flags').select('key, enabled').is('organization_id', null),
    supabase.from('commercial_use_approvals').select('provider, approved').eq('provider', 'apollo'),
  ]);

  const flagEnabled = (key: string) => (flags ?? []).find((f) => f.key === key)?.enabled ?? false;
  const apolloApproved = (approvals ?? []).some((a) => a.approved);
  const apifyConnections = (connections ?? []).filter((c) => c.provider === 'apify');
  const fixtureConnection = (connections ?? []).find((c) => c.provider === 'fixture');

  const gatedProviders = [
    {
      name: 'Outscraper',
      category: 'Data source',
      caps: outscraperCapabilities(),
      flag: flagEnabled('provider_outscraper'),
    },
    {
      name: 'Prospeo',
      category: 'Contact enrichment',
      caps: prospeoCapabilities(),
      flag: flagEnabled('provider_prospeo'),
    },
    {
      name: 'Apollo',
      category: 'Decision-maker enrichment',
      caps: apolloCapabilities({
        commercialUseApproved: apolloApproved,
        featureFlagEnabled: flagEnabled('provider_apollo'),
      }),
      flag: flagEnabled('provider_apollo'),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-ink-soft">
          Provider credentials are entered only here, sent over HTTPS, encrypted at rest, and never
          shown again. Every workspace brings its own keys.
        </p>
      </div>

      {params.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.error}
        </p>
      ) : null}
      {params.connected ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Apify connected and verified.
        </p>
      ) : null}
      {params.rotated ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Credential rotated successfully.
        </p>
      ) : null}
      {params.tested ? (
        <p
          className={`rounded-md px-4 py-3 text-sm ${params.tested === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          Connection test {params.tested === 'ok' ? 'passed' : 'failed'}.
        </p>
      ) : null}

      <p className="overline">Data sources</p>

      {/* Apify */}
      <Card className="rise rise-1">
        <CardHeader
          overline="Google Maps business data + Business Leads enrichment"
          title="Apify"
          action={
            apifyConnections.length > 0 ? (
              <Badge tone="ok">Connected</Badge>
            ) : (
              <Badge tone="neutral">Not connected</Badge>
            )
          }
        />
        <div className="space-y-4 p-5">
          {apifyConnections.map((conn) => {
            const config = (conn.config ?? {}) as { actorId?: string; planTier?: string };
            return (
              <div key={conn.id} className="rounded-md border border-line bg-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {conn.label}
                      <span className="ml-2 text-xs text-ink-faint">
                        {config.actorId} · {config.planTier} plan
                        {conn.secret_fingerprint ? (
                          <>
                            {' '}
                            · fp <code className="mono">{conn.secret_fingerprint}</code>
                          </>
                        ) : null}
                      </span>
                    </p>
                    <p className="text-xs text-ink-faint">
                      {conn.last_test_ok ? 'Healthy' : (conn.last_error ?? 'Untested')} · last
                      tested {formatDateTime(conn.last_test_at)}
                      {conn.last_used_at ? ` · last used ${formatDateTime(conn.last_used_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        conn.status === 'connected'
                          ? 'ok'
                          : conn.status === 'error'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {conn.status}
                    </Badge>
                    <form action={testConnection}>
                      <input type="hidden" name="connectionId" value={conn.id} />
                      <Button variant="secondary" type="submit">
                        Test connection
                      </Button>
                    </form>
                  </div>
                </div>
                {canManage && conn.status !== 'disconnected' ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-primary select-none">
                      Rotate credential or disconnect
                    </summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <form
                        action={rotateCredential}
                        className="space-y-2 rounded-md border border-line p-3"
                      >
                        <input type="hidden" name="connectionId" value={conn.id} />
                        <p className="text-sm font-medium">Rotate API token</p>
                        <Input
                          name="token"
                          type="password"
                          placeholder="New Apify API token"
                          autoComplete="off"
                          required
                        />
                        <Input
                          name="confirmPassword"
                          type="password"
                          placeholder="Your account password"
                          autoComplete="current-password"
                          required
                        />
                        <Button variant="secondary" type="submit">
                          Rotate
                        </Button>
                      </form>
                      <form
                        action={disconnectConnection}
                        className="space-y-2 rounded-md border border-line p-3"
                      >
                        <input type="hidden" name="connectionId" value={conn.id} />
                        <p className="text-sm font-medium">Disconnect</p>
                        <p className="text-xs text-ink-faint">
                          Revokes the stored credential. Run history and provenance are kept.
                        </p>
                        <Input
                          name="confirmPassword"
                          type="password"
                          placeholder="Your account password"
                          autoComplete="current-password"
                          required
                        />
                        <Button variant="danger" type="submit">
                          Disconnect
                        </Button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}

          {canManage ? (
            <details open={apifyConnections.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                {apifyConnections.length === 0 ? 'Connect Apify' : 'Add another Apify connection'}
              </summary>
              <form action={connectApify} className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field
                  label="API token"
                  htmlFor="apify-token"
                  hint="Apify Console → Settings → API tokens. Stored encrypted; never displayed again."
                >
                  <Input
                    id="apify-token"
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </Field>
                <Field label="Label" htmlFor="apify-label">
                  <Input id="apify-label" name="label" defaultValue="Default" />
                </Field>
                <Field
                  label="Plan tier"
                  htmlFor="apify-plan"
                  hint="Sets the rate card used for estimates"
                >
                  <Select id="apify-plan" name="planTier" defaultValue="starter">
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="scale">Scale</option>
                    <option value="business">Business</option>
                  </Select>
                </Field>
                <Field label="Actor" htmlFor="apify-actor" hint="Maintained Google Maps actor">
                  <Input
                    id="apify-actor"
                    name="actorId"
                    defaultValue="compass/crawler-google-places"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit">Test &amp; connect</Button>
                </div>
              </form>
            </details>
          ) : (
            <p className="text-xs text-ink-faint">
              Only owners and admins can manage provider credentials.
            </p>
          )}
        </div>
      </Card>

      {/* Fixture */}
      <Card className="rise rise-2">
        <CardHeader
          overline="Deterministic test data — zero cost"
          title="Fixture provider"
          action={
            fixtureConnection ? (
              <Badge tone="ok">Connected</Badge>
            ) : (
              <Badge tone="neutral">Unavailable</Badge>
            )
          }
        />
        <p className="px-5 pb-5 text-sm text-ink-soft">
          Runs the entire pipeline (queue → ingest → dedupe → export) on clearly-flagged test data.
          Records are always labeled <Badge tone="warn">Test data</Badge> and never mixed with real
          provider results.
        </p>
      </Card>

      <p className="overline">Planned providers</p>
      <div className="grid gap-4 md:grid-cols-3">
        {gatedProviders.map((provider, i) => (
          <Card key={provider.name} className={`rise rise-${Math.min(i + 2, 4)} p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{provider.name}</h2>
              <Badge tone={provider.flag ? 'accent' : 'neutral'}>
                {provider.flag ? 'Flagged on' : 'Not available'}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">{provider.category}</p>
            <ul className="mt-3 space-y-1 text-xs text-ink-soft">
              {provider.caps.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="text-xs text-ink-faint">
        Apollo remains disabled for all workspaces until a documented commercial-use approval exists
        — its public plans do not permit powering an external product, and bring-your-own-key does
        not change that.
      </p>
    </div>
  );
}
