import {
  companyDedupeKeys,
  contactDedupeKeys,
  normalizeCompanyName,
  normalizeEmail,
  normalizePhone,
  normalizeLinkedInUrl,
  rootDomain,
  searchConfigSchema,
  type SearchConfig,
} from '@leadfinder/core';
import { getMapsAdapter, type MappedCompany, type MappedContact } from '@leadfinder/providers';
import type { ProviderKind } from '@leadfinder/core';
import type { Db } from '../db';
import { one } from '../db';
import { auditLog } from '../ledger';
import { log } from '../logger';
import type { Job } from '../queue';
import { enqueueJob, heartbeatJob } from '../queue';
import {
  bumpCounts,
  finishStage,
  getRun,
  saveCheckpoint,
  transitionRun,
  type RunRow,
} from '../runs';

const BATCH = 50;

/**
 * Stage 3 — normalize raw provider records into companies/contacts with
 * deterministic dedupe. Resumable via checkpoint.rawCursor. Weak (priority
 * 4–5) matches become review candidates, never automatic merges.
 */
export async function handleNormalize(db: Db, job: Job): Promise<void> {
  const run = await getRun(db, job.run_id!);
  if (!run) throw new Error(`Run ${job.run_id} not found`);
  if (run.status !== 'normalizing') {
    log.warn('normalize skipped: unexpected status', { runId: run.id, status: run.status });
    return;
  }

  const config = searchConfigSchema.parse(run.config_snapshot);
  const adapter = getMapsAdapter(run.provider as ProviderKind);
  const suppression = await loadSuppression(db, run.organization_id);

  // Process in dataset order (ordinal) so merge outcomes are deterministic.
  let cursor = Number(run.checkpoint.rawCursor ?? -1);
  for (;;) {
    const { rows } = await db.query(
      `select id, ordinal, payload, retrieved_at from public.provider_raw_records
       where run_id = $1 and ordinal > $2
       order by ordinal asc
       limit ${BATCH}`,
      [run.id, cursor],
    );
    if (rows.length === 0) break;

    for (const raw of rows) {
      const mapped = adapter.mapItem(raw.payload, {
        verificationRequested: config.decisionMakers.verifyWorkEmail,
      });
      if (!mapped) {
        await bumpCounts(db, run.id, { rejected_count: 1 });
        continue;
      }
      const { company } = mapped;

      if (!passesPostFilters(company, config) || isSuppressed(company, suppression)) {
        await bumpCounts(db, run.id, { rejected_count: 1 });
        continue;
      }

      const companyId = await upsertCompany(db, run, raw.id as string, company);
      const dmEnabled = config.decisionMakers.enabled;
      for (const contact of company.contacts.slice(
        0,
        dmEnabled ? config.decisionMakers.maxContactsPerCompany : 0,
      )) {
        await upsertContact(db, run, companyId, contact);
      }
    }

    cursor = Number(rows[rows.length - 1]!.ordinal);
    await saveCheckpoint(db, run.id, { rawCursor: cursor });
    await heartbeatJob(db, job.id);
  }

  await transitionRun(db, run, 'deduplicating');
  await finishStage(db, run.id, 'normalizing', 'succeeded');
  // Deterministic dedupe already ran inline via key tables; the deduplicating
  // stage records completion for observability.
  await transitionRun(db, run, config.decisionMakers.enabled ? 'enriching' : 'export_ready');
  await finishStage(db, run.id, 'deduplicating', 'succeeded');
  if (config.decisionMakers.enabled) {
    await transitionRun(db, run, 'export_ready');
    await finishStage(db, run.id, 'enriching', 'succeeded');
  }
  await auditLog(db, {
    orgId: run.organization_id,
    action: 'run.normalized',
    entityKind: 'search_run',
    entityId: run.id,
  });
  await enqueueJob(db, {
    kind: 'reconcile_costs',
    orgId: run.organization_id,
    runId: run.id,
    idempotencyKey: `reconcile:${run.id}`,
    runAfterMs: run.is_fixture ? 100 : 30_000,
  });
}

interface Suppression {
  domains: Set<string>;
  emails: Set<string>;
  names: Set<string>;
}

