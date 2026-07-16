-- ============================================================================
-- 0006 Audit logs and security events — append-only
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid,
  actor_type text not null default 'user' check (actor_type in ('user','system','worker','super_admin')),
  action text not null,
  entity_kind text,
  entity_id uuid,
  -- Redacted before write; never contains secrets or full PII payloads.
  details jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_org_time_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  details jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index security_events_time_idx on public.security_events (created_at desc);

alter table public.audit_logs enable row level security;
alter table public.security_events enable row level security;

-- Append-only: org owners/admins may read their org's audit trail. No client
-- INSERT/UPDATE/DELETE policies exist — writes go through the server (service
-- role), and nothing can rewrite history through the API.
create policy audit_logs_select on public.audit_logs
  for select using (
    organization_id is not null
    and public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
  );

-- Security events are platform-level: super-admin reads only (service role
-- handles writes). Regular org users never see other tenants' events.
create policy security_events_select on public.security_events
  for select using (public.is_super_admin());
