-- ============================================================================
-- 0009 Client plans & 14-day trials
-- ============================================================================
-- Every workspace starts on a 14-day trial. Paid provider runs are blocked
-- after expiry (fixture/test runs stay available). Only super-admins manage
-- plans and trial extensions — through the admin console, fully audited.

alter table public.organizations
  add column plan text not null default 'trial'
    check (plan in ('trial', 'active', 'suspended')),
  add column trial_ends_at timestamptz not null default (now() + interval '14 days');

-- Existing workspaces: date the trial from their creation.
update public.organizations
  set trial_ends_at = created_at + interval '14 days';

create index organizations_plan_idx on public.organizations (plan, trial_ends_at);

notify pgrst, 'reload schema';
