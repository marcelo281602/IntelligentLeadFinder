-- ============================================================================
-- 0004 Companies, contacts, sources/provenance, dedupe keys, duplicates,
--      merges, enrichment
-- ============================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  canonical_name text not null,
  normalized_name text not null,
  subtitle text,
  primary_category text,
  categories text[] not null default '{}',
  description text,
  website text,
  root_domain text,
  -- Company email ≠ decision-maker email. This is the general company email.
  primary_email text,
  primary_phone text,
  primary_phone_e164 text,
  company_linkedin_url text,
  social_profiles jsonb not null default '{}'::jsonb,
  full_address text,
  street text,
  neighborhood text,
  city text,
  region text,
  postal_code text,
  country text,
  country_code char(2),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  google_place_id text,
  google_maps_url text,
  google_fid text,
  google_cid text,
  rating numeric(3,2) check (rating between 0 and 5),
  review_count integer check (review_count >= 0),
  business_status text,
  price_range text,
  opening_hours jsonb,
  lead_status public.lead_status not null default 'new',
  owner_user_id uuid references public.user_profiles (id) on delete set null,
  -- Fields a human corrected; provider merges never overwrite these silently.
  human_edited_fields text[] not null default '{}',
  source_freshness timestamptz,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index companies_org_place_idx
  on public.companies (organization_id, google_place_id)
  where google_place_id is not null and deleted_at is null;
create index companies_org_domain_idx on public.companies (organization_id, root_domain);
create index companies_org_phone_idx on public.companies (organization_id, primary_phone_e164);
create index companies_org_name_idx on public.companies (organization_id, normalized_name);
create index companies_org_updated_idx on public.companies (organization_id, updated_at desc);

create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Deterministic dedupe keys (priority 1-3 auto-merge, 4-5 review).
create table public.company_dedupe_keys (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  priority integer not null check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (organization_id, key)
);

create index company_dedupe_keys_company_idx on public.company_dedupe_keys (company_id);

create table public.company_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete set null,
  provider public.provider_kind not null,
  connection_id uuid references public.integration_connections (id) on delete set null,
  provider_record_id text,
  source_url text,
  retrieved_at timestamptz not null,
  raw_schema_version text not null default '1',
  normalization_version text not null default '1',
  field_mapping jsonb not null default '{}'::jsonb,
  permitted_use text not null default 'internal_review',
  retention_until timestamptz,
  raw_payload_hash text,
  created_at timestamptz not null default now()
);

create index company_sources_company_idx on public.company_sources (company_id);
create unique index company_sources_provider_record_idx
  on public.company_sources (organization_id, provider, provider_record_id, run_id)
  where provider_record_id is not null;

create table public.company_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  status public.email_status not null default 'found',
  source public.provider_kind,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create table public.company_phones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  phone text not null,
  phone_e164 text,
  phone_type public.phone_type not null default 'company',
  source public.provider_kind,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, phone)
);

create table public.company_social_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  network text not null,
  url text not null,
  source public.provider_kind,
  created_at timestamptz not null default now(),
  unique (company_id, network, url)
);

-- ---------------------------------------------------------------------------
-- Contacts (decision-makers)
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  first_name text,
  last_name text,
  full_name text not null,
  job_title text,
  normalized_title text,
  seniority text,
  department text,
  -- Decision-maker work email — never conflated with the company email.
  work_email text,
  work_email_status public.email_status not null default 'not_requested',
  work_email_source public.provider_kind,
  email_verified_at timestamptz,
  phone text,
  phone_e164 text,
  phone_type public.phone_type not null default 'unknown',
  phone_source public.provider_kind,
  -- Personal profile vs employer page — stored separately, never mixed.
  personal_linkedin_url text,
  company_linkedin_url text,
  person_location text,
  provider public.provider_kind,
  provider_person_id text,
  match_confidence numeric(4,3) check (match_confidence between 0 and 1),
  human_edited_fields text[] not null default '{}',
  last_enriched_at timestamptz,
  is_fixture boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index contacts_org_idx on public.contacts (organization_id, updated_at desc);
create index contacts_company_idx on public.contacts (company_id);
create unique index contacts_provider_person_idx
  on public.contacts (organization_id, provider, provider_person_id)
  where provider_person_id is not null and deleted_at is null;

create trigger contacts_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.contact_dedupe_keys (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  priority integer not null check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (organization_id, key)
);

create index contact_dedupe_keys_contact_idx on public.contact_dedupe_keys (contact_id);

