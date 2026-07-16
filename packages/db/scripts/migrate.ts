import pg from 'pg';
import { defaultMigrationsDir, loadMigrations } from '../src/migrations';

/**
 * Apply pending SQL migrations to DATABASE_URL in filename order.
 * Tracks applied migrations in public.schema_migrations. Each migration runs
 * in its own transaction. Never edits or reorders applied migrations —
 * add new files instead.
 *
 * Usage: DATABASE_URL=postgres://... npm run db:migrate
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `create table if not exists public.schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );
    const applied = new Set(
      (await client.query(`select name from public.schema_migrations`)).rows.map(
        (r: { name: string }) => r.name,
      ),
    );
    const migrations = loadMigrations(defaultMigrationsDir());
    let count = 0;
    for (const migration of migrations) {
      if (applied.has(migration.name)) continue;
      console.log(`Applying ${migration.name} ...`);
      await client.query('begin');
      try {
        await client.query(migration.sql);
        await client.query(`insert into public.schema_migrations (name) values ($1)`, [
          migration.name,
        ]);
        await client.query('commit');
        count += 1;
      } catch (error) {
        await client.query('rollback');
        console.error(`FAILED: ${migration.name}`);
        throw error;
      }
    }
    console.log(count === 0 ? 'Database is up to date.' : `Applied ${count} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
