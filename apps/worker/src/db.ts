/**
 * Minimal query interface implemented by both pg.Pool (production) and
 * PGlite (tests). Worker code only depends on this, which keeps the entire
 * pipeline testable without Docker.
 *
 * IMPORTANT: this connection operates at service level (bypasses RLS), so
 * every query must scope by organization_id explicitly.
 */
export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function one<T = Record<string, unknown>>(
  db: Db,
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const { rows } = await db.query(text, params);
  return (rows[0] as T | undefined) ?? null;
}
