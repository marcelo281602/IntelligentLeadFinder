-- ============================================================================
-- 0002 Integrations: connections, encrypted secrets, health, rate cards,
--      capabilities, feature flags, commercial-use approvals, quota policies
-- ============================================================================

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.provider_kind not null,
  label text not null default 'Default' check (char_length(label) between 1 and 100),
  environment text not null default 'production' check (environment in ('production','sandbox')),
  status public.connection_status not null default 'disconnected',
  -- Non-secret configuration only (actor id, plan tier, default caps...).
  config jsonb not null default '{}'::jsonb,
  -- Reference to the active secret version. The secret itself lives in
  -- integration_secret_versions which clients can never read.
  active_secret_version_id uuid,
  secret_fingerprint text,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_error text,
  last_used_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, provider, label)
);

create trigger integration_connections_updated_at
  before update on public.integration_connections
  for each row execute function public.set_updated_at();

create table public.integration_secret_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.integration_connections (id) on delete cascade,
  version integer not null,
  -- Envelope-encrypted credential (AES-256-GCM, DEK wrapped by master key).
  envelope text not null,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (connection_id, version)
);

alter table public.integration_connections
  add constraint integration_connections_secret_fk
  foreign key (active_secret_version_id)
  references public.integration_secret_versions (id) deferrable initially deferred;

create table public.integration_health_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.integration_connections (id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  latency_ms integer,
  detail text
);

create index integration_health_checks_conn_idx
  on public.integration_health_checks (connection_id, checked_at desc);

-- Global, versioned provider price lists. Old versions are never deleted so
-- historical run estimates remain explainable.
create table public.provider_rate_cards (
  id uuid primary key default gen_random_uuid(),
  provider public.provider_kind not null,
  scope text not null,
  plan_tier text not null,
  version integer not null,
  currency char(3) not null default 'USD',
  last_verified_at date not null,
  source_url text not null,
  -- event key -> micro-USD per single unit
  events jsonb not null,
  assumptions jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, scope, plan_tier, version)
);

create table public.provider_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  connection_id uuid references public.integration_connections (id) on delete cascade,
  provider public.provider_kind not null,
  capabilities jsonb not null,
  refreshed_at timestamptz not null default now(),
  unique (connection_id)
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (key, organization_id)
);

-- Commercial-use gates (e.g. Apollo). The integration stays unavailable to
-- workspaces until an approval row with supporting metadata exists.
create table public.commercial_use_approvals (
  id uuid primary key default gen_random_uuid(),
  provider public.provider_kind not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  agreement_reference text,
  permitted_use text,
  review_by date,
  notes text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (provider, organization_id)
);

create table public.quota_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade unique,
  monthly_budget_micro_usd bigint check (monthly_budget_micro_usd > 0),
  per_run_cap_micro_usd bigint check (per_run_cap_micro_usd > 0),
  daily_cap_micro_usd bigint check (daily_cap_micro_usd > 0),
  monthly_company_record_quota integer check (monthly_company_record_quota > 0),
  max_results_per_run integer not null default 1000 check (max_results_per_run between 1 and 5000),
  warn_at_percent integer not null default 80 check (warn_at_percent between 1 and 100),
  updated_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger quota_policies_updated_at
  before update on public.quota_policies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.integration_connections enable row level security;
alter table public.integration_secret_versions enable row level security;
alter table public.integration_health_checks enable row level security;
alter table public.provider_rate_cards enable row level security;
alter table public.provider_capabilities enable row level security;
alter table public.feature_flags enable row level security;
alter table public.commercial_use_approvals enable row level security;
alter table public.quota_policies enable row level security;

-- Connections: any member may read status (never contains the secret);
-- only owner/admin manage. Secret writes go through the server which also
-- re-encrypts; the envelope itself is not on this table.
create policy integration_connections_select on public.integration_connections
  for select using (public.is_org_member(organization_id));
create policy integration_connections_insert on public.integration_connections
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
    and created_by = auth.uid()
  );
create policy integration_connections_update on public.integration_connections
  for update using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy integration_connections_delete on public.integration_connections
  for delete using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- Secret versions: NO client access whatsoever. Only the service role
-- (server/worker) reads or writes envelopes. Deny-all = no policies.

-- Health checks: members read; writes are server-side.
create policy integration_health_checks_select on public.integration_health_checks
  for select using (public.is_org_member(organization_id));

-- Rate cards are global reference data: readable by any authenticated user;
-- published only by the platform (service role).
create policy provider_rate_cards_select on public.provider_rate_cards
  for select using (auth.uid() is not null);

create policy provider_capabilities_select on public.provider_capabilities
  for select using (organization_id is null or public.is_org_member(organization_id));

-- Feature flags: global rows readable by all; org rows by members.
create policy feature_flags_select on public.feature_flags
  for select using (organization_id is null or public.is_org_member(organization_id));

-- Commercial approvals: org-scoped rows visible to org owners/admins;
-- global rows visible to authenticated users (they gate UI affordances).
create policy commercial_use_approvals_select on public.commercial_use_approvals
  for select using (
    (organization_id is null and auth.uid() is not null)
    or (organization_id is not null
        and public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  );

-- Quotas: members read; owners update (raising limits re-authenticates in app).
create policy quota_policies_select on public.quota_policies
  for select using (public.is_org_member(organization_id));
create policy quota_policies_update on public.quota_policies
  for update using (public.has_org_role(organization_id, array['owner']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner']::public.org_role[]));
