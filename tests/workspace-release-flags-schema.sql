\set ON_ERROR_STOP on
-- Per-workspace release flags and owner entry resolution on fictional rows.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.rf_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'release flag assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.rf_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.rf_approval(p_flag text, p_reason text) returns uuid language sql as $$
  select (public.create_operator_action_approval('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010',
    'workspace_release_flag.on', jsonb_build_object('flag', p_flag, 'state', 'on', 'reason', p_reason), '{"source":"web"}'::jsonb)->>'approvalId')::uuid
$$;

-- Only the service role reaches the RPCs; nobody reads the tables directly.
select pg_temp.rf_assert(
  not has_function_privilege('anon', 'public.read_workspace_release_flags(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_workspace_release_flags(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.set_workspace_release_flag(text,uuid,text,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.set_workspace_release_flag(text,uuid,text,text,text,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.resolve_tenant_owner_entry(text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.workspace_release_assert_operator(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_workspace_release_flags(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_workspace_release_flag_approved(uuid,uuid,text,text,text,bigint,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_workspace_release_tester(text,uuid,text,boolean,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_workspace_release_flag_history(text,uuid,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.resolve_tenant_owner_entry(text,uuid,text)', 'EXECUTE'),
  'only service_role executes the release flag RPCs');
select pg_temp.rf_assert(
  not has_table_privilege('service_role', 'public.workspace_release_flags', 'SELECT')
  and not has_table_privilege('authenticated', 'public.workspace_release_testers', 'SELECT')
  and not has_table_privilege('service_role', 'public.workspace_release_flag_changes', 'INSERT')
  and (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.workspace_release_flags'::regclass, 'public.workspace_release_testers'::regclass,
    'public.workspace_release_flag_changes'::regclass)),
  'tables are RLS-on with no direct grants');

insert into public.users(id, email, verified_at) values
  ('7f000000-0000-4000-8000-000000000001', 'rf-operator@example.test', now()),
  ('7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test', now()),
  ('7f000000-0000-4000-8000-000000000003', 'rf-member@example.test', now()),
  ('7f000000-0000-4000-8000-000000000004', 'rf-other-owner@example.test', now()),
  ('7f000000-0000-4000-8000-000000000005', 'rf-tester@example.test', now()),
  ('7f000000-0000-4000-8000-000000000006', 'rf-unverified@example.test', null),
  ('7f000000-0000-4000-8000-000000000007', 'rf-revoked@example.test', now()),
  ('7f000000-0000-4000-8000-000000000008', 'rf-approver@example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values
  ('7f000000-0000-4000-8000-000000000001', 'rf-operator@example.test', null),
  ('7f000000-0000-4000-8000-000000000007', 'rf-revoked@example.test', now()),
  ('7f000000-0000-4000-8000-000000000008', 'rf-approver@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('7f000000-0000-4000-8000-000000000010', 'customer', 'Lakeshore Dried Goods', '7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-000000000011', 'customer', 'Harbor Wellness', '7f000000-0000-4000-8000-000000000004'),
  ('7f000000-0000-4000-8000-000000000012', 'personal', 'Personal', '7f000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000001', 'admin', '7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000002', 'owner', '7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000003', 'member', '7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-000000000011', '7f000000-0000-4000-8000-000000000004', 'owner', '7f000000-0000-4000-8000-000000000004');
insert into public.tenants(id, site_name) values ('rf-lakeshore', 'Lakeshore'), ('rf-harbor', 'Harbor'), ('rf-unlinked', 'Unlinked');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ((select stable_id from public.tenants where id = 'rf-lakeshore'), 'rf-lakeshore', '7f000000-0000-4000-8000-000000000010',
    '7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-0000000000c1', repeat('a', 64), '{}'::jsonb),
  ((select stable_id from public.tenants where id = 'rf-harbor'), 'rf-harbor', '7f000000-0000-4000-8000-000000000011',
    '7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-0000000000c2', repeat('b', 64), '{}'::jsonb);

-- Nothing set: no rows, owner entry unset.
select pg_temp.rf_assert(public.read_workspace_release_flags('7f000000-0000-4000-8000-000000000010')->'flags' = '{}'::jsonb, 'starts with no rows');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test')
  = jsonb_build_object('workspaceId', '7f000000-0000-4000-8000-000000000010', 'tenantStableId', (select stable_id from public.tenants where id = 'rf-lakeshore'), 'ownerEntry', null, 'role', 'owner', 'tester', false, 'operator', false),
  'owner resolves the linked workspace with no owner entry row');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-unlinked', '7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test')->'workspaceId' = 'null'::jsonb,
  'an unlinked tenant resolves no workspace');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-nope', '7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test')->'workspaceId' = 'null'::jsonb,
  'an unknown tenant resolves no workspace');

