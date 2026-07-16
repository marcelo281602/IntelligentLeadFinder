import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Ordered list of SQL migrations from supabase/migrations. */
export interface Migration {
  name: string;
  sql: string;
}

export function loadMigrations(migrationsDir: string): Migration[] {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files.map((name) => ({
    name,
    sql: readFileSync(join(migrationsDir, name), 'utf8'),
  }));
}

/** Resolve the repo's migrations directory relative to this package. */
export function defaultMigrationsDir(): string {
  return join(import.meta.dirname, '..', '..', '..', 'supabase', 'migrations');
}
