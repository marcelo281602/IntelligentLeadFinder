import type { Db } from '../db';
import { auditLog } from '../ledger';
import { log } from '../logger';
import { removeExport } from '../storage';

/**
 * Retention sweep: raw provider payloads past their retention deadline are
 * deleted; expired export files are purged from storage. Runs hourly.
 */
export async function handleRetentionSweep(db: Db): Promise<void> {
  const rawResult = await db.query(
    `delete from public.provider_raw_records where retention_until < now() returning organization_id`,
  );
  if (rawResult.rows.length > 0) {
    log.info(`Retention: deleted ${rawResult.rows.length} raw provider records`);
  }

  const expired = await db.query(
    `update public.exports set status = 'purged', file_path = null
     where status = 'ready' and purge_after < now() and file_path is not null
     returning id, organization_id, file_path`,
  );
  for (const row of expired.rows) {
    if (row.file_path) await removeExport(String(row.file_path));
    await auditLog(db, {
      orgId: row.organization_id as string,
      action: 'export.purged',
      entityKind: 'export',
      entityId: row.id as string,
    });
  }
}
