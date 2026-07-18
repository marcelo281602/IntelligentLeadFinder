import { ProviderError } from '../types';

/**
 * Minimal Prospeo REST client (fetch-based). The API key travels only in the
 * `X-KEY` header — never in query strings — so it cannot leak into URLs or
 * logs.
 *
 * Prospeo signals domain errors as HTTP 400 + `{error:true, error_code}`.
 * NO_MATCH is a normal zero-cost outcome, so this client does NOT throw for
 * it — callers inspect the envelope. Only transport, auth, credit, and rate
 * problems become ProviderErrors.
 */

const BASE = 'https://api.prospeo.io';

export interface ProspeoClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class ProspeoClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ProspeoClientOptions) {
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
          'X-KEY': this.apiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      throw new ProviderError(
        `Prospeo request failed: ${error instanceof Error ? error.name : 'network error'}`,
        'provider_unavailable',
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('Prospeo rejected the API key.', 'auth', false);
    }
    if (response.status === 429) {
      throw new ProviderError('Prospeo rate limit reached.', 'rate_limit', true);
    }
    if (response.status >= 500) {
      throw new ProviderError(
        `Prospeo server error (${response.status}).`,
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
        throw new ProviderError('Prospeo returned a non-JSON response.', 'unknown', true);
      }
    }

    // Domain errors arrive as HTTP 400 envelopes. Auth and credit exhaustion
    // are terminal for the whole run — surface them as typed errors. All other
    // envelopes (NO_MATCH, INVALID_DATAPOINTS, …) are returned for the caller
    // to interpret per-contact.
    const errorCode = (json as { error?: boolean; error_code?: string } | null)?.error
      ? ((json as { error_code?: string }).error_code ?? 'UNKNOWN')
      : null;
    if (errorCode === 'INVALID_API_KEY') {
      throw new ProviderError('Prospeo rejected the API key.', 'auth', false);
    }
    if (errorCode === 'INSUFFICIENT_CREDITS') {
      throw new ProviderError('Prospeo account is out of credits.', 'rate_limit', false);
    }
    return { status: response.status, json };
  }

  /** GET /account-information — free; validates the key and reports credits. */
  async getAccount(): Promise<unknown> {
    const { json } = await this.request('GET', '/account-information');
    return json;
  }

  /** POST /enrich-person — 1 credit per revealed email, 10 with mobile, 0 on no-match. */
  async enrichPerson(body: unknown): Promise<unknown> {
    const { json } = await this.request('POST', '/enrich-person', body);
    return json;
  }
}
