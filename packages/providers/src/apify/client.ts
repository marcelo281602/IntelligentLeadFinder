import { ProviderError } from '../types';

/**
 * Minimal Apify REST client (fetch-based). The token travels only in the
 * Authorization header — never in query strings — so it cannot leak into
 * URLs, logs, or provider-side request logs.
 */

const BASE = 'https://api.apify.com/v2';

export interface ApifyClientOptions {
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ApifyClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ApifyClientOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<{ status: number; json: unknown; headers: Headers }> {
    const url = new URL(`${BASE}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ProviderError(
        `Apify request failed: ${error instanceof Error ? error.name : 'network error'}`,
        'provider_unavailable',
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('Apify rejected the API token.', 'auth', false);
    }
    if (response.status === 404) {
      throw new ProviderError('Apify resource not found.', 'not_found', false);
    }
    if (response.status === 429) {
      throw new ProviderError('Apify rate limit reached.', 'rate_limit', true);
    }
    if (response.status >= 500) {
      throw new ProviderError(
        `Apify server error (${response.status}).`,
        'provider_unavailable',
        true,
      );
    }

    let json: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new ProviderError('Apify returned a non-JSON response.', 'unknown', true);
      }
    }
    if (response.status >= 400) {
      const message =
        (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${response.status}`;
      throw new ProviderError(`Apify error: ${message}`, 'invalid_input', false);
    }
    return { status: response.status, json, headers: response.headers };
  }

  /** GET /users/me — validates the token and returns account info. */
  async getMe(): Promise<unknown> {
    const { json } = await this.request('GET', '/users/me');
    return (json as { data?: unknown })?.data ?? json;
  }

  /**
   * POST /acts/{actorId}/runs — start an Actor run asynchronously.
   * maxTotalChargeUsd is the provider-enforced hard cost cap.
   */
  async startActorRun(params: {
    actorId: string;
    input: unknown;
    maxTotalChargeUsd: string;
    webhooks?: Array<{ eventTypes: string[]; requestUrl: string }>;
  }): Promise<unknown> {
    const actorPath = params.actorId.replace('/', '~');
    const query: Record<string, string> = {
      maxTotalChargeUsd: params.maxTotalChargeUsd,
      waitForFinish: '0',
    };
    if (params.webhooks && params.webhooks.length > 0) {
      query.webhooks = Buffer.from(JSON.stringify(params.webhooks), 'utf8').toString('base64');
    }
    const { json } = await this.request('POST', `/acts/${actorPath}/runs`, {
      query,
      body: params.input,
    });
    return (json as { data?: unknown })?.data ?? json;
  }

  /** GET /actor-runs/{runId} — authoritative run state. */
  async getRun(runId: string): Promise<unknown> {
    const { json } = await this.request('GET', `/actor-runs/${encodeURIComponent(runId)}`);
    return (json as { data?: unknown })?.data ?? json;
  }

  /** POST /actor-runs/{runId}/abort */
  async abortRun(runId: string): Promise<void> {
    await this.request('POST', `/actor-runs/${encodeURIComponent(runId)}/abort`);
  }

  /** GET /datasets/{datasetId}/items — one page of clean items. */
  async getDatasetItems(
    datasetId: string,
    offset: number,
    limit: number,
  ): Promise<{ items: unknown[]; total?: number }> {
    const { json, headers } = await this.request(
      'GET',
      `/datasets/${encodeURIComponent(datasetId)}/items`,
      {
        query: { offset: String(offset), limit: String(limit), clean: 'true', format: 'json' },
      },
    );
    const totalHeader = headers.get('x-apify-pagination-total');
    return {
      items: Array.isArray(json) ? json : [],
      total: totalHeader ? Number(totalHeader) : undefined,
    };
  }
}
