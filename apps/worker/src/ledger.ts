import { redactObject } from '@leadfinder/security';
import type { Db } from './db';

/** Idempotent usage-ledger write: retries can never double-charge. */
export async function recordUsage(
  db: Db,
  params: {
    orgId: string;
    runId?: string | null;
    exportId?: string | null;
    userId?: string | null;
    provider?: string | null;
    feature: string;
    quantity: number;
    unit?: string;
    costMicroUsd?: number;
    idempotencyKey: string;
  },
): Promise<boolean> {
  const { rows } = await db.query(
    `insert into public.usage_events
       (organization_id, run_id, export_id, user_id, provider, feature, quantity, unit, cost_micro_usd, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      params.orgId,
      params.runId ?? null,
      params.exportId ?? null,
      params.userId ?? null,
      params.provider ?? null,
      params.feature,
      params.quantity,
      params.unit ?? 'unit',
      params.costMicroUsd ?? 0,
      params.idempotencyKey,
    ],
  );
  return rows.length > 0;
}

/** Append-only audit record (details are redacted before write). */
export async function auditLog(
  db: Db,
  params: {
    orgId: string | null;
    actorUserId?: string | null;
    actorType?: 'user' | 'system' | 'worker' | 'super_admin';
    action: string;
    entityKind?: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `insert into public.audit_logs (organization_id, actor_user_id, actor_type, action, entity_kind, entity_id, details)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.orgId,
      params.actorUserId ?? null,
      params.actorType ?? 'worker',
      params.action,
      params.entityKind ?? null,
      params.entityId ?? null,
      JSON.stringify(redactObject(params.details ?? {})),
    ],
  );
}

export async function notify(
  db: Db,
  params: {
    orgId: string;
    userId?: string | null;
    type: string;
    title: string;
    body?: string;
    href?: string;
  },
): Promise<void> {
  await db.query(
    `insert into public.notifications (organization_id, user_id, notification_type, title, body, href)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      params.orgId,
      params.userId ?? null,
      params.type,
      params.title,
      params.body ?? null,
      params.href ?? null,
    ],
  );
}
