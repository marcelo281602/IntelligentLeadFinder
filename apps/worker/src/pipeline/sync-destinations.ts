import {
  buildDestinationPayload,
  type DestinationKind,
  type DestinationLead,
} from '@leadfinder/core';
import { decryptSecret } from '@leadfinder/security';
import { deliverToDestination } from '@leadfinder/providers';
import type { Db } from '../db';
import { one } from '../db';
import { auditLog, notify } from '../ledger';
import { log } from '../logger';
import type { Job } from '../queue';

const MAX_LEADS_PER_SYNC = 1000;

interface DestinationRow {
  id: string;
  organization_id: string;
  kind: DestinationKind;
  name: string;
  endpoint_url: string;
  secret_envelope: string;
  include_contacts: boolean;
  status: string;
  created_by: string;
}

/**
 * Push a workspace's new accepted leads to a destination (Google Sheet or
 * webhook). Idempotent per record: a company/contact already recorded in
 * destination_deliveries for this destination is never sent again, so the
 * client's sheet never gets duplicate rows even across re-runs. When the job
 * carries a run id it syncs that run's leads; otherwise it syncs every
 * not-yet-delivered accepted company in the workspace ("Sync now").
 */
export async function handleSyncDestination(db: Db, job: Job, masterKey: string): Promise<void> {
  const destinationId = job.payload.destinationId as string | undefined;
  if (!destinationId) return;
  const runId = (job.payload.runId as string | undefined) ?? job.run_id ?? null;

  const dest = await one<DestinationRow>(
    db,
    `select id, organization_id, kind, name, endpoint_url, secret_envelope, include_contacts, status, created_by
     from public.destinations where id = $1 and deleted_at is null`,
    [destinationId],
  );
  if (!dest || dest.status === 'disconnected') {
    log.warn('sync_destination skipped: destination missing or disconnected', { destinationId });
    return;
  }

  // Accepted companies for this run (or the whole workspace) that have not yet
  // been delivered to this destination.
  const runFilter = runId ? 'and cs.run_id = $3' : '';
  const params: unknown[] = [dest.id, dest.organization_id];
  if (runId) params.push(runId);

  const { rows: companies } = await db.query(
    `select distinct c.id, c.canonical_name, c.primary_category, c.website, c.primary_email,
            c.primary_phone, c.company_linkedin_url, c.full_address, c.city, c.country_code,
            c.rating, c.review_count, c.google_maps_url, c.google_place_id, c.created_at
     from public.companies c
     ${runId ? 'join public.company_sources cs on cs.company_id = c.id' : ''}
     where c.organization_id = $2
       and c.deleted_at is null
       ${runFilter}
       and not exists (
         select 1 from public.destination_deliveries d
         where d.destination_id = $1 and d.entity_kind = 'company' and d.entity_id = c.id
       )
     order by c.created_at asc
     limit ${MAX_LEADS_PER_SYNC}`,
    params,
  );

  if (companies.length === 0) {
    await db.query(
      `update public.destinations set last_sync_at = now(), last_error = null where id = $1`,
      [dest.id],
    );
    return;
  }

  // Primary decision-maker per company (first by creation) when requested.
  const contactByCompany = new Map<string, Record<string, unknown>>();
  if (dest.include_contacts) {
    const ids = companies.map((c) => c.id as string);
    const { rows: contacts } = await db.query(
      `select distinct on (company_id) company_id, full_name, job_title, work_email,
              work_email_status, phone, personal_linkedin_url
       from public.contacts
       where organization_id = $1 and company_id = any($2) and deleted_at is null
       order by company_id, created_at asc`,
      [dest.organization_id, ids],
    );
    for (const contact of contacts) contactByCompany.set(contact.company_id as string, contact);
  }

  const leads: DestinationLead[] = companies.map((c) => {
    const contact = contactByCompany.get(c.id as string);
    return {
      companyName: String(c.canonical_name ?? ''),
      category: (c.primary_category as string) ?? null,
      website: (c.website as string) ?? null,
      companyEmail: (c.primary_email as string) ?? null,
      companyPhone: (c.primary_phone as string) ?? null,
      companyLinkedin: (c.company_linkedin_url as string) ?? null,
      address: (c.full_address as string) ?? null,
      city: (c.city as string) ?? null,
      country: (c.country_code as string) ?? null,
      rating: c.rating !== null && c.rating !== undefined ? Number(c.rating) : null,
      reviews:
        c.review_count !== null && c.review_count !== undefined ? Number(c.review_count) : null,
      mapsUrl: (c.google_maps_url as string) ?? null,
      placeId: (c.google_place_id as string) ?? null,
      source: 'leadfinder',
      contactName: (contact?.full_name as string) ?? null,
      contactTitle: (contact?.job_title as string) ?? null,
      contactWorkEmail: (contact?.work_email as string) ?? null,
      contactEmailStatus: (contact?.work_email_status as string) ?? null,
      contactPhone: (contact?.phone as string) ?? null,
      contactPersonalLinkedin: (contact?.personal_linkedin_url as string) ?? null,
      collectedAt: c.created_at ? new Date(c.created_at as string).toISOString() : null,
    };
  });

  const secret = decryptSecret(dest.secret_envelope, masterKey);
  const payload = buildDestinationPayload({
    destinationName: dest.name,
    secret,
    runId,
    kind: dest.kind,
    includeContacts: dest.include_contacts,
    leads,
  });

  const result = await deliverToDestination({ endpointUrl: dest.endpoint_url, secret, payload });
  if (!result.ok) {
    await db.query(
      `update public.destinations set status = 'error', last_error = $2 where id = $1`,
      [dest.id, result.error ?? 'Delivery failed'],
    );
    throw new Error(result.error ?? 'Destination delivery failed');
  }

  // Record deliveries so these leads are never re-sent. Whole-batch atomicity:
  // deliveries are only written after a 2xx from the destination.
  for (const c of companies) {
    await db.query(
      `insert into public.destination_deliveries (organization_id, destination_id, entity_kind, entity_id, run_id)
       values ($1, $2, 'company', $3, $4)
       on conflict (destination_id, entity_kind, entity_id) do nothing`,
      [dest.organization_id, dest.id, c.id, runId],
    );
  }
  await db.query(
    `update public.destinations set status = 'connected', last_sync_at = now(), last_error = null,
       synced_count = synced_count + $2 where id = $1`,
    [dest.id, companies.length],
  );

  await auditLog(db, {
    orgId: dest.organization_id,
    action: 'destination.synced',
    entityKind: 'destination',
    entityId: dest.id,
    details: { count: companies.length, runId, kind: dest.kind },
  });
  await notify(db, {
    orgId: dest.organization_id,
    userId: dest.created_by,
    type: 'destination.synced',
    title: `${companies.length} lead(s) synced to ${dest.name}`,
    body: `Your ${dest.kind === 'google_sheets' ? 'Google Sheet' : 'destination'} now has the latest leads.`,
    href: '/integrations',
  });
  log.info('Destination synced', { destinationId: dest.id, count: companies.length, runId });
}