-- Only a verified, unrevoked super admin changes a flag.
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000002', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'owner tries', 0, null)$$, 'workspace_release_operator_required');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000007', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'revoked tries', 0, null)$$, 'workspace_release_operator_required');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved(null, '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'no email', 0, null)$$, 'workspace_release_operator_required');
-- Validation.
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'workspace', 'on', 'not a flag', 0, null)$$, 'workspace_release_flag_unknown');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'maybe', 'bad state', 0, null)$$, 'workspace_release_state_invalid');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', '  ', 0, null)$$, 'workspace_release_reason_required');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000012', 'owner_entry', 'on', 'personal workspace', 0, null)$$, 'workspace_release_workspace_invalid');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-0000000000ff', 'owner_entry', 'on', 'missing workspace', 0, null)$$, 'workspace_release_workspace_invalid');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'stale revision', 3, pg_temp.rf_approval('owner_entry', 'stale revision'))$$, 'workspace_release_revision_conflict');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'missing approval', 0, null)$$, 'operator_action_approval_required');

-- Operator sets owner entry to operators, then on; each change is recorded.
select pg_temp.rf_assert(public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'operators', 'Walk gldf pages first', 0, null)
  #>> '{flags,owner_entry,state}' = 'operators', 'operators state stored');
select pg_temp.rf_expect($$select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'racing operator', 0, pg_temp.rf_approval('owner_entry', 'racing operator'))$$, 'workspace_release_revision_conflict');
select pg_temp.rf_assert(public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'Walk gldf pages first', 1, pg_temp.rf_approval('owner_entry', 'Walk gldf pages first'))
  #>> '{flags,owner_entry,revision}' = '2', 'on stored at revision 2');
-- Repeating the same state writes nothing new.
select public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'on', 'again', 2, null);
select pg_temp.rf_assert((select count(*) from public.workspace_release_flag_changes where workspace_id = '7f000000-0000-4000-8000-000000000010') = 2,
  'two history rows, the repeat wrote none');
select pg_temp.rf_assert((select string_agg(from_state || '>' || to_state, ',' order by changed_at, id) from public.workspace_release_flag_changes
  where workspace_id = '7f000000-0000-4000-8000-000000000010') = 'unset>operators,operators>on', 'history keeps from and to');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000003', 'rf-member@example.test')
  = jsonb_build_object('workspaceId', '7f000000-0000-4000-8000-000000000010', 'tenantStableId', (select stable_id from public.tenants where id = 'rf-lakeshore'), 'ownerEntry', 'on', 'role', 'member', 'tester', false, 'operator', false),
  'member sees owner entry on');
-- History is immutable.
select pg_temp.rf_expect($$update public.workspace_release_flag_changes set reason = 'rewritten'$$, 'workspace_release_history_immutable');
select pg_temp.rf_expect($$delete from public.workspace_release_flag_changes$$, 'workspace_release_history_immutable');
select pg_temp.rf_assert(jsonb_array_length(public.read_workspace_release_flag_history('rf-operator@example.test', '7f000000-0000-4000-8000-000000000010', 10)) = 2, 'operator reads the history');
select pg_temp.rf_expect($$select public.read_workspace_release_flag_history('rf-owner@example.test', '7f000000-0000-4000-8000-000000000010', 10)$$, 'workspace_release_operator_required');

-- Cross-workspace denial: one workspace's row, membership or tester never
-- reaches another workspace's tenant.
select pg_temp.rf_assert(public.read_workspace_release_flags('7f000000-0000-4000-8000-000000000011')->'flags' = '{}'::jsonb, 'other workspace has no rows');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-harbor', '7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test')
  = jsonb_build_object('workspaceId', '7f000000-0000-4000-8000-000000000011', 'tenantStableId', (select stable_id from public.tenants where id = 'rf-harbor'), 'ownerEntry', null, 'role', null, 'tester', false, 'operator', false),
  'lakeshore owner has no role and no on state at harbor');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000004', 'rf-other-owner@example.test')->>'role' is null,
  'harbor owner has no role at lakeshore');
