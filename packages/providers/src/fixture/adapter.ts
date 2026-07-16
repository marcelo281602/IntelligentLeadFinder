import { mapPlaceItem } from '../apify/adapter';
import { FIXTURE_PLACES } from './data';
import {
  ProviderError,
  type CapabilityManifest,
  type ConnectionTestResult,
  type DatasetPage,
  type MapContext,
  type MapResult,
  type MapsProviderAdapter,
  type ProviderCredentials,
  type ProviderRunStatus,
  type StartRunParams,
  type StartRunResult,
} from '../types';

/**
 * Deterministic fixture provider: exercises the entire pipeline — queueing,
 * polling, paginated ingestion, normalization, dedupe, enrichment mapping,
 * export — with zero paid calls. Every record it produces is flagged
 * is_fixture downstream and the UI labels it as test data.
 *
 * Stateless by design: runs "complete" immediately, so any process can poll.
 */
export class FixtureMapsAdapter implements MapsProviderAdapter {
  readonly provider = 'fixture' as const;
  readonly defaultSourceId = 'fixture-google-maps';

  capabilities(): CapabilityManifest {
    return {
      provider: 'fixture',
      companyCollection: true,
      companyContactEnrichment: true,
      decisionMakerDiscovery: true,
      emailVerification: true,
      phoneEnrichment: true,
      notes: ['Deterministic test data — never real businesses', 'Zero cost'],
    };
  }

  async testConnection(_credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    return { ok: true, accountLabel: 'Fixture provider', planHint: 'free', latencyMs: 1 };
  }

  async startRun(params: StartRunParams): Promise<StartRunResult> {
    if (!Number.isInteger(params.hardCapMicroUsd) || params.hardCapMicroUsd < 0) {
      throw new ProviderError('Fixture runs still require a cost cap.', 'invalid_input', false);
    }
    const runId = `fixture-run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { providerRunId: runId, datasetId: `fixture-dataset:${params.config.maxResults}` };
  }

  async getRunStatus(
    _credentials: ProviderCredentials,
    providerRunId: string,
  ): Promise<ProviderRunStatus> {
    return {
      state: 'succeeded',
      datasetId: undefined, // dataset id was returned at start and persisted
      itemCount: FIXTURE_PLACES.length,
      usageTotalMicroUsd: 0,
      finishedAt: new Date().toISOString(),
      meta: { fixture: true, providerRunId },
    };
  }

  async abortRun(): Promise<void> {
    // Fixture runs complete instantly; nothing to abort.
  }

  async fetchDatasetPage(
    _credentials: ProviderCredentials,
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<DatasetPage> {
    const maxResults = Number(datasetId.split(':')[1] ?? FIXTURE_PLACES.length);
    const capped = FIXTURE_PLACES.slice(0, Math.min(maxResults, FIXTURE_PLACES.length));
    return {
      items: capped.slice(offset, offset + limit),
      offset,
      limit,
      total: capped.length,
    };
  }

  mapItem(raw: unknown, context: MapContext): MapResult | null {
    return mapPlaceItem(raw, context.verificationRequested);
  }
}
