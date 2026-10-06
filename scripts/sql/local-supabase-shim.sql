-- Local-only Supabase compatibility shim for throwaway PostgreSQL clusters.
-- Supabase owns auth.users and auth.uid(); the public schema itself comes from
-- the repository's real migrations. Used by scripts/check-workspace-upgrade.sh
-- and the scrubbed production copy (scripts/scrubbed-production-copy.ts).
-- Never run this against a hosted database.
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;
-- Match Supabase: new public functions are executable by anon and
-- authenticated unless a migration revokes it. Without this the rehearsal
-- hides grants that production actually has.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
