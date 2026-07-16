/**
 * Export column registry shared by the export builder UI and the worker's
 * file generator. Keys are stable identifiers; the worker maps them to SQL.
 * `personalData` marks columns that trigger the personal-data warning and
 * flag exports as containing personal data.
 */

export interface ExportColumnDef {
  key: string;
  label: string;
  personalData: boolean;
  /** Included in the default selection. */
  defaultSelected: boolean;
}

export const COMPANY_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'name', label: 'Company name', personalData: false, defaultSelected: true },
  { key: 'category', label: 'Category', personalData: false, defaultSelected: true },
  { key: 'website', label: 'Website', personalData: false, defaultSelected: true },
  { key: 'company_email', label: 'Company email', personalData: false, defaultSelected: true },
  { key: 'company_phone', label: 'Company phone', personalData: false, defaultSelected: true },
  { key: 'company_linkedin', label: 'Company LinkedIn', personalData: false, defaultSelected: true },
  { key: 'full_address', label: 'Address', personalData: false, defaultSelected: true },
  { key: 'city', label: 'City', personalData: false, defaultSelected: true },
  { key: 'region', label: 'State/Region', personalData: false, defaultSelected: false },
  { key: 'postal_code', label: 'Postal code', personalData: false, defaultSelected: false },
  { key: 'country_code', label: 'Country', personalData: false, defaultSelected: true },
  { key: 'rating', label: 'Rating', personalData: false, defaultSelected: true },
  { key: 'review_count', label: 'Reviews', personalData: false, defaultSelected: true },
  { key: 'business_status', label: 'Business status', personalData: false, defaultSelected: false },
  { key: 'google_maps_url', label: 'Google Maps URL', personalData: false, defaultSelected: false },
  { key: 'google_place_id', label: 'Google Place ID', personalData: false, defaultSelected: false },
  { key: 'lead_status', label: 'Lead status', personalData: false, defaultSelected: false },
  { key: 'source', label: 'Source', personalData: false, defaultSelected: false },
  { key: 'updated_at', label: 'Last updated', personalData: false, defaultSelected: false },
];

export const CONTACT_EXPORT_COLUMNS: ExportColumnDef[] = [
  { key: 'full_name', label: 'Name', personalData: true, defaultSelected: true },
  { key: 'job_title', label: 'Job title', personalData: true, defaultSelected: true },
  { key: 'seniority', label: 'Seniority', personalData: true, defaultSelected: false },
  { key: 'department', label: 'Department', personalData: true, defaultSelected: false },
  { key: 'company_name', label: 'Company', personalData: false, defaultSelected: true },
  { key: 'work_email', label: 'Work email', personalData: true, defaultSelected: true },
  { key: 'work_email_status', label: 'Email status', personalData: false, defaultSelected: true },
  { key: 'phone', label: 'Phone', personalData: true, defaultSelected: true },
  { key: 'phone_type', label: 'Phone type', personalData: false, defaultSelected: false },
  {
    key: 'personal_linkedin',
    label: 'Personal LinkedIn',
    personalData: true,
    defaultSelected: true,
  },
  { key: 'company_linkedin', label: 'Company LinkedIn', personalData: false, defaultSelected: false },
  { key: 'person_location', label: 'Location', personalData: true, defaultSelected: false },
  { key: 'match_confidence', label: 'Match confidence', personalData: false, defaultSelected: false },
  { key: 'last_enriched_at', label: 'Last enriched', personalData: false, defaultSelected: false },
];

export const SOURCE_METADATA_COLUMNS: ExportColumnDef[] = [
  { key: 'src_provider', label: 'Source provider', personalData: false, defaultSelected: false },
  { key: 'src_retrieved_at', label: 'Retrieved at', personalData: false, defaultSelected: false },
  { key: 'src_is_fixture', label: 'Test data', personalData: false, defaultSelected: false },
];

export function columnsForKind(kind: 'companies' | 'contacts'): ExportColumnDef[] {
  return kind === 'companies' ? COMPANY_EXPORT_COLUMNS : CONTACT_EXPORT_COLUMNS;
}

export function exportIncludesPersonalData(
  kind: 'companies' | 'contacts',
  selectedKeys: string[],
): boolean {
  const defs = columnsForKind(kind);
  return selectedKeys.some((key) => defs.find((d) => d.key === key)?.personalData ?? false);
}
