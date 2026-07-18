import { ProviderError } from '../types';

/**
 * Minimal Outscraper REST client (fetch-based). The API key travels only in
 * the `X-API-KEY` header — never in query strings — so it cannot leak into
 * URLs or logs.
 */

const BASE = 'https://api.app.outscraper.com';

export interface OutscraperClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OutscraperClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OutscraperClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${BASE}${path}`, {
        method,
        headers: {
          'X-API-KEY': this.apiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ProviderError(
        `Outscraper request failed: ${error instanceof Error ? error.name : 'network error'}`,
        'provider_unavailable',
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('Outscraper rejected the API key.', 'auth', false);
    }
    if (response.status === 429) {
      throw new ProviderError('Outscraper rate limit reached.', 'rate_limit', true);
    }
    if (response.status >= 500) {
      throw new ProviderError(
        `Outscraper server error (${response.status}).`,
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
        throw new ProviderError('Outscraper returned a non-JSON response.', 'unknown', true);
      }
    }
    if (response.status >= 400) {
      const message =
        (json as { errorMessage?: string })?.errorMessage ?? `HTTP ${response.status}`;
      throw new ProviderError(`Outscraper error: ${message}`, 'invalid_input', false);
    }
    return { status: response.status, json };
  }

  /**
   * Validate the API key with no scrape cost: a request-archive lookup for a
   * dummy id returns 401 for a bad key and 404 (or an error JSON) for a good
   * one. Never triggers a paid Maps task.
   */
  async validateKey(): Promise<boolean> {
    try {
      await this.request('GET', '/requests/leadfinder-connection-check');
      return true;
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'auth') return false;
      // 404 / not-found comes back as invalid_input, which still proves the
      // key authenticated. Anything else (network/5xx) rethrows.
      if (error instanceof ProviderError && error.kind === 'invalid_input') return true;
      if (error instanceof ProviderError && error.kind === 'not_found') return true;
      throw error;
    }
  }

  /** Submit an async Google Maps search. Returns the request id. */
  async submitSearch(payload: unknown): Promise<unknown> {
    const { json } = await this.request('POST', '/google-maps-search', payload);
    return json;
  }

  /** Fetch the request archive (status + data). */
  async getRequest(requestId: string): Promise<unknown> {
    const { json } = await this.request('GET', `/requests/${encodeURIComponent(requestId)}`);
    return json;
  }
}
