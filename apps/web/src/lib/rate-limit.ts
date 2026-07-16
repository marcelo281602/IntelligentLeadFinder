import 'server-only';

/**
 * Fixed-window in-memory rate limiter for mutation actions. Per-instance
 * (adequate for a single web instance / dev; production hardening moves this
 * to Postgres or an edge KV — documented in docs/SECURITY.md).
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt < now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.resetAt < now) windows.delete(k);
  }
  return entry.count <= limit;
}

export class RateLimitError extends Error {
  constructor() {
    super('Too many requests — please slow down.');
    this.name = 'RateLimitError';
  }
}

export function enforceRateLimit(key: string, limit = 30, windowMs = 60_000): void {
  if (!checkRateLimit(key, limit, windowMs)) throw new RateLimitError();
}
