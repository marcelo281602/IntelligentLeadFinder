-- ============================================================================
-- 0008 Role grants for the Supabase data API
-- ============================================================================
-- Tables created over a direct connection do not automatically receive the
-- grants the Supabase REST layer expects. Privileges are granted broadly to
-- the API roles here; ROW LEVEL SECURITY (0001–0006) remains the enforcement
-- layer — deny-all tables (secrets, job queue, webhook inbox, dedupe keys)
-- stay invisible because they have no policies.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

-- anon: same convention as Supabase defaults — RLS filters everything
-- (every policy requires auth.uid(), so anonymous sessions see zero rows).
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon;

-- Future tables created by postgres (later migrations) inherit the grants.
alter default privileges for role postgres in schema public
  grant all on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant select on tables to anon;

-- Make the REST layer pick up new objects immediately.
notify pgrst, 'reload schema';
