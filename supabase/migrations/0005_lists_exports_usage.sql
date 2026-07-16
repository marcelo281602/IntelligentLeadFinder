-- ============================================================================
-- 0005 Lists, tags, notes, custom fields, exports, destinations, usage,
--      cost ledger, suppression, DSRs, notifications
-- ============================================================================

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  kind text not null default 'static' check (kind in ('static','smart')),
  smart_filter jsonb,
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name)
);

create trigger lists_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create table public.list_companies (
  list_id uuid not null references public.lists (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  added_by uuid references public.user_profiles (id),
  added_at timestamptz not null default now(),
  primary key (list_id, company_id)
);

create table public.list_contacts (
  list_id uuid not null references public.lists (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  added_by uuid references public.user_profiles (id),
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.company_tags (
  tag_id uuid not null references public.tags (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (tag_id, company_id)
);

create table public.contact_tags (
  tag_id uuid not null references public.tags (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary key (tag_id, contact_id)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact','list','run')),
  entity_id uuid not null,
  body text not null check (char_length(body) between 1 and 10000),
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index notes_entity_idx on public.notes (organization_id, entity_kind, entity_id);

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,60}$'),
  label text not null,
  field_type text not null check (field_type in ('text','number','date','boolean','select')),
  options jsonb,
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, entity_kind, key)
);

create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions (id) on delete cascade,
  entity_id uuid not null,
  value jsonb,
  updated_by uuid references public.user_profiles (id),
  updated_at timestamptz not null default now(),
  unique (definition_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  format text not null check (format in ('csv','xlsx')),
  status public.export_status not null default 'pending',
  -- Column selection, renames, scope (list/current filter/ids), flags.
  config jsonb not null,
  includes_personal_data boolean not null default false,
  verified_only boolean not null default false,
  include_source_metadata boolean not null default false,
  row_count integer,
  file_path text,
  file_bytes bigint,
  error text,
  requested_by uuid not null references public.user_profiles (id),
  confirmed_at timestamptz,
  generated_at timestamptz,
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  expires_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exports_org_idx on public.exports (organization_id, created_at desc);

create trigger exports_updated_at
  before update on public.exports
  for each row execute function public.set_updated_at();

create table public.export_items (
  export_id uuid not null references public.exports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  entity_id uuid not null,
  primary key (export_id, entity_kind, entity_id)
);

-- ---------------------------------------------------------------------------
-- Destination syncs (feature-flagged; adapters land in a later phase)
-- ---------------------------------------------------------------------------
create table public.destination_syncs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  destination text not null check (destination in ('google_sheets','webhook','n8n','make','zapier')),
  status text not null default 'pending'
    check (status in ('pending','confirmed','running','completed','partially_completed','failed','cancelled')),
  config jsonb not null,
  idempotency_key text,
  row_count integer,
  requested_by uuid not null references public.user_profiles (id),
  confirmed_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.destination_sync_items (
  id uuid primary key default gen_random_uuid(),
  sync_id uuid not null references public.destination_syncs (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_kind text not null check (entity_kind in ('company','contact')),
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  remote_object_id text,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Usage ledger and cost reconciliation
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete set null,
  export_id uuid references public.exports (id) on delete set null,
  user_id uuid references public.user_profiles (id) on delete set null,
  provider public.provider_kind,
  feature text not null,
  quantity numeric not null default 1,
  unit text not null default 'unit',
  cost_micro_usd bigint not null default 0,
  occurred_at timestamptz not null default now(),
  -- Idempotent ledger writes: retries must not double-charge.
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index usage_events_org_time_idx on public.usage_events (organization_id, occurred_at desc);
create index usage_events_run_idx on public.usage_events (run_id);

create table public.cost_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  run_id uuid references public.search_runs (id) on delete cascade unique,
  provider public.provider_kind not null,
  estimated_micro_usd bigint not null default 0,
  capped_micro_usd bigint,
  actual_micro_usd bigint,
  variance_micro_usd bigint,
  variance_explanation text,
  charged_event_counts jsonb not null default '{}'::jsonb,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger cost_ledger_updated_at
  before update on public.cost_ledger
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Suppression + data-subject requests
-- ---------------------------------------------------------------------------
create table public.suppression_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('email','domain','phone','company_name')),
  value text not null,
  reason text,
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  unique (organization_id, kind, value)
);

create table public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_type text not null check (request_type in ('access','deletion','correction')),
  subject_reference text not null,
  status text not null default 'open' check (status in ('open','in_progress','completed','rejected')),
  notes text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by uuid references public.user_profiles (id)
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.user_profiles (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (organization_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.lists enable row level security;
alter table public.list_companies enable row level security;
alter table public.list_contacts enable row level security;
alter table public.tags enable row level security;
alter table public.company_tags enable row level security;
alter table public.contact_tags enable row level security;
alter table public.notes enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.exports enable row level security;
alter table public.export_items enable row level security;
alter table public.destination_syncs enable row level security;
alter table public.destination_sync_items enable row level security;
alter table public.usage_events enable row level security;
alter table public.cost_ledger enable row level security;
alter table public.suppression_entries enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.notifications enable row level security;

-- Lists/tags/notes: members read; list-capable roles write.
create policy lists_select on public.lists
  for select using (public.is_org_member(organization_id));
create policy lists_write on public.lists
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
    and created_by = auth.uid()
  );
create policy lists_update on public.lists
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy lists_delete on public.lists
  for delete using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy list_companies_select on public.list_companies
  for select using (public.is_org_member(organization_id));
create policy list_companies_write on public.list_companies
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy list_companies_delete on public.list_companies
  for delete using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy list_contacts_select on public.list_contacts
  for select using (public.is_org_member(organization_id));
create policy list_contacts_write on public.list_contacts
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy list_contacts_delete on public.list_contacts
  for delete using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy tags_select on public.tags
  for select using (public.is_org_member(organization_id));
create policy tags_write on public.tags
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy tags_delete on public.tags
  for delete using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

create policy company_tags_all_select on public.company_tags
  for select using (public.is_org_member(organization_id));
create policy company_tags_write on public.company_tags
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy company_tags_delete on public.company_tags
  for delete using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy contact_tags_select on public.contact_tags
  for select using (public.is_org_member(organization_id));
create policy contact_tags_write on public.contact_tags
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy contact_tags_delete on public.contact_tags
  for delete using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

create policy notes_select on public.notes
  for select using (public.is_org_member(organization_id));
create policy notes_write on public.notes
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
    and created_by = auth.uid()
  );
create policy notes_update on public.notes
  for update using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy custom_field_definitions_select on public.custom_field_definitions
  for select using (public.is_org_member(organization_id));
create policy custom_field_definitions_write on public.custom_field_definitions
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

create policy custom_field_values_select on public.custom_field_values
  for select using (public.is_org_member(organization_id));
create policy custom_field_values_write on public.custom_field_values
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy custom_field_values_update on public.custom_field_values
  for update using (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );

-- Exports: creation/permission checks happen server-side; members can read
-- rows for their org. File access only via short-lived signed URLs.
create policy exports_select on public.exports
  for select using (public.is_org_member(organization_id));
create policy export_items_select on public.export_items
  for select using (public.is_org_member(organization_id));

create policy destination_syncs_select on public.destination_syncs
  for select using (public.is_org_member(organization_id));
create policy destination_sync_items_select on public.destination_sync_items
  for select using (public.is_org_member(organization_id));

-- Usage/cost: members read; only the worker writes (service role).
create policy usage_events_select on public.usage_events
  for select using (public.is_org_member(organization_id));
create policy cost_ledger_select on public.cost_ledger
  for select using (public.is_org_member(organization_id));

create policy suppression_entries_select on public.suppression_entries
  for select using (public.is_org_member(organization_id));
create policy suppression_entries_write on public.suppression_entries
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin','researcher','operations']::public.org_role[])
  );
create policy suppression_entries_delete on public.suppression_entries
  for delete using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

create policy data_subject_requests_select on public.data_subject_requests
  for select using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );
create policy data_subject_requests_write on public.data_subject_requests
  for insert with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );
create policy data_subject_requests_update on public.data_subject_requests
  for update using (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  ) with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

-- Notifications: user sees own + org-wide rows for their orgs; may mark read.
create policy notifications_select on public.notifications
  for select using (
    public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid())
  );
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
