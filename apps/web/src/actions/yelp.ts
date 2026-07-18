'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { APPROVED_YELP_ACTOR_ID, searchConfigSchema } from '@leadfinder/core';
import { encryptSecret, secretFingerprint } from '@leadfinder/security';
import { getMapsAdapter } from '@leadfinder/providers';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/auth';
import { estimateForConfig, loadRateCard, rateCardKeyFor } from '@/lib/estimate';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Separate Yelp-via-Apify integration (Module 7). These actions are the ONLY
 * write path for Yelp connections and Yelp runs. They are hard-bound to the
 * approved Actor and to connections whose provider is exactly 'yelp_apify' —
 * the existing Google Maps Apify connection is never read, reused, or
 * accepted as a fallback.
 */

async function yelpGates(): Promise<{ featureOn: boolean; legalOn: boolean }> {
  const service = createServiceClient();
  const { data: flags } = await service
    .from('feature_flags')
    .select('key, enabled')
    .in('key', ['provider_yelp_apify', 'yelp_legal_approved'])
    .is('organization_id', null);
  const get = (key: string) => (flags ?? []).find((f) => f.key === key)?.enabled ?? false;
  return { featureOn: get('provider_yelp_apify'), legalOn: get('yelp_legal_approved') };
}

const connectYelpSchema = z.object({
  label: z.string().trim().min(1).max(100).default('Default'),
  token: z.string().trim().min(10, 'Enter the Apify API token').max(500),
});

/**
 * Connect Yelp via Apify. Accepts an Apify API token (never a Yelp login,
 * cookie, or Yelp API key) and stores it under its OWN encrypted secret
 * reference. The Actor id is bound server-side; the form cannot supply one.
 */
