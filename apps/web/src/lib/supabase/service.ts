import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client — BYPASSES RLS. Server-side only, and only for
 * operations that genuinely need it: secret storage, job enqueueing, audit
 * writes, webhook processing. Never expose results without an explicit
 * org-scope check first.
 */
let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}
