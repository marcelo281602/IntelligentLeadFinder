import { ProviderError, type CapabilityManifest } from './types';

/**
 * Feature-gated provider stubs. These publish honest capability manifests so
 * the UI can show "not yet available" instead of pretending the integration
 * works. Enabling any of them requires: contract tests against the current
 * API, a real low-cost smoke test, and — for Apollo — a documented
 * commercial-use approval row.
 */

export function outscraperCapabilities(): CapabilityManifest {
  return {
    provider: 'outscraper',
    companyCollection: false,
    companyContactEnrichment: false,
    decisionMakerDiscovery: false,
    emailVerification: false,
    phoneEnrichment: false,
    notes: [
      'Adapter not yet implemented — planned as a lower-cost Google Maps source',
      'Feature flag provider_outscraper is off until contract-tested',
    ],
  };
}

export function prospeoCapabilities(): CapabilityManifest {
  return {
    provider: 'prospeo',
    companyCollection: false,
    companyContactEnrichment: false,
    decisionMakerDiscovery: false,
    emailVerification: false,
    phoneEnrichment: false,
    notes: [
      'Adapter not yet implemented — planned for email finding/verification',
      'Capabilities will be published per-account after connection testing',
    ],
  };
}

export interface ApolloGateInput {
  /** True only when a commercial_use_approvals row exists and is approved. */
  commercialUseApproved: boolean;
  featureFlagEnabled: boolean;
}

/**
 * Apollo is contractually restricted: standard public plans cover internal
 * business use only and may not power an external multi-tenant product.
 * Bring-your-own-key does NOT remove this restriction.
 */
export function assertApolloAllowed(gate: ApolloGateInput): void {
  if (!gate.commercialUseApproved) {
    throw new ProviderError(
      'Apollo integration is blocked: no documented commercial-use approval exists. ' +
        'Record an approval (approver, date, agreement reference, permitted use) before enabling.',
      'feature_gated',
      false,
    );
  }
  if (!gate.featureFlagEnabled) {
    throw new ProviderError(
      'Apollo integration is disabled by feature flag provider_apollo.',
      'feature_gated',
      false,
    );
  }
}

export function apolloCapabilities(gate: ApolloGateInput): CapabilityManifest {
  const gated = !gate.commercialUseApproved || !gate.featureFlagEnabled;
  return {
    provider: 'apollo',
    companyCollection: false,
    companyContactEnrichment: false,
    decisionMakerDiscovery: !gated,
    emailVerification: !gated,
    phoneEnrichment: !gated,
    notes: gated
      ? [
          'Blocked: Apollo public plans are for internal use — a reseller/partner agreement is required for SaaS use',
          'Requires a documented commercial-use approval and the provider_apollo feature flag',
        ]
      : ['Enabled under documented commercial-use approval'],
  };
}
