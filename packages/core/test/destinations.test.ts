import { describe, expect, it } from 'vitest';
import {
  buildDestinationPayload,
  destinationColumns,
  destinationRow,
  type DestinationLead,
} from '../src/destinations';

const lead: DestinationLead = {
  companyName: 'Acme Plumbing',
  category: 'Plumber',
  website: 'https://acme.example',
  companyEmail: 'hi@acme.example',
  companyPhone: '+15125550142',
  companyLinkedin: 'https://www.linkedin.com/company/acme',
  address: '1 Main St, Austin, TX',
  city: 'Austin',
  country: 'US',
  rating: 4.8,
  reviews: 212,
  mapsUrl: 'https://maps.google.com/?cid=1',
  placeId: 'ChIJ-abc',
  source: 'leadfinder',
  contactName: 'Maria Delgado',
  contactTitle: 'Owner',
  contactWorkEmail: 'maria@acme.example',
  contactEmailStatus: 'verified',
  contactPhone: '+15125550190',
  contactPersonalLinkedin: 'https://www.linkedin.com/in/maria',
  collectedAt: '2026-07-17T00:00:00.000Z',
};

describe('destination columns', () => {
  it('company-only vs with-contacts', () => {
    expect(destinationColumns(false)).not.toContain('Decision maker');
    expect(destinationColumns(true)).toContain('Decision maker');
    expect(destinationColumns(true).length).toBe(destinationColumns(false).length + 6);
  });
});

describe('destinationRow', () => {
  it('maps values and preserves numbers', () => {
    const row = destinationRow(lead, false, 'webhook');
    expect(row[0]).toBe('Acme Plumbing');
    expect(row).toContain(4.8);
    expect(row).toContain(212);
  });

  it('nulls become empty strings', () => {
    const row = destinationRow({ ...lead, website: null }, false, 'webhook');
    expect(row[2]).toBe('');
  });

  it('escapes formula injection for Google Sheets but not raw webhooks', () => {
    const evil = { ...lead, companyName: '=HYPERLINK("http://evil")' };
    expect(destinationRow(evil, false, 'google_sheets')[0]).toBe('\'=HYPERLINK("http://evil")');
    expect(destinationRow(evil, false, 'webhook')[0]).toBe('=HYPERLINK("http://evil")');
  });

  it('includes contact columns when requested', () => {
    const row = destinationRow(lead, true, 'google_sheets');
    expect(row).toContain('Maria Delgado');
    expect(row).toContain('verified');
  });
});

describe('buildDestinationPayload', () => {
  it('produces a signed-shape payload with columns and rows aligned', () => {
    const payload = buildDestinationPayload({
      destinationName: 'Client Sheet',
      secret: 'secret',
      runId: 'run-1',
      kind: 'google_sheets',
      includeContacts: true,
      leads: [lead],
    });
    expect(payload.type).toBe('leadfinder.leads');
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]!.length).toBe(payload.columns.length);
    expect(payload.destination).toBe('Client Sheet');
  });
});
