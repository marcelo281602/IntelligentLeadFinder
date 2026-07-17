'use client';

import { useMemo, useState } from 'react';
import { DESTINATION_KINDS, DESTINATION_LABELS, type DestinationKind } from '@leadfinder/core';
import {
  createDestination,
  disconnectDestination,
  syncDestinationNow,
  testDestination,
  toggleAutoSync,
} from '@/actions/destinations';
import { Badge, Button, Card, Field, Input, Select, cx } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export interface DestinationRow {
  id: string;
  kind: DestinationKind;
  name: string;
  endpoint_url: string;
  status: string;
  auto_sync: boolean;
  include_contacts: boolean;
  synced_count: number;
  last_sync_at: string | null;
  last_error: string | null;
  secret_fingerprint: string;
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function appsScript(secret: string): string {
  return `// LeadFinder → Google Sheets. Paste into Extensions → Apps Script,
// then Deploy → New deployment → Web app (Execute as: Me,
// Who has access: Anyone). Copy the Web app URL back into LeadFinder.
const LEADFINDER_SECRET = '${secret}';

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== LEADFINDER_SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Leads') || ss.insertSheet('Leads');
  if (sheet.getLastRow() === 0 && body.columns) sheet.appendRow(body.columns);
  (body.rows || []).forEach(function (row) { sheet.appendRow(row); });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, appended: (body.rows || []).length }))
    .setMimeType(ContentService.MimeType.JSON);
}`;
}

export function DestinationsSection({
  destinations,
  canManage,
}: {
  destinations: DestinationRow[];
  canManage: boolean;
}) {
  const [kind, setKind] = useState<DestinationKind>('google_sheets');
  const [copied, setCopied] = useState(false);
  const secret = useMemo(() => randomSecret(), []);
  const script = useMemo(() => appsScript(secret), [secret]);

  return (
    <div className="space-y-4">
      <div>
        <p className="overline">Destinations · the client&apos;s live database</p>
        <p className="text-sm text-ink-soft">
          Send every new lead straight to a Google Sheet or webhook. With auto-sync on, completed
          searches append their new leads automatically — deduplicated, so a lead is never added
          twice.
        </p>
      </div>

      {destinations.length > 0 ? (
        <div className="space-y-3">
          {destinations.map((dest) => (
            <Card key={dest.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {dest.name}
                    <span className="ml-2 text-xs text-ink-faint">
                      {DESTINATION_LABELS[dest.kind]}
                    </span>
                  </p>
                  <p className="max-w-[46ch] truncate text-xs text-ink-faint">
                    {dest.endpoint_url}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    {dest.synced_count} lead(s) synced
                    {dest.last_sync_at
                      ? ` · last ${formatDateTime(dest.last_sync_at)}`
                      : ' · never synced'}
                    {dest.include_contacts ? ' · includes decision-makers' : ''}
                  </p>
                  {dest.last_error ? (
                    <p className="mt-1 text-xs text-danger">{dest.last_error}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={dest.auto_sync ? 'ok' : 'neutral'}>
                    Auto-sync {dest.auto_sync ? 'on' : 'off'}
                  </Badge>
                  <Badge
                    tone={
                      dest.status === 'connected'
                        ? 'ok'
                        : dest.status === 'error'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {dest.status}
                  </Badge>
                </div>
              </div>
              {canManage ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={testDestination}>
                    <input type="hidden" name="destinationId" value={dest.id} />
                    <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
                      Test
                    </Button>
                  </form>
                  <form action={syncDestinationNow}>
                    <input type="hidden" name="destinationId" value={dest.id} />
                    <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">
                      Sync now
                    </Button>
                  </form>
                  <form action={toggleAutoSync}>
                    <input type="hidden" name="destinationId" value={dest.id} />
                    {dest.auto_sync ? null : <input type="hidden" name="autoSync" value="on" />}
                    <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">
                      {dest.auto_sync ? 'Turn auto-sync off' : 'Turn auto-sync on'}
                    </Button>
                  </form>
                  <form action={disconnectDestination}>
                    <input type="hidden" name="destinationId" value={dest.id} />
                    <Button variant="danger" type="submit" className="px-2 py-1 text-xs">
                      Disconnect
                    </Button>
                  </form>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <Card>
          <details>
            <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-primary select-none">
              + Add a destination (Google Sheets or webhook)
            </summary>
            <div className="space-y-4 border-t border-line p-5">
              <Field label="Destination type" htmlFor="dest-kind">
                <Select
                  id="dest-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as DestinationKind)}
                >
                  {DESTINATION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {DESTINATION_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>

              {kind === 'google_sheets' ? (
                <div className="rounded-md border border-line bg-raised p-4 text-sm">
                  <p className="font-medium">Set up your Google Sheet (one time)</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-soft">
                    <li>
                      Open a Google Sheet → <strong>Extensions → Apps Script</strong>.
                    </li>
                    <li>
                      Delete any code, paste the script below (your secret is already in it), and{' '}
                      <strong>Save</strong>.
                    </li>
                    <li>
                      <strong>Deploy → New deployment → Web app</strong> · Execute as <em>Me</em> ·
                      Access <em>Anyone</em>.
                    </li>
                    <li>
                      Copy the <strong>Web app URL</strong> and paste it below.
                    </li>
                  </ol>
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <span className="overline">Apps Script</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(script).then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          });
                        }}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {copied ? 'Copied ✓' : 'Copy script'}
                      </button>
                    </div>
                    <pre className="mt-1 max-h-52 overflow-auto rounded-md bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink">
                      {script}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="rounded-md bg-accent-soft px-3 py-2 text-xs text-accent-ink">
                  We POST JSON <code className="mono">{'{ columns, rows, secret }'}</code> to your
                  URL and sign the body with <code className="mono">X-LeadFinder-Signature</code>.
                  Point it at your {DESTINATION_LABELS[kind]} webhook trigger.
                </p>
              )}

              <form action={createDestination} className="space-y-4">
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="secret" value={secret} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" htmlFor="dest-name">
                    <Input
                      id="dest-name"
                      name="name"
                      placeholder="Client leads sheet"
                      required
                      maxLength={120}
                    />
                  </Field>
                  <Field
                    label={kind === 'google_sheets' ? 'Web app URL' : 'Webhook URL'}
                    htmlFor="dest-url"
                    hint="HTTPS only"
                  >
                    <Input
                      id="dest-url"
                      name="endpointUrl"
                      type="url"
                      placeholder="https://script.google.com/macros/s/…/exec"
                      required
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="autoSync"
                      defaultChecked
                      className="size-4 accent-[#2f4f7d]"
                    />
                    Auto-sync new leads when a search completes
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="includeContacts"
                      className="size-4 accent-[#2f4f7d]"
                    />
                    Include decision-maker columns
                  </label>
                </div>
                <div className={cx('flex items-center gap-3')}>
                  <Button type="submit">Save destination</Button>
                  <span className="text-xs text-ink-faint">
                    Tip: click <strong>Test</strong> afterwards to drop one sample row into the
                    sheet.
                  </span>
                </div>
              </form>
            </div>
          </details>
        </Card>
      ) : (
        <p className="text-xs text-ink-faint">
          Ask an owner, admin, or operations member to connect a destination.
        </p>
      )}
    </div>
  );
}
