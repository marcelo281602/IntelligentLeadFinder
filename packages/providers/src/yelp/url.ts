import type { SearchConfig } from '@leadfinder/core';
import { ProviderError } from '../types';

/**
 * Yelp search URLs are built ONLY server-side from structured form fields.
 * Tenants never submit a URL, and the Actor never receives anything outside
 * the approved Yelp search allowlist: https://www.yelp.com/search only —
 * no userinfo, no fragments, no other hosts, schemes, or paths.
 */

const APPROVED_YELP_HOST = 'www.yelp.com';
const APPROVED_YELP_PATH = '/search';

/** Defensive gate every start URL passes through before reaching the Actor. */
export function assertApprovedYelpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderError('Invalid Yelp URL.', 'invalid_input', false);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== APPROVED_YELP_HOST ||
    parsed.pathname !== APPROVED_YELP_PATH ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hash !== '' ||
    parsed.port !== ''
  ) {
    throw new ProviderError(
      'Only https://www.yelp.com/search URLs built by the server are allowed.',
      'invalid_input',
      false,
    );
  }
}

/** Build the approved Yelp search URL from a validated SearchConfig. */
export function buildYelpSearchUrl(config: SearchConfig): string {
  const location = config.locations[0];
  if (!location) throw new ProviderError('Search has no location.', 'invalid_input', false);

  // "city, region postal, CC" — Yelp's find_loc free-text format.
  const locality = [location.city, location.region].filter(Boolean).join(', ');
  const findLoc = [locality, location.postalCode, location.countryCode]
    .filter(Boolean)
    .join(locality || location.postalCode ? ', ' : '')
    .trim();
  if (!findLoc) {
    throw new ProviderError('Yelp searches need a location.', 'invalid_input', false);
  }

  const url = new URL(`https://${APPROVED_YELP_HOST}${APPROVED_YELP_PATH}`);
  url.searchParams.set('find_desc', config.searchTerm);
  url.searchParams.set('find_loc', findLoc);
  const built = url.toString();
  assertApprovedYelpUrl(built);
  return built;
}
