import {
  normalizeAddress,
  normalizeCompanyName,
  normalizeEmail,
  normalizeLinkedInUrl,
  normalizePhone,
  rootDomain,
} from './normalize';

/**
 * Deterministic entity resolution (Module 11).
 *
 * Keys are computed in priority order. Priorities 1–3 auto-merge; priorities
 * 4–5 only create review candidates — weak matches are never merged
 * automatically.
 */

export interface CompanyDedupeInput {
  provider: string;
  providerPlaceId?: string | null;
  website?: string | null;
  phone?: string | null;
  countryCode?: string | null;
  name: string;
  fullAddress?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
}

export interface DedupeKey {
  priority: number;
  key: string;
  /** auto = merge on exact match; review = surface as duplicate candidate. */
  action: 'auto' | 'review';
}

export function companyDedupeKeys(input: CompanyDedupeInput): DedupeKey[] {
  const keys: DedupeKey[] = [];

  if (input.providerPlaceId) {
    keys.push({
      priority: 1,
      key: `place:${input.provider}:${input.providerPlaceId.trim()}`,
      action: 'auto',
    });
  }

  const domain = input.website ? rootDomain(input.website) : null;
  if (domain) {
    keys.push({ priority: 2, key: `domain:${domain}`, action: 'auto' });
  }

  if (input.phone) {
    const { e164 } = normalizePhone(input.phone, input.countryCode);
    if (e164) keys.push({ priority: 3, key: `phone:${e164}`, action: 'auto' });
  }

  const normName = normalizeCompanyName(input.name);
  if (normName && input.fullAddress) {
    const normAddr = normalizeAddress(input.fullAddress);
    if (normAddr) {
      keys.push({ priority: 4, key: `nameaddr:${normName}|${normAddr}`, action: 'review' });
    }
  }

  if (normName && input.city && (input.region || input.postalCode)) {
    const locality = [input.city, input.region ?? '', input.postalCode ?? '']
      .map((part) => normalizeAddress(part))
      .join('|');
    keys.push({ priority: 5, key: `namecity:${normName}|${locality}`, action: 'review' });
  }

  return keys;
}

export interface ContactDedupeInput {
  provider: string;
  providerPersonId?: string | null;
  personalLinkedinUrl?: string | null;
  workEmail?: string | null;
  workEmailVerified?: boolean;
  phone?: string | null;
  countryCode?: string | null;
  fullName?: string | null;
  companyKey?: string | null;
  jobTitle?: string | null;
}

export function contactDedupeKeys(input: ContactDedupeInput): DedupeKey[] {
  const keys: DedupeKey[] = [];

  if (input.providerPersonId) {
    keys.push({
      priority: 1,
      key: `person:${input.provider}:${input.providerPersonId.trim()}`,
      action: 'auto',
    });
  }

  if (input.personalLinkedinUrl) {
    const li = normalizeLinkedInUrl(input.personalLinkedinUrl);
    if (li && li.kind === 'personal') {
      keys.push({ priority: 2, key: `linkedin:${li.url.toLowerCase()}`, action: 'auto' });
    }
  }

  if (input.workEmail && input.workEmailVerified) {
    const email = normalizeEmail(input.workEmail);
    if (email) keys.push({ priority: 3, key: `email:${email}`, action: 'auto' });
  }

  if (input.phone) {
    const { e164 } = normalizePhone(input.phone, input.countryCode);
    if (e164) keys.push({ priority: 4, key: `phone:${e164}`, action: 'auto' });
  }

  if (input.fullName && input.companyKey && input.jobTitle) {
    const name = normalizeCompanyName(input.fullName);
    const title = normalizeCompanyName(input.jobTitle);
    keys.push({
      priority: 5,
      key: `namecotitle:${name}|${input.companyKey}|${title}`,
      action: 'review',
    });
  }

  return keys;
}

/**
 * Merge-field policy: never overwrite a verified value with an unverified
 * one, and never overwrite a human correction silently.
 */
export function shouldReplaceField(params: {
  existingValue: unknown;
  existingVerified: boolean;
  existingHumanEdited: boolean;
  incomingValue: unknown;
  incomingVerified: boolean;
}): boolean {
  const { existingValue, existingVerified, existingHumanEdited, incomingValue, incomingVerified } =
    params;
  if (incomingValue === null || incomingValue === undefined || incomingValue === '') return false;
  if (existingValue === null || existingValue === undefined || existingValue === '') return true;
  if (existingHumanEdited) return false;
  if (existingVerified && !incomingVerified) return false;
  if (!existingVerified && incomingVerified) return true;
  return false; // equal confidence: keep first-seen value, sources are preserved anyway
}