create table public.contact_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete set null,
  provider public.provider_kind not null,
  connection_id uuid references public.integration_connections (id) on delete set null,
  provider_record_id text,
  retrieved_at timestamptz not null,
  raw_schema_version text not null default '1',
  normalization_version text not null default '1',
  field_mapping jsonb not null default '{}'::jsonb,
  permitted_use text not null default 'internal_review',
  retention_until timestamptz,
  raw_payload_hash text,
  created_at timestamptz not null default now()
);

create index contact_sources_contact_idx on public.contact_sources (contact_id);

create table public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  email text not null,
  status public.email_status not null default 'found',
  source public.provider_kind,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, email)
);

create table public.contact_phones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  phone text not null,
  phone_e164 text,
  phone_type public.phone_type not null default 'unknown',
  source public.provider_kind,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, phone)
);

-- ---------------------------------------------------------------------------
-- Enrichment requests/results
-- ---------------------------------------------------------------------------
create table public.enrichment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete set null,
  provider public.provider_kind not null,
  connection_id uuid references public.integration_connections (id) on delete set null,
  config jsonb not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','running','completed','partially_completed','failed','cancelled')),
  estimate jsonb,
  hard_cap_micro_usd bigint check (hard_cap_micro_usd > 0),
  idempotency_key text,
  requested_by uuid not null references public.user_profiles (id),
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.enrichment_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.enrichment_requests (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  outcome text not null check (outcome in ('enriched','no_match','provider_error','skipped')),
  fields_returned jsonb not null default '{}'::jsonb,
  cost_micro_usd bigint not null default 0,
  created_at timestamptz not null default now()
);

create index enrichment_results_request_idx on public.enrichment_results (request_id);

-- ---------------------------------------------------------------------------
-- Duplicate review queue and merge history
-- ---------------------------------------------------------------------------
create table public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  record_a uuid not null,
  record_b uuid not null,
  match_key text not null,
  priority integer not null,
  status text not null default 'pending' check (status in ('pending','merged','dismissed')),
  resolved_by uuid references public.user_profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, entity_kind, record_a, record_b, match_key),
  check (record_a <> record_b)
);

create table public.merge_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  winner_id uuid not null,
  loser_id uuid not null,
  field_decisions jsonb not null default '{}'::jsonb,
  merged_by uuid references public.user_profiles (id),
  undo_of uuid references public.merge_events (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS — org members read; edits restricted to editing roles; ingestion writes
-- happen through the worker (service role).
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_dedupe_keys enable row level security;
alter table public.company_sources enable row level security;
alter table public.company_emails enable row level security;
alter table public.company_phones enable row level security;
alter table public.company_social_profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_dedupe_keys enable row level security;
alter table public.contact_sources enable row level security;
alter table public.contact_emails enable row level security;
alter table public.contact_phones enable row level security;
alter table public.enrichment_requests enable row level security;
alter table public.enrichment_results enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.merge_events enable row level security;

create policy companies_select on public.companies
  for select using (public.is_org_member(organization_id));
create policy companies_update on public.companies
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy contacts_select on public.contacts
  for select using (public.is_org_member(organization_id));
create policy contacts_update on public.contacts
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy company_sources_select on public.company_sources
  for select using (public.is_org_member(organization_id));
create policy contact_sources_select on public.contact_sources
  for select using (public.is_org_member(organization_id));
create policy company_emails_select on public.company_emails
  for select using (public.is_org_member(organization_id));
create policy company_phones_select on public.company_phones
  for select using (public.is_org_member(organization_id));
create policy company_social_profiles_select on public.company_social_profiles
  for select using (public.is_org_member(organization_id));
create policy contact_emails_select on public.contact_emails
  for select using (public.is_org_member(organization_id));
create policy contact_phones_select on public.contact_phones
  for select using (public.is_org_member(organization_id));

-- Dedupe keys are internal plumbing; hide from clients (service role only).

create policy enrichment_requests_select on public.enrichment_requests
  for select using (public.is_org_member(organization_id));
create policy enrichment_results_select on public.enrichment_results
  for select using (public.is_org_member(organization_id));

create policy duplicate_candidates_select on public.duplicate_candidates
  for select using (public.is_org_member(organization_id));
create policy duplicate_candidates_update on public.duplicate_candidates
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher']::public.org_role[])
  );

create policy merge_events_select on public.merge_events
  for select using (public.is_org_member(organization_id));
