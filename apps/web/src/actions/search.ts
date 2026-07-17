'use server';

import { randomUUID, createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  canTransition,
  searchConfigSchema,
  validateHardCap,
  usdToMicro,
  ACTIVE_RUN_STATUSES,
  type RunStatus,
} from '@leadfinder/core';
import { generateToken } from '@leadfinder/security';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { estimateForConfig, getBudgetStatus, loadRateCard } from '@/lib/estimate';
import { enqueueJob } from '@/lib/jobs';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Step 1 — create a draft run with a server-computed estimate and move it to
 * awaiting_confirmation. No provider call happens here and nothing is paid.
 */
export async function createDraftAndEstimate(formData: FormData): Promise<void> {
  const ctx = await requirePermission('searches:run');
  enforceRateLimit(`estimate:${ctx.userId}`, 20, 60_000);

  const rawConfig = formData.get('config');
  let configJson: unknown;
  try {
    configJson = JSON.parse(String(rawConfig));
  } catch {
    redirect(`/lead-finder?error=${encodeURIComponent('Invalid search configuration.')}`);
  }
  const parsed = searchConfigSchema.safeParse(configJson);
  if (!parsed.success) {
    redirect(
      `/lead-finder?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid search')}`,
    );
  }
  const config = parsed.data;

  const connectionId = z.string().uuid().safeParse(formData.get('connectionId'));
  if (!connectionId.success) {
    redirect(`/lead-finder?error=${encodeURIComponent('Choose a connected data provider.')}`);
  }

  // Connection must belong to this org (RLS enforces; explicit filter too).
  const supabase = await createSupabaseServerClient();
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id, provider, status, config')
    .eq('id', connectionId.data)
    .eq('organization_id', ctx.orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!connection || connection.status !== 'connected') {
    redirect(`/lead-finder?error=${encodeURIComponent('That provider is not connected.')}`);
  }

  // Quota: respect max results per run.
  const { data: policy } = await supabase
    .from('quota_policies')
    .select('max_results_per_run')
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (policy && config.maxResults > policy.max_results_per_run) {
    redirect(
      `/lead-finder?error=${encodeURIComponent(`Maximum results per run is ${policy.max_results_per_run} for this workspace.`)}`,
    );
  }

  const connConfig = (connection.config ?? {}) as { actorId?: string; planTier?: string };
  const scope = connConfig.actorId ?? 'compass/crawler-google-places';
  const planTier = connConfig.planTier ?? 'starter';

  let estimate;
  let rateCardId: string | null = null;
  try {
    const loaded = await loadRateCard(connection.provider, scope, planTier);
    estimate = estimateForConfig(config, loaded.card);
    rateCardId = loaded.id;
  } catch (error) {
    redirect(`/lead-finder?error=${encodeURIComponent((error as Error).message)}`);
  }

  // Draft insert runs under the user's RLS policies.
  const { data: query, error: queryError } = await supabase
    .from('search_queries')
    .insert({
      organization_id: ctx.orgId,
      name: config.name,
      config,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (queryError || !query) {
    redirect(`/lead-finder?error=${encodeURIComponent('Could not save the search.')}`);
  }

  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .insert({
      organization_id: ctx.orgId,
      search_query_id: query.id,
      status: 'draft',
      config_snapshot: config,
      provider: connection.provider,
      connection_id: connection.id,
      is_fixture: connection.provider === 'fixture',
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (runError || !run) {
    redirect(`/lead-finder?error=${encodeURIComponent('Could not create the run.')}`);
  }

  // State transitions are service-side so caps and the machine can't be bypassed.
  const service = createServiceClient();
  await service
    .from('search_runs')
    .update({
      status: 'awaiting_confirmation',
      rate_card_id: rateCardId,
      estimate: estimate as unknown as Record<string, unknown>,
      estimate_low_micro_usd: estimate.totalLow,
      estimate_expected_micro_usd: estimate.totalExpected,
      estimate_high_micro_usd: estimate.totalHigh,
      current_stage: 'awaiting_confirmation',
    })
    .eq('id', run.id)
    .eq('status', 'draft');

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'search.estimated',
    entityKind: 'search_run',
    entityId: run.id,
    details: {
      provider: connection.provider,
      maxResults: config.maxResults,
      expectedMicroUsd: estimate.totalExpected,
    },
  });
  redirect(`/runs/${run.id}?confirm=1`);
}

/**
 * Step 2 — explicit confirmation with a hard provider cost cap.
 * The run may never start without it. Idempotent against double-submits.
 */
export async function confirmRun(formData: FormData): Promise<void> {
  const ctx = await requirePermission('searches:run');
  const runId = z.string().uuid().safeParse(formData.get('runId'));
  const capUsd = z.coerce.number().positive().safeParse(formData.get('capUsd'));
  if (!runId.success || !capUsd.success) {
    redirect('/runs');
  }
  const back = `/runs/${runId.data}`;
  enforceRateLimit(`confirm:${ctx.userId}`, 10, 60_000);

  const supabase = await createSupabaseServerClient();
  const { data: run } = await supabase
    .from('search_runs')
    .select('id, status, estimate, provider, is_fixture, organization_id')
    .eq('id', runId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!run) redirect('/runs');
  if (run.status !== 'awaiting_confirmation') {
    redirect(`${back}?error=${encodeURIComponent('This run is not awaiting confirmation.')}`);
  }

  // Trial/plan gate: expired trials and suspended workspaces cannot start
  // paid provider runs. Fixture (test) runs stay available.
  if (!run.is_fixture) {
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, trial_ends_at')
      .eq('id', ctx.orgId)
      .maybeSingle();
    if (org?.plan === 'suspended') {
      redirect(
        `${back}?error=${encodeURIComponent('This workspace is suspended — contact support.')}`,
      );
    }
    if (org?.plan === 'trial' && new Date(org.trial_ends_at as string) < new Date()) {
      redirect(
        `${back}?error=${encodeURIComponent('Your 14-day trial has ended. Paid runs are paused — contact support to activate the workspace. Test (fixture) runs still work.')}`,
      );
    }
  }

  const requestedCap = usdToMicro(capUsd.data);
  const budget = await getBudgetStatus(ctx.orgId);
  const estimate = run.estimate as {
    totalLow: number;
    totalExpected: number;
    totalHigh: number;
  } | null;
  if (!estimate) {
    redirect(`${back}?error=${encodeURIComponent('Missing estimate — recreate the search.')}`);
  }

  const validation = validateHardCap({
    requestedCapMicroUsd: requestedCap,
    estimate: estimate as never,
    orgPerRunCapMicroUsd: budget.perRunCapMicroUsd,
    orgRemainingMonthlyBudgetMicroUsd: run.is_fixture ? null : budget.remainingMicroUsd,
  });
  if (!validation.ok) {
    redirect(`${back}?error=${encodeURIComponent(validation.reason)}`);
  }

  // Callback token: high-entropy secret in the URL path, only its hash stored.
  const callbackToken = generateToken(32);
  const callbackTokenHash = createHash('sha256').update(callbackToken).digest('hex');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const callbackUrl =
    run.provider === 'apify' ? `${appUrl}/api/webhooks/apify/${callbackToken}` : null;

  // Guarded transition: only one confirm can win this update.
  const service = createServiceClient();
  const { data: updated } = await service
    .from('search_runs')
    .update({
      status: 'queued',
      hard_cap_micro_usd: requestedCap,
      confirmed_by: ctx.userId,
      confirmed_at: new Date().toISOString(),
      idempotency_key: randomUUID(),
      callback_token_hash: callbackTokenHash,
      current_stage: 'queued',
    })
    .eq('id', run.id)
    .eq('status', 'awaiting_confirmation')
    .select('id')
    .maybeSingle();
  if (!updated) {
    redirect(`${back}?error=${encodeURIComponent('Run was already confirmed.')}`);
  }

  await enqueueJob({
    kind: 'run_search',
    orgId: ctx.orgId,
    runId: run.id,
    idempotencyKey: `start:${run.id}`,
    payload: callbackUrl ? { callbackUrl } : {},
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'search.confirmed',
    entityKind: 'search_run',
    entityId: run.id,
    details: { hardCapMicroUsd: requestedCap, provider: run.provider },
  });
  revalidatePath(back);
  redirect(back);
}

export async function cancelRun(formData: FormData): Promise<void> {
  const ctx = await requirePermission('searches:run');
  const runId = z.string().uuid().safeParse(formData.get('runId'));
  if (!runId.success) redirect('/runs');

  const supabase = await createSupabaseServerClient();
  const { data: run } = await supabase
    .from('search_runs')
    .select('id, status')
    .eq('id', runId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!run) redirect('/runs');

  const status = run.status as RunStatus;
  if (!ACTIVE_RUN_STATUSES.includes(status) || !canTransition(status, 'cancellation_requested')) {
    redirect(`/runs/${run.id}?error=${encodeURIComponent('This run can no longer be cancelled.')}`);
  }

  const service = createServiceClient();
  await service
    .from('search_runs')
    .update({ status: 'cancellation_requested' })
    .eq('id', run.id)
    .in('status', [...ACTIVE_RUN_STATUSES]);

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'search.cancellation_requested',
    entityKind: 'search_run',
    entityId: run.id,
  });
  revalidatePath(`/runs/${run.id}`);
  redirect(`/runs/${run.id}`);
}

/** Retry a failed or partially completed run from its checkpoint. */
export async function retryRun(formData: FormData): Promise<void> {
  const ctx = await requirePermission('searches:run');
  const runId = z.string().uuid().safeParse(formData.get('runId'));
  if (!runId.success) redirect('/runs');

  const supabase = await createSupabaseServerClient();
  const { data: run } = await supabase
    .from('search_runs')
    .select('id, status, provider_run_id')
    .eq('id', runId.data)
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (!run) redirect('/runs');
  if (!canTransition(run.status as RunStatus, 'queued')) {
    redirect(`/runs/${run.id}?error=${encodeURIComponent('This run cannot be retried.')}`);
  }

  const service = createServiceClient();
  await service
    .from('search_runs')
    .update({ status: 'queued', error_summary: null, current_stage: 'queued' })
    .eq('id', run.id)
    .in('status', ['failed', 'partially_completed']);

  await enqueueJob({
    kind: 'run_search',
    orgId: ctx.orgId,
    runId: run.id,
    idempotencyKey: `retry:${run.id}:${Date.now()}`,
  });
  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'search.retried',
    entityKind: 'search_run',
    entityId: run.id,
  });
  revalidatePath(`/runs/${run.id}`);
  redirect(`/runs/${run.id}`);
}
