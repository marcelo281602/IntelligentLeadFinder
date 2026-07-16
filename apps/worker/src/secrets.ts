import { decryptSecret } from '@leadfinder/security';
import type { ProviderCredentials } from '@leadfinder/providers';
import type { Db } from './db';
import { one } from './db';

/**
 * Load and decrypt the active credential for a connection. The plaintext
 * exists only in worker memory for the duration of the provider call.
 * The fixture provider needs no credential.
 */
export async function loadCredentials(
  db: Db,
  connectionId: string | null,
  provider: string,
  masterKeyBase64: string,
): Promise<ProviderCredentials> {
  if (provider === 'fixture') return { token: 'fixture' };
  if (!connectionId) {
    throw new Error(`Run has no provider connection for ${provider}.`);
  }
  const row = await one<{ envelope: string }>(
    db,
    `select v.envelope
     from public.integration_connections c
     join public.integration_secret_versions v on v.id = c.active_secret_version_id
     where c.id = $1 and c.deleted_at is null and v.revoked_at is null`,
    [connectionId],
  );
  if (!row) throw new Error('No active credential found for the provider connection.');
  return { token: decryptSecret(row.envelope, masterKeyBase64) };
}
