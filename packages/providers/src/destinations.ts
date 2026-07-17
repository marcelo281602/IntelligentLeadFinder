import { createHmac } from 'node:crypto';
import type { DestinationPayload } from '@leadfinder/core';

/**
 * Deliver a destination payload over HTTPS. The body is signed with the
 * destination's shared secret so the receiver (a Google Apps Script web app,
 * n8n, Make, Zapier, or any webhook) can verify authenticity, and the secret
 * is also echoed in the payload for the simplest receivers. Only HTTPS
 * endpoints are allowed, and loopback/private hosts are refused (SSRF guard).
 */

export interface DeliverResult {
  ok: boolean;
  status: number;
  error?: string;
}

function assertSafeEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('Destination URL is not a valid URL.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Destination URL must use HTTPS.');
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) {
    throw new Error('Destination URL points to a private or loopback address.');
  }
  return url;
}

export async function deliverToDestination(params: {
  endpointUrl: string;
  secret: string;
  payload: DestinationPayload;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<DeliverResult> {
  const url = assertSafeEndpoint(params.endpointUrl);
  const body = JSON.stringify(params.payload);
  const signature = createHmac('sha256', params.secret).update(body).digest('hex');
  const fetchImpl = params.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 20_000);
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LeadFinder-Signature': `sha256=${signature}`,
        'User-Agent': 'LeadFinder-Sync/1',
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true, status: response.status };
    }
    const text = (await response.text().catch(() => '')).slice(0, 200);
    return {
      ok: false,
      status: response.status,
      error: `Destination returned ${response.status}${text ? `: ${text}` : ''}`,
    };
  } catch (error) {
    // Surface the real cause (DNS/refused/timeout) — fetch wraps network
    // failures in a generic TypeError, so the useful detail is on .cause.
    let detail = 'Delivery failed';
    if (error instanceof Error) {
      const cause = (error as { cause?: { message?: string; code?: string } }).cause;
      const reason = cause?.code ?? cause?.message ?? error.message ?? error.name;
      detail =
        error.name === 'AbortError'
          ? 'Destination did not respond in time.'
          : `Delivery failed: ${reason}`;
    }
    return { ok: false, status: 0, error: detail };
  } finally {
    clearTimeout(timer);
  }
}
