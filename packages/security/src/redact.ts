/**
 * Redaction utilities. Applied to anything that leaves the trust boundary:
 * logs, stored provider response metadata, error reports, audit details.
 */

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|api[-_]?key|authorization|auth|credential|cookie|session|private[-_]?key|service[-_]?role)/i;

const SENSITIVE_QUERY_PARAMS = ['token', 'apikey', 'api_key', 'key', 'secret', 'signature', 'sig'];

export const REDACTED = '[REDACTED]';

/** Strip sensitive query parameters from a URL string. Non-URLs pass through. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    let changed = false;
    for (const param of SENSITIVE_QUERY_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, REDACTED);
        changed = true;
      }
    }
    return changed ? url.toString() : value;
  } catch {
    return value;
  }
}

/** Redact bearer tokens and obvious secrets inside free text. */
export function redactText(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`)
    .replace(/(apify_api_)[A-Za-z0-9]{8,}/gi, `$1${REDACTED}`)
    .replace(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g, REDACTED);
}

/**
 * Deep-redact an arbitrary JSON-like value. Keys matching the sensitive
 * pattern are masked entirely; string values are scrubbed for embedded
 * tokens and URL query secrets. Depth-limited to avoid cycles.
 */
export function redactObject<T>(value: T, depth = 0): T {
  if (depth > 8) return '[MAX-DEPTH]' as unknown as T;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactText(redactUrl(value)) as unknown as T;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item, depth + 1)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = redactObject(val, depth + 1);
    }
  }
  return result as unknown as T;
}
