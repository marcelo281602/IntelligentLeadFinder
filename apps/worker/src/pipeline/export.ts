import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { columnsForKind, escapeFormulaInjection, toCsv, type CsvColumn } from '@leadfinder/core';
import type { Db } from '../db';
import { one } from '../db';
import { auditLog, notify, recordUsage } from '../ledger';
import type { Job } from '../queue';

/**
 * Background export generation (CSV/XLSX). Selection was authorized and
 * snapshotted server-side at creation time. Formula injection is neutralized
 * in both formats. Files land in private storage with expiring access.
 */

interface ExportRow {
  id: string;
  organization_id: string;
  format: 'csv' | 'xlsx';
  status: string;
  config: {
    kind: 'companies' | 'contacts';
    columns: { key: string; header: string }[];
    listId?: string | null;
  };
  verified_only: boolean;
  include_source_metadata: boolean;
  requested_by: string;
}

const COMPANY_SQL: Record<string, string> = {
  name: 'c.canonical_name',
  category: 'c.primary_category',
  website: 'c.website',
  company_email: 'c.primary_email',
  company_phone: 'c.primary_phone',
  company_linkedin: 'c.company_linkedin_url',
  full_address: 'c.full_address',
  city: 'c.city',
  region: 'c.region',
  postal_code: 'c.postal_code',
  country_code: 'c.country_code',
  rating: 'c.rating::float8',
  review_count: 'c.review_count',
  business_status: 'c.business_status',
  google_maps_url: 'c.google_maps_url',
  google_place_id: 'c.google_place_id',
  lead_status: 'c.lead_status::text',
  source: `(select string_agg(distinct s.provider::text, ',') from public.company_sources s where s.company_id = c.id)`,
  updated_at: `to_char(c.updated_at, 'YYYY-MM-DD"T"HH24:MI:SSZ')`,
  src_is_fixture: 'c.is_fixture',
};

const CONTACT_SQL: Record<string, string> = {
  full_name: 't.full_name',
  job_title: 't.job_title',
  seniority: 't.seniority',
  department: 't.department',
  company_name: 'c.canonical_name',
  work_email: 't.work_email',
  work_email_status: 't.work_email_status::text',
  phone: 't.phone',
  phone_type: 't.phone_type::text',
  personal_linkedin: 't.personal_linkedin_url',
  company_linkedin: 't.company_linkedin_url',
  person_location: 't.person_location',
  match_confidence: 't.match_confidence::float8',
  last_enriched_at: `to_char(t.last_enriched_at, 'YYYY-MM-DD"T"HH24:MI:SSZ')`,
  src_is_fixture: 't.is_fixture',
};

export async function handleGenerateExport(db: Db, job: Job, storageDir: string): Promise<void> {
  const exp = await one<ExportRow>(db, `select * from public.exports where id = $1`, [
    job.export_id ?? (job.payload.exportId as string),
  ]);
  if (!exp) throw new Error('Export not found');
  if (exp.status === 'ready') return; // idempotent re-run

  await db.query(`update public.exports set status = 'generating' where id = $1`, [exp.id]);

  const kind = exp.config.kind;
  const validKeys = new Set([...columnsForKind(kind).map((c) => c.key), 'src_is_fixture']);
  const sqlMap = kind === 'companies' ? COMPANY_SQL : CONTACT_SQL;
  const columns = exp.config.columns.filter((c) => validKeys.has(c.key) && sqlMap[c.key]);
  if (exp.include_source_metadata && !columns.some((c) => c.key === 'src_is_fixture')) {
    columns.push({ key: 'src_is_fixture', header: 'Test data' });
  }
  if (columns.length === 0) throw new Error('Export has no valid columns');

  const selects = columns.map((c, i) => `${sqlMap[c.key]} as col_${i}`).join(', ');
  let rows: Record<string, unknown>[];
  if (kind === 'companies') {
    rows = (
      await db.query(
        `select ${selects}
         from public.companies c
         join public.export_items ei on ei.entity_id = c.id and ei.entity_kind = 'company'
         where ei.export_id = $1 and c.organization_id = $2 and c.deleted_at is null
         order by c.canonical_name asc`,
        [exp.id, exp.organization_id],
      )
    ).rows;
  } else {
    rows = (
      await db.query(
        `select ${selects}
         from public.contacts t
         left join public.companies c on c.id = t.company_id
         join public.export_items ei on ei.entity_id = t.id and ei.entity_kind = 'contact'
         where ei.export_id = $1 and t.organization_id = $2 and t.deleted_at is null
           and ($3 = false or t.work_email_status = 'verified')
         order by t.full_name asc`,
        [exp.id, exp.organization_id, exp.verified_only],
      )
    ).rows;
  }

  const fileName = `${exp.id}.${exp.format}`;
  // Absolute path: the web app's download route runs in a different process
  // (and cwd), so the stored path must not depend on the worker's cwd.
  const filePath = resolve(join(storageDir, exp.organization_id, fileName));
  await mkdir(dirname(filePath), { recursive: true });

  let bytes: number;
  if (exp.format === 'csv') {
    const csvColumns: CsvColumn<Record<string, unknown>>[] = columns.map((c, i) => ({
      header: c.header,
      value: (row) => row[`col_${i}`] as never,
    }));
    const csv = toCsv(rows, csvColumns);
    await writeFile(filePath, csv, 'utf8');
    bytes = Buffer.byteLength(csv, 'utf8');
  } else {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(kind === 'companies' ? 'Companies' : 'Decision Makers');
    sheet.addRow(columns.map((c) => escapeFormulaInjection(c.header)));
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(
        columns.map((_c, i) => {
          const value = row[`col_${i}`];
          if (value === null || value === undefined) return '';
          if (typeof value === 'number' || typeof value === 'boolean') return value;
          return escapeFormulaInjection(String(value));
        }),
      );
    }
    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(filePath, Buffer.from(buffer));
    bytes = (buffer as ArrayBuffer).byteLength;
  }

  await db.query(
    `update public.exports set
       status = 'ready', row_count = $2, file_path = $3, file_bytes = $4,
       generated_at = now(), expires_at = now() + interval '24 hours',
       purge_after = now() + interval '7 days'
     where id = $1`,
    [exp.id, rows.length, filePath, bytes],
  );

  await recordUsage(db, {
    orgId: exp.organization_id,
    exportId: exp.id,
    userId: exp.requested_by,
    feature: 'export_generated',
    quantity: rows.length,
    unit: 'row',
    idempotencyKey: `${exp.id}:export_generated`,
  });
  await notify(db, {
    orgId: exp.organization_id,
    userId: exp.requested_by,
    type: 'export.ready',
    title: 'Export ready for download',
    body: `${rows.length} rows (${exp.format.toUpperCase()}). Link expires in 24 hours.`,
    href: `/exports`,
  });
  await auditLog(db, {
    orgId: exp.organization_id,
    actorUserId: exp.requested_by,
    action: 'export.generated',
    entityKind: 'export',
    entityId: exp.id,
    details: { format: exp.format, rows: rows.length, kind },
  });
}
