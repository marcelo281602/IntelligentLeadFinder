import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { redactObject } from '@leadfinder/security';
import { createServiceClient } from '@/lib/supabase/service';
import { checkRateLimit } from '@/lib/rate-limit';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Apify run-callback inbox. Webhooks are untrusted input:
 *  1. the high-entropy path token is matched by hash against exactly one run;
 *  2. the payload is size-limited, schema-light-validated, and redacted;
 *  3. delivery is idempotent via a dedupe key (replay-safe);
 *  4. processing only nudges the poller — authoritative state always comes
 *     from the Apify API, never from the webhook body.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 20 || token.length > 200) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`webhook:${ip}`, 60, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const service = createServiceClient();
  const { data: run } = await service
    .from('search_runs')
    .select('id, organization_id, connection_id, provider_run_id')
    .eq('callback_token_hash', tokenHash)
    .maybeSingle();
  // Unknown token: acknowledge with 404 without revealing anything.
  if (!run) return NextResponse.json({ ok: false }, { status: 404 });

  const eventType = String((payload as { eventType?: string }).eventType ?? 'unknown');
  const resource = (payload as { resource?: { id?: string } }).resource;
  const providerRunId = resource?.id ?? null;

  // The callback must reference the run id we started — otherwise ignore.
  if (run.provider_run_id && providerRunId && run.provider_run_id !== providerRunId) {
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  // Persist first (idempotent), process later.
  const dedupeKey = createHash('sha256')
    .update(`${run.id}:${eventType}:${providerRunId ?? ''}:${raw.slice(0, 512)}`)
    .digest('hex');
  const { error } = await service.from('provider_webhook_inbox').insert({
    provider: 'apify',
    organization_id: run.organization_id,
    connection_id: run.connection_id,
    run_id: run.id,
    provider_run_id: providerRunId,
    event_type: eventType,
    payload: redactObject(payload),
    dedupe_key: dedupeKey,
    signature_ok: true, // token-authenticated; Apify does not sign ad-hoc webhooks
  });
  if (error && error.code !== '23505') {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Nudge the poller: make the pending ingest job eligible immediately.
  await service
    .from('provider_jobs')
    .update({ run_after: new Date().toISOString() })
    .eq('run_id', run.id)
    .eq('kind', 'ingest_dataset')
    .eq('status', 'pending');

  return NextResponse.json({ ok: true });
}
