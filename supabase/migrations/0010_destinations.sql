-- ============================================================================
-- 0010 Destinations: persistent lead sync targets (Google Sheets, webhooks)
-- ============================================================================
-- A destination is a standing sync target for a workspace's leads — the
-- client's own database (a Google Sheet via Apps Script, or an n8n/Make/
-- Zapier/generic webhook). When auto_sync is on, every completed run pushes
-- its new accepted leads to the destination. Deliveries are tracked per
-- record so the same lead is never appended twice, even across re-runs.

-- Extend the job kind enum for the sync worker.
alter type public.job_kind add value if not exists 'sync_destination';

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('google_sheets','webhook','n8n','make','zapier')),
  name text not null check (char_length(name) between 1 and 120),
  -- The HTTPS endpoint we POST leads to (Apps Script web-app URL or webhook).
  endpoint_url text not null,
  -- Shared secret: sent in the payload AND used to sign the body (HMAC).
  -- Encrypted at rest; a fingerprint is shown in the UI. The client pastes
  -- the same secret into their Apps Script / webhook verifier.
  secret_envelope text not null,
  secret_fingerprint text not null,
  -- Push decision-maker contact columns too (else companies only).
  include_contacts boolean not null default false,
  -- Automatically sync new leads when a run completes.
  auto_sync boolean not null default true,
  status public.connection_status not null default 'connected',
  last_sync_at timestamptz,
  last_error text,
  synced_count integer not null default 0,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);

create index destinations_org_idx on public.destinations (organization_id) where deleted_at is null;

create trigger destinations_updated_at
  before update on public.destinations
  for each row execute function public.set_updated_at();

-- Idempotent per-record delivery ledger. The unique constraint is the
-- guarantee that a company/contact is appended to a given destination at most
-- once, no matter how many runs re-discover it.
create table public.destination_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  entity_id uuid not null,
  run_id uuid references public.search_runs (id) on delete set null,
  delivered_at timestamptz not null default now(),
  unique (destination_id, entity_kind, entity_id)
);

create index destination_deliveries_dest_idx
  on public.destination_deliveries (destination_id, delivered_at desc);

-- ---------------------------------------------------------------------------
-- RLS: members read destinations (never the secret envelope — that column is
-- only read by the worker/service role). Owner/admin/operations manage.
-- The secret_envelope is not deny-all at the table level because the row is
-- useful to members, but the web layer never selects the envelope column;
-- only the service-role worker does.
-- ---------------------------------------------------------------------------
alter table public.destinations enable row level security;
alter table public.destination_deliveries enable row level security;

create policy destinations_select on public.destinations
  for select using (public.is_org_member(organization_id));
create policy destinations_insert on public.destinations
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','operations']::public.org_role[])
    and created_by = auth.uid()
  );
create policy destinations_update on public.destinations
  for update using (
    public.has_org_role(organization_id, array['owner','admin','operations']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','operations']::public.org_role[])
  );

create policy destination_deliveries_select on public.destination_deliveries
  for select using (public.is_org_member(organization_id));

-- Grants for the Supabase data API (direct-connection DDL needs these).
grant all on public.destinations to authenticated, service_role;
grant all on public.destination_deliveries to authenticated, service_role;
grant select on public.destinations to anon;
grant select on public.destination_deliveries to anon;

notify pgrst, 'reload schema';
