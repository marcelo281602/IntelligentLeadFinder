import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@leadfinder/config';
import { createPool } from '@leadfinder/db';
import { processQueueTick, runMaintenance } from '@leadfinder/worker/engine';
import { constantTimeEquals } from '@leadfinder/security';

/**
 * Serverless job worker, invoked by Vercel Cron (~once a minute). Each call
 * recovers stalled jobs and drains the queue for a bounded time budget, then
 * returns. Because the queue is SKIP-LOCKED and every stage is idempotent and
 * checkpointed, large runs simply finish across several invocations — no
 * always-on process required.
 *
 * Gated by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <secret>`
 * automatically when the env var is set. Manual triggers must send the same.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby functions cap at ~10s; keep headroom. Pro can raise this to 60+.
export const maxDuration = 10;

// Reuse the pool across warm invocations.
let pool: ReturnType<typeof createPool> | null = null;

export async function GET(request: NextRequest) {
  const env = serverEnv();
  if (!env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'DATABASE_URL not configured' }, { status: 500 });
  }

  // Auth: require the shared secret when configured. (In local dev without a
  // secret set, allow so `curl` can trigger it.)
  if (env.CRON_SECRET) {
    const header = request.headers.get('authorization') ?? '';
    if (!constantTimeEquals(header, `Bearer ${env.CRON_SECRET}`)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  pool ??= createPool(env.DATABASE_URL, 4);
  const startedAt = Date.now();
  try {
    await runMaintenance(pool);
    // Bounded so the whole request finishes within the Hobby ~10s cap; big
    // runs are checkpointed and simply resume on the next tick.
    const { processed } = await processQueueTick(pool, env, {
      workerId: `cron-${Math.random().toString(36).slice(2, 8)}`,
      budgetMs: 8_000,
      maxJobs: 40,
    });
    return NextResponse.json({ ok: true, processed, ms: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'tick failed' },
      { status: 500 },
    );
  }
}
