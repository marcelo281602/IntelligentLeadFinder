import { escapeFormulaInjection } from './csv';
import type { DestinationKind } from './types';

/**
 * Row/column shaping for destination syncs (Google Sheets, webhooks). Pure and
 * shared so the worker and tests agree on exactly what a client's sheet
 * receives. When the target is a spreadsheet, string cells are escaped against
 * formula injection — a scraped business name like "=cmd" must never execute
 * in the client's Google Sheet.
 */

export interface DestinationLead {
  companyName: string;
  category: string | null;
  website: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyLinkedin: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  rating: number | null;
  reviews: number | null;
  mapsUrl: string | null;
  placeId: string | null;
  source: string | null;
  // Optional primary decision-maker (when include_contacts is on).
  contactName: string | null;
  contactTitle: string | null;
  contactWorkEmail: string | null;
  contactEmailStatus: string | null;
  contactPhone: string | null;
  contactPersonalLinkedin: string | null;
  collectedAt: string | null;
}

const COMPANY_COLUMNS: Array<[string, (l: DestinationLead) => string | number | null]> = [
  ['Company', (l) => l.companyName],
  ['Category', (l) => l.category],
  ['Website', (l) => l.website],
  ['Company email', (l) => l.companyEmail],
  ['Company phone', (l) => l.companyPhone],
  ['Company LinkedIn', (l) => l.companyLinkedin],
  ['Address', (l) => l.address],
  ['City', (l) => l.city],
  ['Country', (l) => l.country],
  ['Rating', (l) => l.rating],
  ['Reviews', (l) => l.reviews],
  ['Google Maps', (l) => l.mapsUrl],
  ['Place ID', (l) => l.placeId],
  ['Source', (l) => l.source],
  ['Collected at', (l) => l.collectedAt],
];

const CONTACT_COLUMNS: Array<[string, (l: DestinationLead) => string | number | null]> = [
  ['Decision maker', (l) => l.contactName],
  ['Title', (l) => l.contactTitle],
  ['Work email', (l) => l.contactWorkEmail],
  ['Email status', (l) => l.contactEmailStatus],
  ['Direct phone', (l) => l.contactPhone],
  ['Personal LinkedIn', (l) => l.contactPersonalLinkedin],
];

export function destinationColumns(includeContacts: boolean): string[] {
  const cols = COMPANY_COLUMNS.map(([h]) => h);
  return includeContacts ? [...cols, ...CONTACT_COLUMNS.map(([h]) => h)] : cols;
}

/** Whether string cells should be escaped for spreadsheet safety. */
function isSpreadsheet(kind: DestinationKind): boolean {
  return kind === 'google_sheets';
}

export function destinationRow(
  lead: DestinationLead,
  includeContacts: boolean,
  kind: DestinationKind,
): Array<string | number | null> {
  const defs = includeContacts ? [...COMPANY_COLUMNS, ...CONTACT_COLUMNS] : COMPANY_COLUMNS;
  const spreadsheet = isSpreadsheet(kind);
  return defs.map(([, get]) => {
    const value = get(lead);
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value;
    return spreadsheet ? escapeFormulaInjection(value) : value;
  });
}

export interface DestinationPayload {
  type: 'leadfinder.leads';
  destination: string;
  secret: string;
  runId: string | null;
  syncedAt: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

export function buildDestinationPayload(params: {
  destinationName: string;
  secret: string;
  runId: string | null;
  kind: DestinationKind;
  includeContacts: boolean;
  leads: DestinationLead[];
}): DestinationPayload {
  return {
    type: 'leadfinder.leads',
    destination: params.destinationName,
    secret: params.secret,
    runId: params.runId,
    syncedAt: new Date().toISOString(),
    columns: destinationColumns(params.includeContacts),
    rows: params.leads.map((l) => destinationRow(l, params.includeContacts, params.kind)),
  };
}