async function loadSuppression(db: Db, orgId: string): Promise<Suppression> {
  const { rows } = await db.query(
    `select kind, value from public.suppression_entries where organization_id = $1`,
    [orgId],
  );
  const suppression: Suppression = { domains: new Set(), emails: new Set(), names: new Set() };
  for (const row of rows) {
    const value = String(row.value).toLowerCase();
    if (row.kind === 'domain') suppression.domains.add(value);
    if (row.kind === 'email') suppression.emails.add(value);
    if (row.kind === 'company_name') suppression.names.add(normalizeCompanyName(value));
  }
  return suppression;
}

function isSuppressed(company: MappedCompany, suppression: Suppression): boolean {
  const domain = company.website ? rootDomain(company.website) : null;
  if (domain && suppression.domains.has(domain)) return true;
  if (suppression.names.has(normalizeCompanyName(company.canonicalName))) return true;
  return company.companyEmails.some((email) => {
    const normalized = normalizeEmail(email);
    return normalized !== null && suppression.emails.has(normalized);
  });
}

/** Local (free) post-filters that the provider does not apply server-side. */
function passesPostFilters(company: MappedCompany, config: SearchConfig): boolean {
  const filters = config.filters;
  if (filters.requirePhone && !company.primaryPhone) return false;
  if (filters.requireCompanyEmail && company.companyEmails.length === 0) return false;
  if (filters.minReviewCount !== undefined && (company.reviewCount ?? 0) < filters.minReviewCount)
    return false;
  if (
    filters.maxReviewCount !== undefined &&
    company.reviewCount !== null &&
    company.reviewCount > filters.maxReviewCount
  )
    return false;
  if (filters.excludePermanentlyClosed && company.permanentlyClosed) return false;
  if (filters.excludeTemporarilyClosed && company.temporarilyClosed) return false;
  if (filters.excludeKeywords.length > 0) {
    const haystack = `${company.canonicalName} ${company.primaryCategory ?? ''}`.toLowerCase();
    if (filters.excludeKeywords.some((kw) => haystack.includes(kw.toLowerCase()))) return false;
  }
  const categories = [company.primaryCategory, ...company.categories]
    .filter((c): c is string => Boolean(c))
    .map((c) => c.toLowerCase());
  if (filters.excludeCategories.length > 0) {
    const exact = new Set(categories);
    if (filters.excludeCategories.some((c) => exact.has(c.toLowerCase()))) return false;
  }
  // Include-categories is a free local filter (never sent to the provider —
  // the actor's category field has a restricted vocabulary). Substring match
  // keeps "Plumber" matching "Emergency plumber".
  if (filters.includeCategories.length > 0) {
    const wanted = filters.includeCategories.map((c) => c.toLowerCase());
    const matches = categories.some((category) =>
      wanted.some((w) => category.includes(w) || w.includes(category)),
    );
    if (!matches) return false;
  }
  return true;
}

