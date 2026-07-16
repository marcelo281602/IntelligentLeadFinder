-- ============================================================================
-- 0001 Foundations: enums, helper functions, organizations, users, memberships
-- ============================================================================
-- Conventions:
--   * Every tenant-owned table has organization_id uuid NOT NULL + RLS.
--   * RLS derives access from verified membership (auth.uid()), never from
--     client-supplied organization ids.
--   * The service role (server/worker only) bypasses RLS by design.
--   * Money is integer micro-USD (1e6 = $1). Timestamps are UTC timestamptz.

-- ---------------------------------------------------------------------------
-- Enums (keep in sync with packages/core/src/types.ts)
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner','admin','researcher','operations','viewer');

create type public.run_status as enum (
  'draft','estimating','awaiting_confirmation','queued','starting','running',
  'ingesting','normalizing','deduplicating','enriching','export_ready',
  'completed','partially_completed','cancellation_requested','cancelled','failed'
);

create type public.email_status as enum (
  'found','verified','unverified','catch_all','inferred','invalid','unavailable',
  'provider_error','not_requested'
);

create type public.phone_type as enum ('company','direct','mobile','unknown');

create type public.lead_status as enum (
  'new','reviewing','qualified','not_a_fit','contacted_externally','suppressed','archived'
);

create type public.provider_kind as enum ('apify','outscraper','apollo','prospeo','fixture');

create type public.job_kind as enum (
  'run_search','ingest_dataset','normalize_run','dedupe_run','enrich_run',
  'reconcile_costs','generate_export','test_connection','retention_sweep'
);

create type public.job_status as enum (
  'pending','running','succeeded','failed','dead_letter','cancelled'
);

create type public.export_status as enum ('pending','generating','ready','failed','purged');

create type public.connection_status as enum ('connected','error','disconnected');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizations & users
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  default_country_code char(2),
  default_language text not null default 'en',
  currency char(3) not null default 'USD',
  data_retention_days integer not null default 365 check (data_retention_days between 30 and 3650),
  raw_payload_retention_days integer not null default 30 check (raw_payload_retention_days between 1 and 90),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Profile row per auth user. id mirrors auth.users.id.
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  is_super_admin boolean not null default false,
  active_organization_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Auto-provision a profile when an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  role public.org_role not null,
  can_export boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_memberships_user_idx on public.organization_memberships (user_id);

create trigger organization_memberships_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helper functions (SECURITY DEFINER so RLS policies can use them
-- without recursive policy evaluation on the memberships table itself).
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.org_role_of(org uuid)
returns public.org_role
language sql
security definer
stable
set search_path = public
as $$
  select m.role from public.organization_memberships m
  where m.organization_id = org and m.user_id = auth.uid();
$$;

create or replace function public.has_org_role(org uuid, roles public.org_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.org_role_of(org) = any (roles);
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_super_admin from public.user_profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null,
  token_hash text not null unique,
  invited_by uuid not null references public.user_profiles (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  check (role <> 'owner')
);

create index invitations_org_idx on public.invitations (organization_id);

-- Static documentation of the role → permission matrix (authoritative copy
-- lives in packages/core/src/permissions.ts; this table supports reporting).
create table public.role_permissions (
  role public.org_role not null,
  permission text not null,
  primary key (role, permission)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.role_permissions enable row level security;

-- Organizations: members read; owners update; creation via server (service role).
create policy organizations_select on public.organizations
  for select using (public.is_org_member(id));
create policy organizations_update on public.organizations
  for update using (public.has_org_role(id, array['owner']::public.org_role[]))
  with check (public.has_org_role(id, array['owner']::public.org_role[]));

-- Profiles: user reads/updates own row only.
create policy user_profiles_select on public.user_profiles
  for select using (id = auth.uid());
create policy user_profiles_update on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: members can see the roster of their orgs; owners/admins manage
-- (server enforces the finer invitable-roles matrix).
create policy memberships_select on public.organization_memberships
  for select using (public.is_org_member(organization_id));
create policy memberships_insert on public.organization_memberships
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
    and role <> 'owner'
  );
create policy memberships_update on public.organization_memberships
  for update using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );
create policy memberships_delete on public.organization_memberships
  for delete using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
    or user_id = auth.uid() -- members may leave
  );

-- Invitations: managed by owner/admin of the org.
create policy invitations_select on public.invitations
  for select using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy invitations_insert on public.invitations
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
    and invited_by = auth.uid()
  );
create policy invitations_delete on public.invitations
  for delete using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Role permissions: readable by any authenticated user.
create policy role_permissions_select on public.role_permissions
  for select using (auth.uid() is not null);