-- A wrong or unverified email resolves as a stranger, never by user id alone.
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000002', 'rf-member@example.test')->>'role' is null,
  'user id with another email is a stranger');
select pg_temp.rf_assert(public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000006', 'rf-unverified@example.test')->>'role' is null,
  'unverified user is a stranger');
select pg_temp.rf_assert((public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000001', 'rf-operator@example.test')->>'operator')::boolean,
  'super admin is reported as operator');
select pg_temp.rf_assert(not (public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000007', 'rf-revoked@example.test')->>'operator')::boolean,
  'revoked super admin is not an operator');

-- Testers: named per workspace, by verified email.
select pg_temp.rf_expect($$select public.set_workspace_release_tester('rf-owner@example.test', '7f000000-0000-4000-8000-000000000010', 'rf-tester@example.test', true, 'owner tries')$$, 'workspace_release_operator_required');
select pg_temp.rf_expect($$select public.set_workspace_release_tester('rf-operator@example.test', '7f000000-0000-4000-8000-000000000010', 'rf-unverified@example.test', true, 'unverified tester')$$, 'workspace_release_tester_unknown');
select pg_temp.rf_assert(public.set_workspace_release_tester('rf-operator@example.test', '7f000000-0000-4000-8000-000000000010', 'RF-Tester@example.test', true, 'Preview tester')
  -> 'testers' = '["7f000000-0000-4000-8000-000000000005"]'::jsonb, 'tester added by email, case-insensitive');
select pg_temp.rf_assert((public.resolve_tenant_owner_entry('rf-lakeshore', '7f000000-0000-4000-8000-000000000005', 'rf-tester@example.test')->>'tester')::boolean,
  'tester resolves as tester at lakeshore');
select pg_temp.rf_assert(not (public.resolve_tenant_owner_entry('rf-harbor', '7f000000-0000-4000-8000-000000000005', 'rf-tester@example.test')->>'tester')::boolean,
  'lakeshore tester is not a tester at harbor');
select pg_temp.rf_assert(public.set_workspace_release_tester('rf-operator@example.test', '7f000000-0000-4000-8000-000000000010', 'rf-tester@example.test', false, 'Preview over')
  -> 'testers' = '[]'::jsonb, 'tester removed');

-- Linked sites for a workspace member: only that business's tenants.
select pg_temp.rf_assert(not has_function_privilege('authenticated', 'public.read_workspace_tenant_links(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_workspace_tenant_links(uuid,uuid,text)', 'EXECUTE'), 'only service_role reads links');
select pg_temp.rf_assert(public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000003', 'rf-member@example.test') #>> '{0,tenantId}' = 'rf-lakeshore'
  and jsonb_array_length(public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000003', 'rf-member@example.test')) = 1,
  'member reads exactly their business''s linked site');
select pg_temp.rf_expect($$select public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000011', '7f000000-0000-4000-8000-000000000002', 'rf-owner@example.test')$$, '%workspace_access_denied%');
select pg_temp.rf_expect($$select public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000002', 'rf-member@example.test')$$, '%workspace_access_denied%');
select pg_temp.rf_expect($$select public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000006', 'rf-unverified@example.test')$$, '%workspace_access_denied%');
select pg_temp.rf_expect($$select public.read_workspace_tenant_links('7f000000-0000-4000-8000-000000000010', '7f000000-0000-4000-8000-000000000005', 'rf-tester@example.test')$$, '%workspace_access_denied%');

-- Unset removes the row and records it; rollback from on to off is one call.
select pg_temp.rf_assert(public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'off', 'Store page broke', 2, null)
  #>> '{flags,owner_entry,state}' = 'off', 'rolled back to off');
select pg_temp.rf_assert(public.set_workspace_release_flag_approved('7f000000-0000-4000-8000-000000000001', '7f000000-0000-4000-8000-000000000010', 'owner_entry', 'unset', 'Follow the env again', 3, null)
  -> 'flags' = '{}'::jsonb, 'unset removes the row');
select pg_temp.rf_assert((select count(*) from public.workspace_release_flag_changes where workspace_id = '7f000000-0000-4000-8000-000000000010') = 6,
  'every change, testers included, is in the history');

rollback;
