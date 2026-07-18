import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Export file storage on Supabase Storage (private bucket). Works identically
 * from the standalone worker and from Vercel serverless — unlike local disk,
 * which is ephemeral per invocation. Files are written by the export job and
 * served to users only through short-lived signed URLs.
 */

const BUCKET = 'exports';
let client: SupabaseClient | null = null;
let bucketReady = false;

function svc(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase Storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const s = svc();
  const { data } = await s.storage.getBucket(BUCKET);
  if (!data) {
    // Private bucket; a modest per-file size cap keeps abuse bounded.
    await s.storage.createBucket(BUCKET, { public: false, fileSizeLimit: '50MB' });
  }
  bucketReady = true;
}

export interface StoredExport {
  path: string;
  bytes: number;
}

/** Upload the generated export and return its storage path. */
export async function uploadExport(params: {
  orgId: string;
  exportId: string;
  format: 'csv' | 'xlsx';
  body: Buffer;
  contentType: string;
}): Promise<StoredExport> {
  await ensureBucket();
  const path = `${params.orgId}/${params.exportId}.${params.format}`;
  const { error } = await svc()
    .storage.from(BUCKET)
    .upload(path, params.body, { contentType: params.contentType, upsert: true });
  if (error) throw new Error(`Export upload failed: ${error.message}`);
  return { path, bytes: params.body.byteLength };
}

/** Remove a purged export object. Best-effort — the DB status is authoritative. */
export async function removeExport(path: string): Promise<void> {
  try {
    await svc().storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}

export const EXPORT_BUCKET = BUCKET;
