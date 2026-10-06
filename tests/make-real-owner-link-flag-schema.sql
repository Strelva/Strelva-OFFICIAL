\set ON_ERROR_STOP on
-- The make_real_owner_link release flag (20261009140000_make_real_owner_link_flag.sql)
-- on fictional rows: the key joins the full list with every earlier key kept,
-- only an operator sets it, a row is one business's alone, and RLS and grants
-- are unchanged. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ol_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner link flag assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ol_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- The full list, in order: every key from 20261009100000, then the new one.
select pg_temp.ol_assert(public.workspace_release_flag_names() = array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
  'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
  'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites', 'make_real_owner_link'], 'flag names');
select pg_temp.ol_assert(
  not has_function_privilege('anon', 'public.workspace_release_flag_names()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.workspace_release_flag_names()', 'EXECUTE')
  and not has_table_privilege('service_role', 'public.workspace_release_flags', 'SELECT')
  and not has_table_privilege('authenticated', 'public.workspace_release_flags', 'INSERT')
  and (select relrowsecurity from pg_class where oid = 'public.workspace_release_flags'::regclass),
  'grants and RLS unchanged');

insert into public.users(id, email, verified_at) values
  ('0f000000-0000-4000-8000-000000000001', 'ol-operator@example.test', now()),
  ('0f000000-0000-4000-8000-000000000002', 'ol-owner@example.test', now()),
  ('0f000000-0000-4000-8000-000000000003', 'ol-other-owner@example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values
  ('0f000000-0000-4000-8000-000000000001', 'ol-operator@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('0f000000-0000-4000-8000-000000000010', 'customer', 'Lakeshore Dried Goods', '0f000000-0000-4000-8000-000000000002'),
  ('0f000000-0000-4000-8000-000000000011', 'customer', 'Harbor Wellness', '0f000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('0f000000-0000-4000-8000-000000000010', '0f000000-0000-4000-8000-000000000002', 'owner', '0f000000-0000-4000-8000-000000000002'),
  ('0f000000-0000-4000-8000-000000000011', '0f000000-0000-4000-8000-000000000003', 'owner', '0f000000-0000-4000-8000-000000000003');

-- Off by default: no row anywhere.
select pg_temp.ol_assert(public.read_workspace_release_flags('0f000000-0000-4000-8000-000000000010')->'flags' = '{}'::jsonb, 'no row by default');

-- An owner cannot turn it on for their own business; an operator can.
select pg_temp.ol_expect($$select public.set_workspace_release_flag('ol-owner@example.test', '0f000000-0000-4000-8000-000000000010', 'make_real_owner_link', 'on', 'owner tries', 0)$$, 'workspace_release_operator_required');
select pg_temp.ol_assert(public.set_workspace_release_flag('ol-operator@example.test', '0f000000-0000-4000-8000-000000000010', 'make_real_owner_link', 'on', 'Jacob said yes for Lakeshore', 0)
  #>> '{flags,make_real_owner_link,state}' = 'on', 'operator turns it on for one business');

-- Cross-business: the other business still has no row, and its own owner can't copy it.
select pg_temp.ol_assert(public.read_workspace_release_flags('0f000000-0000-4000-8000-000000000011')->'flags' = '{}'::jsonb, 'another business is untouched');
select pg_temp.ol_expect($$select public.set_workspace_release_flag('ol-other-owner@example.test', '0f000000-0000-4000-8000-000000000011', 'make_real_owner_link', 'on', 'other owner tries', 0)$$, 'workspace_release_operator_required');
select pg_temp.ol_expect($$select public.set_workspace_release_flag('ol-owner@example.test', '0f000000-0000-4000-8000-000000000011', 'make_real_owner_link', 'on', 'owner reaches across', 0)$$, 'workspace_release_operator_required');

-- Still no unknown keys.
select pg_temp.ol_expect($$insert into public.workspace_release_flags(workspace_id, flag, state, changed_by)
  values ('0f000000-0000-4000-8000-000000000011', 'make_real_owner_links', 'on', '0f000000-0000-4000-8000-000000000001')$$, '%check constraint%');

rollback;
