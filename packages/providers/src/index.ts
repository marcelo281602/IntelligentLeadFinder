import type { ProviderKind } from '@leadfinder/core';
import { ApifyGoogleMapsAdapter } from './apify/adapter';
import { FixtureMapsAdapter } from './fixture/adapter';
import { OutscraperMapsAdapter } from './outscraper/adapter';
import { ProspeoEnrichmentAdapter } from './prospeo/adapter';
import {
  ProviderError,
  type ContactEnrichmentAdapter,
  type MapsProviderAdapter,
} from './types';

export * from './types';
export { deliverToDestination, type DeliverResult } from './destinations';
export {
  ApifyGoogleMapsAdapter,
  buildActorInput,
  mapPlaceItem,
  mapEmailStatus,
  minRatingToStars,
} from './apify/adapter';
export { ApifyClient } from './apify/client';
export {
  placeItemSchema,
  leadsEnrichmentResultSchema,
  apifyRunSchema,
  type ApifyGoogleMapsInput,
  type ApifyPlaceItem,
  type ApifyLead,
} from './apify/schemas';
export { FixtureMapsAdapter } from './fixture/adapter';
export { FIXTURE_PLACES } from './fixture/data';
export {
  OutscraperMapsAdapter,
  buildOutscraperPayload,
  mapOutscraperPlace,
} from './outscraper/adapter';
export { OutscraperClient } from './outscraper/client';
export {
  ProspeoEnrichmentAdapter,
  buildProspeoRequest,
  mapProspeoPerson,
} from './prospeo/adapter';
export { ProspeoClient } from './prospeo/client';
export { apolloCapabilities, assertApolloAllowed, type ApolloGateInput } from './stubs';

/** Resolve the contact-enrichment adapter for a provider kind. */
export function getEnrichmentAdapter(provider: ProviderKind): ContactEnrichmentAdapter {
  switch (provider) {
    case 'prospeo':
      return new ProspeoEnrichmentAdapter();
    case 'apollo':
      throw new ProviderError(
        'Apollo requires a documented commercial-use approval before any enablement.',
        'feature_gated',
        false,
      );
    default:
      throw new ProviderError(
        `${provider} is not a contact-enrichment provider.`,
        'invalid_input',
        false,
      );
  }
}

/** Resolve the Maps data-source adapter for a provider kind. */
export function getMapsAdapter(provider: ProviderKind): MapsProviderAdapter {
  switch (provider) {
    case 'apify':
      return new ApifyGoogleMapsAdapter();
    case 'fixture':
      return new FixtureMapsAdapter();
    case 'outscraper':
      return new OutscraperMapsAdapter();
    case 'apollo':
      throw new ProviderError(
        'Apollo is not a Maps data source and is commercially gated.',
        'feature_gated',
        false,
      );
    case 'prospeo':
      throw new ProviderError('Prospeo adapter is not yet implemented.', 'feature_gated', false);
  }
}
