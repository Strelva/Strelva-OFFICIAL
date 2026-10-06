\set ON_ERROR_STOP on
-- Release rows on agency workspaces (20261008161000) on fictional rows.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ra_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency release flag assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ra_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Grants unchanged: the assert helper is internal; only service_role sets rows.
select pg_temp.ra_assert(
  not has_function_privilege('service_role', 'public.workspace_release_assert_workspace(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.workspace_release_assert_workspace(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.workspace_release_assert_workspace(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.set_workspace_release_flag(text,uuid,text,text,text,bigint)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_workspace_release_flag(text,uuid,text,text,text,bigint)', 'EXECUTE'),
  'grants are unchanged');
select pg_temp.ra_assert((select count(*) from pg_proc where proname = 'workspace_release_assert_workspace') = 1, 'one assert function');

insert into public.users(id, email, verified_at) values
  ('7e000000-0000-4000-8000-000000000001', 'ra-operator@example.test', now()),
  ('7e000000-0000-4000-8000-000000000002', 'ra-agency-owner@example.test', now()),
  ('7e000000-0000-4000-8000-000000000003', 'ra-tester@example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values
  ('7e000000-0000-4000-8000-000000000001', 'ra-operator@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('7e000000-0000-4000-8000-000000000010', 'agency', 'Canalside Studio', '7e000000-0000-4000-8000-000000000002'),
  ('7e000000-0000-4000-8000-000000000011', 'customer', 'Elmwood Bakery', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000012', 'personal', 'Personal', '7e000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-000000000002', 'owner', '7e000000-0000-4000-8000-000000000002');

-- The agency's own owner can't set a row; only an operator can.
select pg_temp.ra_expect($$select public.set_workspace_release_flag('ra-agency-owner@example.test', '7e000000-0000-4000-8000-000000000010', 'systems', 'on', 'owner tries', 0)$$, 'workspace_release_operator_required');
-- Personal and missing workspaces stay refused.
select pg_temp.ra_expect($$select public.set_workspace_release_flag('ra-operator@example.test', '7e000000-0000-4000-8000-000000000012', 'systems', 'on', 'personal workspace', 0)$$, 'workspace_release_workspace_invalid');
select pg_temp.ra_expect($$select public.set_workspace_release_flag('ra-operator@example.test', '7e000000-0000-4000-8000-0000000000ff', 'systems', 'on', 'missing workspace', 0)$$, 'workspace_release_workspace_invalid');

-- An operator sets Systems on an agency workspace; it reads back and is recorded.
select pg_temp.ra_assert(public.set_workspace_release_flag('ra-operator@example.test', '7e000000-0000-4000-8000-000000000010', 'systems', 'operators', 'Agency library walk-through', 0)
  #>> '{flags,systems,state}' = 'operators', 'agency row stored');
select pg_temp.ra_assert(public.set_workspace_release_flag('ra-operator@example.test', '7e000000-0000-4000-8000-000000000010', 'systems', 'on', 'Jacob said yes', 1)
  #>> '{flags,systems,state}' = 'on', 'agency row moves to on');
select pg_temp.ra_assert(public.read_workspace_release_flags('7e000000-0000-4000-8000-000000000010') #>> '{flags,systems,state}' = 'on', 'agency row reads back');
select pg_temp.ra_assert(jsonb_array_length(public.read_workspace_release_flag_history('ra-operator@example.test', '7e000000-0000-4000-8000-000000000010', 20)) = 2, 'both changes recorded');
-- Named testers work on an agency workspace too.
select pg_temp.ra_assert(public.set_workspace_release_tester('ra-operator@example.test', '7e000000-0000-4000-8000-000000000010', 'ra-tester@example.test', true, 'Agency tester')
  -> 'testers' ? '7e000000-0000-4000-8000-000000000003', 'agency tester stored');

-- Cross-workspace: the agency's row never reaches a business workspace.
select pg_temp.ra_assert(public.read_workspace_release_flags('7e000000-0000-4000-8000-000000000011') -> 'flags' = '{}'::jsonb, 'the business has no row');
select pg_temp.ra_assert(public.read_workspace_release_flags('7e000000-0000-4000-8000-000000000011') -> 'testers' = '[]'::jsonb, 'the business has no testers');

-- Business workspaces still accept rows as before.
select pg_temp.ra_assert(public.set_workspace_release_flag('ra-operator@example.test', '7e000000-0000-4000-8000-000000000011', 'systems', 'off', 'Keep off', 0)
  #>> '{flags,systems,state}' = 'off', 'business row still stored');

rollback;