async function upsertCompany(
  db: Db,
  run: RunRow,
  rawRecordId: string,
  company: MappedCompany,
): Promise<string> {
  const domain = company.website ? rootDomain(company.website) : null;
  const phoneNorm = company.primaryPhone
    ? normalizePhone(company.primaryPhone, company.countryCode)
    : null;
  const companyLi = company.companyLinkedinUrl
    ? normalizeLinkedInUrl(company.companyLinkedinUrl)
    : null;

  const keys = companyDedupeKeys({
    provider: run.provider,
    providerPlaceId: company.googlePlaceId,
    website: company.website,
    phone: company.primaryPhone,
    countryCode: company.countryCode,
    name: company.canonicalName,
    fullAddress: company.fullAddress,
    city: company.city,
    region: company.region,
    postalCode: company.postalCode,
  });
  const autoKeys = keys.filter((k) => k.action === 'auto');
  const reviewKeys = keys.filter((k) => k.action === 'review');

  let companyId: string | null = null;
  if (autoKeys.length > 0) {
    const existing = await one<{ company_id: string }>(
      db,
      `select company_id from public.company_dedupe_keys
       where organization_id = $1 and key = any($2)
       order by priority asc limit 1`,
      [run.organization_id, autoKeys.map((k) => k.key)],
    );
    companyId = existing?.company_id ?? null;
  }

  if (companyId) {
    // Merge: fill missing fields only; never touch human-edited fields;
    // sources are preserved regardless.
    await db.query(
      `update public.companies set
         website = case when website is null and not ('website' = any(human_edited_fields)) then $2 else website end,
         root_domain = coalesce(root_domain, $3),
         primary_email = case when primary_email is null and not ('primary_email' = any(human_edited_fields)) then $4 else primary_email end,
         primary_phone = case when primary_phone is null and not ('primary_phone' = any(human_edited_fields)) then $5 else primary_phone end,
         primary_phone_e164 = coalesce(primary_phone_e164, $6),
         company_linkedin_url = case when company_linkedin_url is null and not ('company_linkedin_url' = any(human_edited_fields)) then $7 else company_linkedin_url end,
         rating = coalesce(rating, $8),
         review_count = coalesce(review_count, $9),
         full_address = coalesce(full_address, $10),
         source_freshness = greatest(coalesce(source_freshness, 'epoch'::timestamptz), now())
       where id = $1`,
      [
        companyId,
        company.website,
        domain,
        normalizeEmail(company.companyEmails[0] ?? '') ?? null,
        company.primaryPhone,
        phoneNorm?.e164 ?? null,
        companyLi?.kind === 'company' ? companyLi.url : null,
        company.rating,
        company.reviewCount,
        company.fullAddress,
      ],
    );
    await bumpCounts(db, run.id, { duplicate_count: 1 });
  } else {
    const inserted = await one<{ id: string }>(
      db,
      `insert into public.companies
         (organization_id, canonical_name, normalized_name, subtitle, primary_category, categories,
          description, website, root_domain, primary_email, primary_phone, primary_phone_e164,
          company_linkedin_url, social_profiles, full_address, street, neighborhood, city, region,
          postal_code, country_code, latitude, longitude, google_place_id, google_maps_url,
          google_fid, google_cid, rating, review_count, business_status, price_range, opening_hours,
          source_freshness, is_fixture)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,now(),$33)
       on conflict (organization_id, google_place_id) where google_place_id is not null and deleted_at is null
       do update set updated_at = now()
       returning id`,
      [
        run.organization_id,
        company.canonicalName,
        normalizeCompanyName(company.canonicalName),
        company.subtitle,
        company.primaryCategory,
        company.categories,
        company.description,
        company.website,
        domain,
        normalizeEmail(company.companyEmails[0] ?? '') ?? null,
        company.primaryPhone,
        phoneNorm?.e164 ?? null,
        companyLi?.kind === 'company' ? companyLi.url : null,
        JSON.stringify(company.socialProfiles),
        company.fullAddress,
        company.street,
        company.neighborhood,
        company.city,
        company.region,
        company.postalCode,
        company.countryCode,
        company.latitude,
        company.longitude,
        company.googlePlaceId,
        company.googleMapsUrl,
        company.googleFid,
        company.googleCid,
        company.rating,
        company.reviewCount,
        company.permanentlyClosed
          ? 'permanently_closed'
          : company.temporarilyClosed
            ? 'temporarily_closed'
            : 'operational',
        company.priceRange,
        company.openingHours === null ? null : JSON.stringify(company.openingHours),
        run.is_fixture,
      ],
    );
    companyId = inserted!.id;
    await bumpCounts(db, run.id, { accepted_count: 1 });

    for (const key of autoKeys) {
      await db.query(
        `insert into public.company_dedupe_keys (organization_id, key, company_id, priority)
         values ($1, $2, $3, $4) on conflict (organization_id, key) do nothing`,
        [run.organization_id, key.key, companyId, key.priority],
      );
    }
    // Weak keys: if they collide with a different company, queue for review.
    for (const key of reviewKeys) {
      const clash = await one<{ company_id: string }>(
        db,
        `select company_id from public.company_dedupe_keys where organization_id = $1 and key = $2`,
        [run.organization_id, key.key],
      );
      if (clash && clash.company_id !== companyId) {
        await db.query(
          `insert into public.duplicate_candidates
             (organization_id, entity_kind, record_a, record_b, match_key, priority)
           values ($1, 'company', $2, $3, $4, $5)
           on conflict do nothing`,
          [run.organization_id, clash.company_id, companyId, key.key, key.priority],
        );
      } else if (!clash) {
        await db.query(
          `insert into public.company_dedupe_keys (organization_id, key, company_id, priority)
           values ($1, $2, $3, $4) on conflict (organization_id, key) do nothing`,
          [run.organization_id, key.key, companyId, key.priority],
        );
      }
    }

    // Child rows: emails/phones/socials with source labeling.
    for (const [index, email] of company.companyEmails.entries()) {
      const normalized = normalizeEmail(email);
      if (!normalized) continue;
      await db.query(
        `insert into public.company_emails (organization_id, company_id, email, status, source, is_primary)
         values ($1, $2, $3, 'found', $4::public.provider_kind, $5)
         on conflict (company_id, email) do nothing`,
        [run.organization_id, companyId, normalized, run.provider, index === 0],
      );
    }
    for (const [index, phone] of company.companyPhones.entries()) {
      const norm = normalizePhone(phone, company.countryCode);
      await db.query(
        `insert into public.company_phones (organization_id, company_id, phone, phone_e164, phone_type, source, is_primary)
         values ($1, $2, $3, $4, 'company', $5::public.provider_kind, $6)
         on conflict (company_id, phone) do nothing`,
        [run.organization_id, companyId, phone, norm.e164, run.provider, index === 0],
      );
    }
    for (const [network, urls] of Object.entries(company.socialProfiles)) {
      for (const url of urls) {
        await db.query(
          `insert into public.company_social_profiles (organization_id, company_id, network, url, source)
           values ($1, $2, $3, $4, $5::public.provider_kind)
           on conflict (company_id, network, url) do nothing`,
          [run.organization_id, companyId, network, url, run.provider],
        );
      }
    }
  }

  // Provenance for every source record, merged or new.
  await db.query(
    `insert into public.company_sources
       (organization_id, company_id, run_id, provider, connection_id, provider_record_id,
        source_url, retrieved_at, raw_payload_hash, retention_until)
     select $1, $2, $3, $4::public.provider_kind, $5, $6, $7, r.retrieved_at, r.payload_hash, r.retention_until
     from public.provider_raw_records r where r.id = $8
     on conflict do nothing`,
    [
      run.organization_id,
      companyId,
      run.id,
      run.provider,
      run.connection_id,
      company.providerRecordId,
      company.googleMapsUrl,
      rawRecordId,
    ],
  );

  return companyId;
}