export async function connectYelpApify(formData: FormData): Promise<void> {
  const ctx = await requirePermission('integrations:manage');
  enforceRateLimit(`connect:${ctx.userId}`, 10, 300_000);

  const parsed = connectYelpSchema.safeParse({
    label: formData.get('label') || 'Default',
    token: formData.get('token'),
  });
  if (!parsed.success) {
    redirect(`/integrations?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }

  const gates = await yelpGates();
  if (!gates.featureOn) {
    redirect(
      `/integrations?error=${encodeURIComponent('Yelp via Apify is not enabled for this deployment.')}`,
    );
  }

  // 1. Test before storing: token validity AND access to the approved Actor,
  //    independently of any existing Apify Google Maps connection.
  const adapter = getMapsAdapter('yelp_apify');
  const test = await adapter.testConnection({ token: parsed.data.token });
  if (!test.ok) {
    redirect(
      `/integrations?error=${encodeURIComponent(test.error ?? 'Apify rejected the token or the Yelp Actor is unavailable.')}`,
    );
  }

  // 2. Encrypt and store under a NEW secret reference (never aliased to the
  //    Google Maps connection, even when the token value is identical).
  const envelope = encryptSecret(parsed.data.token, process.env.APP_ENCRYPTION_KEY!);
  const fingerprint = secretFingerprint(parsed.data.token);
  const service = createServiceClient();

  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .insert({
      organization_id: ctx.orgId,
      provider: 'yelp_apify',
      label: parsed.data.label,
      status: 'connected',
      config: { actorId: APPROVED_YELP_ACTOR_ID, planTier: 'pay_per_event' },
      secret_fingerprint: fingerprint,
      created_by: ctx.userId,
      last_test_at: new Date().toISOString(),
      last_test_ok: true,
    })
    .select('id')
    .single();
  if (connError || !connection) {
    const message =
      connError?.code === '23505'
        ? 'A connection with that label already exists.'
        : 'Could not save the connection.';
    redirect(`/integrations?error=${encodeURIComponent(message)}`);
  }

  const { data: secret } = await service
    .from('integration_secret_versions')
    .insert({
      organization_id: ctx.orgId,
      connection_id: connection.id,
      version: 1,
      envelope,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  await service
    .from('integration_connections')
    .update({ active_secret_version_id: secret!.id })
    .eq('id', connection.id);
  await service.from('integration_health_checks').insert({
    organization_id: ctx.orgId,
    connection_id: connection.id,
    ok: true,
    latency_ms: test.latencyMs,
    detail: `Connected as ${test.accountLabel ?? 'Apify account'}`,
  });

  await audit({
    orgId: ctx.orgId,
    actorUserId: ctx.userId,
    action: 'integration.connected',
    entityKind: 'integration_connection',
    entityId: connection.id,
    details: {
      provider: 'yelp_apify',
      label: parsed.data.label,
      actorId: APPROVED_YELP_ACTOR_ID,
    },
  });
  revalidatePath('/integrations');
  revalidatePath('/yelp-leads');
  redirect('/integrations?connected=yelp');
}

const yelpSearchFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  searchTerm: z.string().trim().min(1, 'Industry or search term is required').max(200),
  countryCode: z.string().trim().length(2, 'Country is required'),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  maxResults: z.coerce.number().int().min(1).max(1000),
  connectionId: z.string().uuid('Connect Yelp via Apify first.'),
  fetchBusinessDetails: z.coerce.boolean().default(false),
  scrapeReviews: z.coerce.boolean().default(false),
  maxReviewsPerBusiness: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Create a Yelp draft run with a server-computed estimate, then send the user
 * to the standard confirmation screen (hard cap required there). Nothing is
 * paid here. The connection MUST be a yelp_apify connection owned by this
 * organization — an apify (Google Maps) connection id is rejected, never
 * silently substituted.
 */
export async function createYelpDraftAndEstimate(formData: FormData): Promise<void> {
  const ctx = await requirePermission('searches:run');
  enforceRateLimit(`estimate:${ctx.userId}`, 20, 60_000);
  const back = '/yelp-leads';

  const gates = await yelpGates();
  if (!gates.featureOn) {
    redirect(`${back}?error=${encodeURIComponent('Yelp via Apify is not enabled.')}`);
  }
  if (!gates.legalOn) {
    redirect(
      `${back}?error=${encodeURIComponent('Yelp runs are pending the legal & terms review gate.')}`,
    );
  }

  const parsed = yelpSearchFormSchema.safeParse({
    name: formData.get('name') || formData.get('searchTerm'),
    searchTerm: formData.get('searchTerm'),
    countryCode: formData.get('countryCode'),
    region: formData.get('region') || undefined,
    city: formData.get('city') || undefined,
    postalCode: formData.get('postalCode') || undefined,
    maxResults: formData.get('maxResults'),
    connectionId: formData.get('connectionId'),
    fetchBusinessDetails: formData.get('fetchBusinessDetails') === 'on',
    scrapeReviews: formData.get('scrapeReviews') === 'on',
    maxReviewsPerBusiness: formData.get('maxReviewsPerBusiness') || 10,
  });
  if (!parsed.success) {
    redirect(
      `${back}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid search')}`,
    );
  }
  const form = parsed.data;
  if (!form.city && !form.postalCode && !form.region) {
    redirect(`${back}?error=${encodeURIComponent('Add a city, region, or postal code.')}`);
  }

  // The full config passes the same trust-boundary schema as every run.
  const config = searchConfigSchema.parse({
    name: form.name,
    searchTerm: form.searchTerm,
    maxResults: form.maxResults,
    locations: [
      {
        countryCode: form.countryCode,
        region: form.region,
        city: form.city,
        postalCode: form.postalCode,
      },
    ],
    yelp: {
      fetchBusinessDetails: form.fetchBusinessDetails,
      scrapeReviews: form.scrapeReviews,
      maxReviewsPerBusiness: form.maxReviewsPerBusiness,
    },
  });

  // Yelp-only connection check: provider must be exactly 'yelp_apify'.
  const supabase = await createSupabaseServerClient();
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('id, provider, status, config')
    .eq('id', form.connectionId)
    .eq('organization_id', ctx.orgId)
    .eq('provider', 'yelp_apify')
    .is('deleted_at', null)
    .maybeSingle();
  if (!connection || connection.status !== 'connected') {
    redirect(
      `${back}?error=${encodeURIComponent('Connect Yelp via Apify first — the Google Maps Apify connection is not used for Yelp runs.')}`,
    );
  }

  const { data: policy } = await supabase
    .from('quota_policies')
    .select('max_results_per_run')
    .eq('organization_id', ctx.orgId)
    .maybeSingle();
  if (policy && config.maxResults > policy.max_results_per_run) {
    redirect(
      `${back}?error=${encodeURIComponent(`Maximum results per run is ${policy.max_results_per_run} for this workspace.`)}`,
    );
  }

  const key = rateCardKeyFor('yelp_apify', {});
  let estimate;
  let rateCardId: string | null = null;
  try {
    const loaded = await loadRateCard('yelp_apify', key.scope, key.planTier);
    estimate = estimateForConfig(config, loaded.card);
    rateCardId = loaded.id;
  } catch (error) {
    redirect(`${back}?error=${encodeURIComponent((error as Error).message)}`);
  }

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
    redirect(`${back}?error=${encodeURIComponent('Could not save the search.')}`);
  }

  const { data: run, error: runError } = await supabase
    .from('search_runs')
    .insert({
      organization_id: ctx.orgId,
      search_query_id: query.id,
      status: 'draft',
      config_snapshot: config,
      provider: 'yelp_apify',
      connection_id: connection.id,
      is_fixture: false,
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (runError || !run) {
    redirect(`${back}?error=${encodeURIComponent('Could not create the run.')}`);
  }

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
      provider: 'yelp_apify',
      actorId: APPROVED_YELP_ACTOR_ID,
      maxResults: config.maxResults,
      expectedMicroUsd: estimate.totalExpected,
    },
  });
  redirect(`/runs/${run.id}?confirm=1`);
}
