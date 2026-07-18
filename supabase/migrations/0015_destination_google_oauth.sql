-- "Sign in with Google" as a second way to connect a Google Sheets
-- destination, alongside the existing Apps Script / webhook path.
-- Additive and backward compatible: all new columns are nullable or
-- defaulted, so the currently deployed worker (which reads only the existing
-- columns and always takes the webhook delivery path) keeps working unchanged.
--
-- For an OAuth destination:
--   connection_method  = 'google_oauth'
--   secret_envelope    = the encrypted Google REFRESH token (reused column)
--   secret_fingerprint = fingerprint of that refresh token
--   endpoint_url       = the created spreadsheet's web URL (human-facing)
--   spreadsheet_id     = the Sheets file id we append rows to
--   google_account_email = the connected account (shown in the UI)
--   sheet_tab          = worksheet/tab name (default 'Leads')
--   header_written     = whether the column header row has been written yet

alter table public.destinations
  add column if not exists connection_method text not null default 'apps_script'
    check (connection_method in ('apps_script', 'google_oauth'));

alter table public.destinations add column if not exists google_account_email text;
alter table public.destinations add column if not exists spreadsheet_id text;
alter table public.destinations add column if not exists sheet_tab text not null default 'Leads';
alter table public.destinations add column if not exists header_written boolean not null default false;
