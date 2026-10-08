-- Local-only Supabase compatibility shim for throwaway PostgreSQL clusters.
-- Supabase owns auth.users, auth.uid() and auth.role(); the public schema itself comes from
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
-- Supabase also grants every privilege on new public tables and sequences to
-- these roles, so RLS policies are the only thing between a client and a row.
-- service_role is left out here for now: Supabase grants it too, and
-- tests/workspace-newsletter-sender-schema.sql asserts it cannot update
-- workspace_newsletter_batches, which only holds without the default (#528).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid()
returns uuid
language sql stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''),
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid
$$;
create function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  )
$$;
