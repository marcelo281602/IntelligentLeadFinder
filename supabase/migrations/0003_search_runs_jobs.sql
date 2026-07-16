-- ============================================================================
-- 0003 Search projects/queries, runs, stages, durable jobs, webhook inbox,
--      raw provider records
-- ============================================================================

create table public.search_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger search_projects_updated_at
  before update on public.search_projects
  for each row execute function public.set_updated_at();

create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.search_projects (id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  -- Validated SearchConfig (packages/core/src/search-config.ts)
  config jsonb not null,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index search_queries_org_idx on public.search_queries (organization_id, created_at desc);

create trigger search_queries_updated_at
  before update on public.search_queries
  for each row execute function public.set_updated_at();

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  search_query_id uuid not null references public.search_queries (id) on delete cascade,
  status public.run_status not null default 'draft',
  -- Immutable snapshot of the config this run was confirmed with.
  config_snapshot jsonb not null,
  provider public.provider_kind not null,
  connection_id uuid references public.integration_connections (id) on delete set null,
  rate_card_id uuid references public.provider_rate_cards (id),
  estimate jsonb,
  estimate_low_micro_usd bigint,
  estimate_expected_micro_usd bigint,
  estimate_high_micro_usd bigint,
  -- Server-calculated hard provider cost cap. A run may never start without it.
  hard_cap_micro_usd bigint check (hard_cap_micro_usd > 0),
  confirmed_by uuid references public.user_profiles (id),
  confirmed_at timestamptz,
  idempotency_key text,
  provider_run_id text,
  provider_dataset_id text,
  callback_token_hash text,
  current_stage text,
  checkpoint jsonb not null default '{}'::jsonb,
  discovered_count integer not null default 0,
  ingested_count integer not null default 0,
  accepted_count integer not null default 0,
  duplicate_count integer not null default 0,
  rejected_count integer not null default 0,
  enriched_count integer not null default 0,
  failed_count integer not null default 0,
  actual_cost_micro_usd bigint,
  cost_reconciled_at timestamptz,
  error_summary text,
  -- Redacted provider response metadata for debugging (never secrets).
  provider_meta jsonb not null default '{}'::jsonb,
  is_fixture boolean not null default false,
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create index search_runs_org_status_idx on public.search_runs (organization_id, status, created_at desc);
create index search_runs_provider_run_idx on public.search_runs (provider, provider_run_id);

create trigger search_runs_updated_at
  before update on public.search_runs
  for each row execute function public.set_updated_at();

create table public.search_run_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null references public.search_runs (id) on delete cascade,
  stage text not null,
  attempt integer not null default 1,
  status text not null default 'running' check (status in ('running','succeeded','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);

create index search_run_stages_run_idx on public.search_run_stages (run_id, started_at);

-- ---------------------------------------------------------------------------
-- Durable job queue (provider_jobs). Claimed with FOR UPDATE SKIP LOCKED by
-- the worker. Service-role only — clients never touch this table.
-- ---------------------------------------------------------------------------
create table public.provider_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete cascade,
  export_id uuid,
  kind public.job_kind not null,
  status public.job_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index provider_jobs_claim_idx
  on public.provider_jobs (status, run_after, priority)
  where status = 'pending';
create index provider_jobs_run_idx on public.provider_jobs (run_id);

create trigger provider_jobs_updated_at
  before update on public.provider_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Webhook inbox: persist first, verify, then process asynchronously.
-- dedupe_key gives replay protection (unique delivery identity).
-- ---------------------------------------------------------------------------
create table public.provider_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider public.provider_kind not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  connection_id uuid references public.integration_connections (id) on delete set null,
  run_id uuid references public.search_runs (id) on delete set null,
  provider_run_id text,
  event_type text,
  -- Redacted before persistence.
  payload jsonb not null,
  dedupe_key text not null unique,
  signature_ok boolean,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index provider_webhook_inbox_unprocessed_idx
  on public.provider_webhook_inbox (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- Raw provider records: provenance with short retention. Redacted payloads,
-- never credentials.
-- ---------------------------------------------------------------------------
create table public.provider_raw_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid not null references public.search_runs (id) on delete cascade,
  provider public.provider_kind not null,
  provider_record_id text,
  -- Position in the provider dataset: normalization processes records in
  -- dataset order so merge outcomes are deterministic.
  ordinal integer not null default 0,
  page_number integer,
  payload jsonb not null,
  payload_hash text not null,
  schema_version text not null default '1',
  retrieved_at timestamptz not null default now(),
  retention_until timestamptz not null,
  unique (run_id, payload_hash)
);

create index provider_raw_records_run_idx on public.provider_raw_records (run_id, ordinal);
create index provider_raw_records_retention_idx on public.provider_raw_records (retention_until);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.search_projects enable row level security;
alter table public.search_queries enable row level security;
alter table public.search_runs enable row level security;
alter table public.search_run_stages enable row level security;
alter table public.provider_jobs enable row level security;
alter table public.provider_webhook_inbox enable row level security;
alter table public.provider_raw_records enable row level security;

create policy search_projects_select on public.search_projects
  for select using (public.is_org_member(organization_id));
create policy search_projects_write on public.search_projects
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
    and created_by = auth.uid()
  );

create policy search_queries_select on public.search_queries
  for select using (public.is_org_member(organization_id));
create policy search_queries_insert on public.search_queries
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
    and created_by = auth.uid()
  );
create policy search_queries_update on public.search_queries
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
  );
create policy search_queries_delete on public.search_queries
  for delete using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

-- Runs: members read. Draft creation allowed for run-capable roles; all state
-- transitions after confirmation happen server-side (service role) so that
-- caps, idempotency and the state machine cannot be bypassed.
create policy search_runs_select on public.search_runs
  for select using (public.is_org_member(organization_id));
create policy search_runs_insert on public.search_runs
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
    and created_by = auth.uid()
    and status = 'draft'
  );

create policy search_run_stages_select on public.search_run_stages
  for select using (public.is_org_member(organization_id));

-- provider_jobs: deny-all for clients (no policies) — service role only.

-- webhook inbox: deny-all for clients (no policies) — service role only.

-- raw records: readable by org owners/admins for debugging provenance.
create policy provider_raw_records_select on public.provider_raw_records
  for select using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );
