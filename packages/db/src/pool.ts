import pg from 'pg';

/**
 * Shared Postgres pool factory for the worker (direct DATABASE_URL access,
 * service level — bypasses RLS by design; all tenant scoping in worker SQL
 * must therefore filter by organization_id explicitly).
 */
export function createPool(databaseUrl: string, max = 10): pg.Pool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export type { Pool, PoolClient } from 'pg';