async function upsertContact(
  db: Db,
  run: RunRow,
  companyId: string,
  contact: MappedContact,
): Promise<void> {
  const emailNorm = contact.workEmail ? normalizeEmail(contact.workEmail) : null;
  const phoneNorm = contact.phone ? normalizePhone(contact.phone, null) : null;
  const personalLi = contact.personalLinkedinUrl
    ? normalizeLinkedInUrl(contact.personalLinkedinUrl)
    : null;
  const companyLi = contact.companyLinkedinUrl
    ? normalizeLinkedInUrl(contact.companyLinkedinUrl)
    : null;

  const keys = contactDedupeKeys({
    provider: run.provider,
    providerPersonId: contact.providerPersonId,
    personalLinkedinUrl: contact.personalLinkedinUrl,
    workEmail: contact.workEmail,
    workEmailVerified: contact.workEmailStatus === 'verified',
    phone: contact.phone,
    fullName: contact.fullName,
    companyKey: companyId,
    jobTitle: contact.jobTitle,
  });
  const autoKeys = keys.filter((k) => k.action === 'auto');

  let contactId: string | null = null;
  if (autoKeys.length > 0) {
    const existing = await one<{ contact_id: string }>(
      db,
      `select contact_id from public.contact_dedupe_keys
       where organization_id = $1 and key = any($2)
       order by priority asc limit 1`,
      [run.organization_id, autoKeys.map((k) => k.key)],
    );
    contactId = existing?.contact_id ?? null;
  }

  if (contactId) {
    await db.query(
      `update public.contacts set
         work_email = case when work_email is null then $2 else work_email end,
         work_email_status = case
           when work_email is null and $2 is not null then $3::public.email_status
           when work_email = $2 and work_email_status <> 'verified' and $3 = 'verified' then 'verified'::public.email_status
           else work_email_status end,
         email_verified_at = case when $3 = 'verified' and email_verified_at is null then now() else email_verified_at end,
         phone = coalesce(phone, $4),
         phone_e164 = coalesce(phone_e164, $5),
         personal_linkedin_url = coalesce(personal_linkedin_url, $6),
         company_linkedin_url = coalesce(company_linkedin_url, $7),
         last_enriched_at = now()
       where id = $1`,
      [
        contactId,
        emailNorm,
        contact.workEmailStatus,
        contact.phone,
        phoneNorm?.e164 ?? null,
        personalLi?.kind === 'personal' ? personalLi.url : null,
        companyLi?.kind === 'company' ? companyLi.url : null,
      ],
    );
  } else {
    const inserted = await one<{ id: string }>(
      db,
      `insert into public.contacts
         (organization_id, company_id, first_name, last_name, full_name, job_title, normalized_title,
          seniority, department, work_email, work_email_status, work_email_source, email_verified_at,
          phone, phone_e164, phone_type, phone_source, personal_linkedin_url, company_linkedin_url,
          person_location, provider, provider_person_id, last_enriched_at, is_fixture)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::public.email_status,$12::public.provider_kind,$13,$14,$15,$16::public.phone_type,$17::public.provider_kind,$18,$19,$20,$21::public.provider_kind,$22,now(),$23)
       on conflict (organization_id, provider, provider_person_id) where provider_person_id is not null and deleted_at is null
       do update set last_enriched_at = now()
       returning id`,
      [
        run.organization_id,
        companyId,
        contact.firstName,
        contact.lastName,
        contact.fullName,
        contact.jobTitle,
        contact.jobTitle ? normalizeCompanyName(contact.jobTitle) : null,
        contact.seniority,
        contact.departments[0] ?? null,
        emailNorm,
        contact.workEmailStatus,
        emailNorm ? run.provider : null,
        contact.workEmailStatus === 'verified' ? new Date().toISOString() : null,
        contact.phone,
        phoneNorm?.e164 ?? null,
        contact.phoneType,
        contact.phone ? run.provider : null,
        personalLi?.kind === 'personal' ? personalLi.url : null,
        companyLi?.kind === 'company' ? companyLi.url : null,
        contact.personLocation,
        run.provider,
        contact.providerPersonId,
        run.is_fixture,
      ],
    );
    contactId = inserted!.id;
    await bumpCounts(db, run.id, { enriched_count: 1 });

    for (const key of autoKeys) {
      await db.query(
        `insert into public.contact_dedupe_keys (organization_id, key, contact_id, priority)
         values ($1, $2, $3, $4) on conflict (organization_id, key) do nothing`,
        [run.organization_id, key.key, contactId, key.priority],
      );
    }
    if (emailNorm) {
      await db.query(
        `insert into public.contact_emails (organization_id, contact_id, email, status, source, verified_at, is_primary)
         values ($1, $2, $3, $4::public.email_status, $5::public.provider_kind, $6, true)
         on conflict (contact_id, email) do nothing`,
        [
          run.organization_id,
          contactId,
          emailNorm,
          contact.workEmailStatus,
          run.provider,
          contact.workEmailStatus === 'verified' ? new Date().toISOString() : null,
        ],
      );
    }
    if (contact.phone) {
      await db.query(
        `insert into public.contact_phones (organization_id, contact_id, phone, phone_e164, phone_type, source, is_primary)
         values ($1, $2, $3, $4, $5::public.phone_type, $6::public.provider_kind, true)
         on conflict (contact_id, phone) do nothing`,
        [
          run.organization_id,
          contactId,
          contact.phone,
          phoneNorm?.e164 ?? null,
          contact.phoneType,
          run.provider,
        ],
      );
    }
  }

  await db.query(
    `insert into public.contact_sources
       (organization_id, contact_id, run_id, provider, connection_id, provider_record_id, retrieved_at)
     values ($1, $2, $3, $4::public.provider_kind, $5, $6, now())
     on conflict do nothing`,
    [
      run.organization_id,
      contactId,
      run.id,
      run.provider,
      run.connection_id,
      contact.providerPersonId,
    ],
  );
}
