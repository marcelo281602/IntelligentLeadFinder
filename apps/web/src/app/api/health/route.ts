import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

/** Liveness + dependency check. No secrets, no tenant data. */
export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = { web: 'ok', database: 'error' };
  try {
    const service = createServiceClient();
    const { error } = await service.from('feature_flags').select('key').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }
  const healthy = Object.values(checks).every((c) => c === 'ok');
  return NextResponse.json(
    { status: healthy ? 'healthy' : 'degraded', checks, ts: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
