import 'server-only';
import type { JobKind } from '@leadfinder/core';
import { createServiceClient } from './supabase/service';

/** Enqueue a durable worker job (idempotent when a key is provided). */
export async function enqueueJob(params: {
  kind: JobKind;
  orgId?: string | null;
  runId?: string | null;
  exportId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from('provider_jobs').insert({
    kind: params.kind,
    organization_id: params.orgId ?? null,
    run_id: params.runId ?? null,
    export_id: params.exportId ?? null,
    payload: params.payload ?? {},
    idempotency_key: params.idempotencyKey ?? null,
  });
  // 23505 = duplicate idempotency key: the job already exists, which is fine.
  if (error && error.code !== '23505') {
    throw new Error(`Failed to enqueue ${params.kind} job: ${error.message}`);
  }
}
