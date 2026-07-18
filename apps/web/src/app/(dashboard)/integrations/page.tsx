import { hasPermission } from '@leadfinder/core';
import Link from 'next/link';
import { APPROVED_YELP_ACTOR_ID } from '@leadfinder/core';
import { ProspeoEnrichmentAdapter } from '@leadfinder/providers';
import {
  connectApify,
  connectOutscraper,
  connectProspeo,
  disconnectConnection,
  rotateCredential,
  testConnection,
} from '@/actions/integrations';
import { connectYelpApify } from '@/actions/yelp';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Field, Input, Select } from '@/components/ui';
import { DestinationsSection, type DestinationRow } from '@/components/destinations-section';

export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    connected?: string;
    tested?: string;
    rotated?: string;
    derror?: string;
    dsecret?: string;
    dname?: string;
    dtested?: string;
    dsync?: string;
    dgoauth?: string;
  }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const canManage = hasPermission(ctx.role, 'integrations:manage');
  const canDestinations = hasPermission(ctx.role, 'destinations:sync', ctx.overrides);
  const supabase = await createSupabaseServerClient();

  const [{ data: connections }, { data: flags }, { data: destinations }] = await Promise.all([
    supabase
      .from('integration_connections')
      .select(
        'id, provider, label, status, config, secret_fingerprint, last_test_at, last_test_ok, last_error, last_used_at, created_at',
      )
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .order('created_at'),
    supabase.from('feature_flags').select('key, enabled').is('organization_id', null),
    supabase
      .from('destinations')
      .select(
        'id, kind, connection_method, name, endpoint_url, google_account_email, status, auto_sync, include_contacts, synced_count, last_sync_at, last_error, secret_fingerprint',
      )
      .eq('organization_id', ctx.orgId)
      .is('deleted_at', null)
      .order('created_at'),
  ]);

  const flagEnabled = (key: string) => (flags ?? []).find((f) => f.key === key)?.enabled ?? false;
  const apifyConnections = (connections ?? []).filter((c) => c.provider === 'apify');
  const outscraperConnections = (connections ?? []).filter((c) => c.provider === 'outscraper');
  const outscraperEnabled = flagEnabled('provider_outscraper');
  const prospeoConnections = (connections ?? []).filter((c) => c.provider === 'prospeo');
  const prospeoEnabled = flagEnabled('provider_prospeo');
  const yelpConnections = (connections ?? []).filter((c) => c.provider === 'yelp_apify');
  const yelpEnabled = flagEnabled('provider_yelp_apify');
  const prospeoNotes = new ProspeoEnrichmentAdapter().capabilities().notes;
  const fixtureConnection = (connections ?? []).find((c) => c.provider === 'fixture');

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
          {params.connected === 'outscraper'
            ? 'Outscraper'
            : params.connected === 'prospeo'
              ? 'Prospeo'
              : params.connected === 'yelp'
                ? 'Yelp via Apify'
                : 'Apify'}{' '}
          connected and verified.
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
      {params.derror ? (
        <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {params.derror}
        </p>
      ) : null}
      {params.dtested ? (
        <p
          className={`rounded-md px-4 py-3 text-sm ${params.dtested === 'ok' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}
        >
          Destination test{' '}
          {params.dtested === 'ok' ? 'passed — check your sheet for a sample row' : 'failed'}.
        </p>
      ) : null}
      {params.dsync ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Sync queued — new leads will appear in your destination shortly.
        </p>
      ) : null}
      {params.dgoauth ? (
        <p className="rounded-md bg-ok-soft px-4 py-3 text-sm text-ok">
          Google Sheet connected — a new sheet was created in your Drive and future leads will sync
          to it. Click <strong>Test</strong> on it to drop in a sample row.
        </p>
      ) : null}
      {params.dsecret ? (
        <div className="rounded-md bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="font-medium">
            Destination “{params.dname}” saved. Your sync secret (shown once):
          </p>
          <code className="mono mt-1 block break-all text-xs">{params.dsecret}</code>
          <p className="mt-1 text-xs">
            It is already embedded in the Apps Script you copied. Keep it private — it authorizes
            writes to your sheet.
          </p>
        </div>
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

      {/* Outscraper */}
      {outscraperEnabled ? (
        <Card className="rise rise-2">
          <CardHeader
            overline="Google Maps business data — flat $3 per 1,000 places"
            title="Outscraper"
            action={
              outscraperConnections.length > 0 ? (
                <Badge tone="ok">Connected</Badge>
              ) : (
                <Badge tone="neutral">Not connected</Badge>
              )
            }
          />
          <div className="space-y-4 p-5">
            {outscraperConnections.map((conn) => (
              <div key={conn.id} className="rounded-md border border-line bg-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {conn.label}
                      <span className="ml-2 text-xs text-ink-faint">
                        pay-as-you-go
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
                        <p className="text-sm font-medium">Rotate API key</p>
                        <Input
                          name="token"
                          type="password"
                          placeholder="New Outscraper API key"
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
            ))}

            {canManage ? (
              <details open={outscraperConnections.length === 0}>
                <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                  {outscraperConnections.length === 0
                    ? 'Connect Outscraper'
                    : 'Add another Outscraper connection'}
                </summary>
                <form action={connectOutscraper} className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="API key"
                    htmlFor="outscraper-token"
                    hint="Outscraper → Profile → API. Stored encrypted; never displayed again."
                  >
                    <Input
                      id="outscraper-token"
                      name="token"
                      type="password"
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field label="Label" htmlFor="outscraper-label">
                    <Input id="outscraper-label" name="label" defaultValue="Default" />
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
            <p className="text-xs text-ink-faint">
              Collects business data only — pair with Apify Business Leads for decision-maker
              contacts. First 500 places each month are free on Outscraper&apos;s side.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Yelp via Apify — a SEPARATE integration record and secret from the
          Apify Google Maps card above. Disconnecting it never touches the
          Google Maps, Outscraper, or Prospeo connections. */}
      {yelpEnabled ? (
        <Card className="rise rise-2">
          <CardHeader
            overline={`Powers the Yelp Leads Scraper tab · approved Actor ${APPROVED_YELP_ACTOR_ID} · pricing verified 2026-07-18`}
            title="Yelp via Apify"
            action={
              yelpConnections.length > 0 ? (
                <Badge tone="ok">Connected</Badge>
              ) : (
                <Badge tone="neutral">Not connected</Badge>
              )
            }
          />
          <div className="space-y-4 p-5">
            {yelpConnections.map((conn) => (
              <div key={conn.id} className="rounded-md border border-line bg-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {conn.label}
                      <span className="ml-2 text-xs text-ink-faint">
                        {APPROVED_YELP_ACTOR_ID} · pay-per-event
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
                        Test token &amp; Actor access
                      </Button>
                    </form>
                  </div>
                </div>
                {canManage && conn.status !== 'disconnected' ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-primary select-none">
                      Rotate credential or disconnect Yelp only
                    </summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <form
                        action={rotateCredential}
                        className="space-y-2 rounded-md border border-line p-3"
                      >
                        <input type="hidden" name="connectionId" value={conn.id} />
                        <p className="text-sm font-medium">Rotate Apify API token</p>
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
                        <p className="text-sm font-medium">Disconnect Yelp only</p>
                        <p className="text-xs text-ink-faint">
                          Blocks new Yelp runs. Does not touch the Apify Google Maps, Outscraper,
                          or Prospeo connections; Yelp run history and provenance are kept.
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
            ))}

            {canManage ? (
              <details open={yelpConnections.length === 0}>
                <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                  {yelpConnections.length === 0
                    ? 'Connect Yelp via Apify'
                    : 'Add another Yelp connection'}
                </summary>
                <form action={connectYelpApify} className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Apify API token"
                    htmlFor="yelp-token"
                    hint="An Apify token — not a Yelp login or Yelp API key. Stored under its own encrypted secret, separate from the Google Maps card, even if you paste the same token."
                  >
                    <Input id="yelp-token" name="token" type="password" autoComplete="off" required />
                  </Field>
                  <Field label="Label" htmlFor="yelp-label">
                    <Input id="yelp-label" name="label" defaultValue="Default" />
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
            <p className="text-xs text-ink-faint">
              The Actor is fixed to {APPROVED_YELP_ACTOR_ID} by the platform — arbitrary Actor IDs
              are not accepted. Website-email enrichment stays disabled until its event price is
              verified.{' '}
              <Link href="/yelp-leads" className="text-primary hover:underline">
                Open the Yelp Leads Scraper →
              </Link>
            </p>
          </div>
        </Card>
      ) : null}

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

      {prospeoEnabled ? (
        <>
          <p className="overline">Contact enrichment</p>
          <Card className="rise rise-2">
            <CardHeader
              overline="Email finder + verifier — 1 credit per email, repeat lookups free for 90 days"
              title="Prospeo"
              action={
                prospeoConnections.length > 0 ? (
                  <Badge tone="ok">Connected</Badge>
                ) : (
                  <Badge tone="neutral">Not connected</Badge>
                )
              }
            />
            <div className="space-y-4 p-5">
              {prospeoConnections.map((conn) => {
                const config = (conn.config ?? {}) as { planTier?: string };
                return (
                  <div key={conn.id} className="rounded-md border border-line bg-raised p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {conn.label}
                          <span className="ml-2 text-xs text-ink-faint">
                            {config.planTier ?? 'basic'} plan
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
                          {conn.last_used_at
                            ? ` · last used ${formatDateTime(conn.last_used_at)}`
                            : ''}
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
                            <p className="text-sm font-medium">Rotate API key</p>
                            <Input
                              name="token"
                              type="password"
                              placeholder="New Prospeo API key"
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
                <details open={prospeoConnections.length === 0}>
                  <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                    {prospeoConnections.length === 0
                      ? 'Connect Prospeo'
                      : 'Add another Prospeo connection'}
                  </summary>
                  <form action={connectProspeo} className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="API key"
                      htmlFor="prospeo-token"
                      hint="app.prospeo.io → API. Verified via the free account endpoint; stored encrypted."
                    >
                      <Input
                        id="prospeo-token"
                        name="token"
                        type="password"
                        autoComplete="off"
                        required
                      />
                    </Field>
                    <Field label="Label" htmlFor="prospeo-label">
                      <Input id="prospeo-label" name="label" defaultValue="Default" />
                    </Field>
                    <Field
                      label="Plan tier"
                      htmlFor="prospeo-plan"
                      hint="Sets the rate card used for enrichment estimates"
                    >
                      <Select id="prospeo-plan" name="planTier" defaultValue="basic">
                        <option value="free">Free (75 credits/mo)</option>
                        <option value="basic">Basic ($39 / 1,000)</option>
                        <option value="pro">Pro ($99 / 5,000)</option>
                        <option value="business">Business ($199 / 20,000)</option>
                        <option value="corporate">Corporate ($369 / 50,000)</option>
                      </Select>
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
              <ul className="space-y-1 text-xs text-ink-faint">
                {prospeoNotes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </div>
          </Card>
        </>
      ) : null}

      <DestinationsSection
        destinations={(destinations ?? []) as DestinationRow[]}
        canManage={canDestinations}
        googleOAuthEnabled={Boolean(
          process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        )}
      />

    </div>
  );
}
