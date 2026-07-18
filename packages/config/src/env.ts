import { z } from 'zod';

/**
 * Typed environment configuration.
 *
 * `serverEnv()` must only ever be called from server or worker code. It fails
 * fast with a readable message when a required variable is missing, and it is
 * the single place that reads `process.env` for secrets.
 */

const appEnvSchema = z.enum(['local', 'test', 'staging', 'production']);
export type AppEnv = z.infer<typeof appEnvSchema>;

const providerModeSchema = z.enum(['fixture', 'live']);
export type ProviderMode = z.infer<typeof providerModeSchema>;

const serverEnvSchema = z.object({
  APP_ENV: appEnvSchema.default('local'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().min(10).optional(),
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key'),
  APP_SIGNING_SECRET: z.string().min(32, 'APP_SIGNING_SECRET must be at least 32 characters'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  PROVIDER_MODE: providerModeSchema.default('fixture'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  EXPORT_STORAGE_DIR: z.string().default('.local-storage/exports'),
  // Shared secret that gates the /api/cron/worker route. Vercel Cron sends it
  // as `Authorization: Bearer <CRON_SECRET>` when this env var is set.
  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

/** Parse and cache server environment. Throws with a readable list of problems. */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${problems}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/** Reset the cache (test use only). */
export function resetServerEnvCache(): void {
  cachedServerEnv = null;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Public (browser-safe) environment. Only NEXT_PUBLIC_* values.
 * Values must be passed in explicitly because Next.js inlines them at build
 * time — reading process.env dynamically does not work in client bundles.
 */
export function parsePublicEnv(values: Record<string, string | undefined>): PublicEnv {
  const parsed = publicEnvSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error('Invalid public environment configuration');
  }
  return parsed.data;
}
