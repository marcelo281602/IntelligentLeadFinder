import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { defaultMigrationsDir, loadMigrations } from '../migrations';

/**
 * PGlite test harness: a real Postgres (WASM) database with a Supabase-like
 * auth shim so migrations and RLS policies run unmodified and RLS can be
 * exercised as the non-superuser `authenticated` role.
 *
 * On hosted Supabase the `auth` schema, `auth.uid()`, and the `authenticated`
 * role already exist — the shim below reproduces just enough of them.
 */

const AUTH_SHIM = /* sql */ `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
  end
  $$;
  grant usage on schema public to authenticated, anon;
`;

// Supabase grants broad table privileges to `authenticated` and relies on RLS.
const GRANTS = /* sql */ `
  grant all on all tables in schema public to authenticated, anon;
  grant all on all sequences in schema public to authenticated, anon;
  grant execute on all functions in schema public to authenticated, anon;
`;

export interface TestDb {
  db: PGlite;
  /** Run SQL as the superuser (like the service role: bypasses RLS). */
  service: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  /** Run SQL as `authenticated` with the given user id in the JWT claim. */
  as: (
    userId: string,
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
  /** Create an auth user + profile; returns user id. */
  createUser: (email: string) => Promise<string>;
  /** Create an org owned by userId; returns org id. */
  createOrg: (name: string, ownerId: string) => Promise<string>;
  addMember: (orgId: string, userId: string, role: string) => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(AUTH_SHIM);
  for (const migration of loadMigrations(defaultMigrationsDir())) {
    try {
      await db.exec(migration.sql);
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`);
    }
  }
  await db.exec(GRANTS);

  const service = async (sql: string, params: unknown[] = []) =>
    (await db.query(sql, params)) as { rows: Record<string, unknown>[] };

  const as = async (userId: string, sql: string, params: unknown[] = []) => {
    // Single-connection database: emulate a scoped session, then reset.
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${userId.replaceAll("'", '')}', false);`,
    );
    try {
      return (await db.query(sql, params)) as { rows: Record<string, unknown>[] };
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };

  const createUser = async (email: string): Promise<string> => {
    const id = randomUUID();
    await service(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    // The on_auth_user_created trigger provisions user_profiles.
    return id;
  };

  const createOrg = async (name: string, ownerId: string): Promise<string> => {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
    const result = await service(
      `insert into public.organizations (name, slug, created_by) values ($1, $2, $3) returning id`,
      [name, slug, ownerId],
    );
    const orgId = result.rows[0]!.id as string;
    await service(
      `insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'owner')`,
      [orgId, ownerId],
    );
    return orgId;
  };

  const addMember = async (orgId: string, userId: string, role: string): Promise<void> => {
    await service(
      `insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, $3::public.org_role)`,
      [orgId, userId, role],
    );
  };

  return { db, service, as, createUser, createOrg, addMember, close: () => db.close() };
}
