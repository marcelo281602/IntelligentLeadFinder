import type { ProviderKind } from '@leadfinder/core';
import { ApifyGoogleMapsAdapter } from './apify/adapter';
import { FixtureMapsAdapter } from './fixture/adapter';
import { ProviderError, type MapsProviderAdapter } from './types';

export * from './types';
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
  apolloCapabilities,
  assertApolloAllowed,
  outscraperCapabilities,
  prospeoCapabilities,
  type ApolloGateInput,
} from './stubs';

/** Resolve the Maps data-source adapter for a provider kind. */
export function getMapsAdapter(provider: ProviderKind): MapsProviderAdapter {
  switch (provider) {
    case 'apify':
      return new ApifyGoogleMapsAdapter();
    case 'fixture':
      return new FixtureMapsAdapter();
    case 'outscraper':
      throw new ProviderError('Outscraper adapter is not yet implemented.', 'feature_gated', false);
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
