import 'server-only';
import { redactObject } from '@leadfinder/security';
import { createServiceClient } from './supabase/service';

/** Append-only audit record. Details are redacted before write. */
export async function audit(params: {
  orgId: string | null;
  actorUserId?: string | null;
  action: string;
  entityKind?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const service = createServiceClient();
  await service.from('audit_logs').insert({
    organization_id: params.orgId,
    actor_user_id: params.actorUserId ?? null,
    actor_type: 'user',
    action: params.action,
    entity_kind: params.entityKind ?? null,
    entity_id: params.entityId ?? null,
    details: redactObject(params.details ?? {}),
  });
}
