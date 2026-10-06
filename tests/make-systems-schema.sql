\set ON_ERROR_STOP on

-- make_systems: only a Strelva operator inside the workspace or a delegated
-- agency may create an internal tool. Fictional local fixture only.

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

create function pg_temp.expect_error(stmt text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm <> expected then
      raise exception 'expected % but got % for: %', expected, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, stmt;
end;
$$;

-- 01 owner, 02 admin, 03 member, 04 operator (member + super admin),
-- 05 revoked operator (member), 06 agency member, 07 outsider,
-- 08 super admin who is not a member, 09 unverified agency member.
insert into public.users(id, email, verified_at) values
 ('d7000000-0000-4000-8000-000000000001', 'make-owner@example.test', now()),
 ('d7000000-0000-4000-8000-000000000002', 'make-admin@example.test', now()),
 ('d7000000-0000-4000-8000-000000000003', 'make-member@example.test', now()),
 ('d7000000-0000-4000-8000-000000000004', 'make-operator@example.test', now()),
 ('d7000000-0000-4000-8000-000000000005', 'make-revoked@example.test', now()),
 ('d7000000-0000-4000-8000-000000000006', 'make-agency@example.test', now()),
 ('d7000000-0000-4000-8000-000000000007', 'make-outsider@example.test', now()),
 ('d7000000-0000-4000-8000-000000000008', 'make-staff@example.test', now()),
 ('d7000000-0000-4000-8000-000000000009', 'make-unverified@example.test', null);
insert into public.super_admins(user_id, email, revoked_at) values
 ('d7000000-0000-4000-8000-000000000004', 'make-operator@example.test', null),
 ('d7000000-0000-4000-8000-000000000005', 'make-revoked@example.test', now()),
 ('d7000000-0000-4000-8000-000000000008', 'make-staff@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
 ('d7000000-0000-4000-8000-000000000010', 'customer', 'Make business', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000011', 'agency', 'Make agency', 'd7000000-0000-4000-8000-000000000006'),
 ('d7000000-0000-4000-8000-000000000012', 'customer', 'Other business', 'd7000000-0000-4000-8000-000000000007');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001', 'owner', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000002', 'admin', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000003', 'member', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000004', 'admin', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000005', 'admin', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000006', 'owner', 'd7000000-0000-4000-8000-000000000006'),
 ('d7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000009', 'member', 'd7000000-0000-4000-8000-000000000006'),
 ('d7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000007', 'owner', 'd7000000-0000-4000-8000-000000000007');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
 ('d7000000-0000-4000-8000-000000000020', 'd7000000-0000-4000-8000-000000000010', 'scheduling', 'schedule', 'Delegated work', '{"reservations":[]}', 'd7000000-0000-4000-8000-000000000001'),
 ('d7000000-0000-4000-8000-000000000021', 'd7000000-0000-4000-8000-000000000012', 'scheduling', 'schedule', 'Other work', '{"reservations":[]}', 'd7000000-0000-4000-8000-000000000007');
insert into public.workspace_delegations(id, customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by) values
 ('d7000000-0000-4000-8000-000000000030', 'd7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000020', 'd7000000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000006');

create temp table make_spec(payload jsonb);
insert into make_spec values (jsonb_build_object(
  'version', 1, 'revision', 0, 'title', 'Client intake', 'createdBy', 'maker', 'createdAt', '2026-10-07T12:00:00Z', 'history', '[]'::jsonb,
  'spec', jsonb_build_object('title', 'Client intake', 'maintenanceOwner', 'maker',
    'fields', jsonb_build_array(jsonb_build_object('id', 'name', 'label', 'Name', 'type', 'text', 'required', true)),
    'components', jsonb_build_array(jsonb_build_object('kind', 'form', 'fields', jsonb_build_array('name')))),
  'specVersion', 1, 'status', 'draft', 'rehearsal', null, 'records', '[]'::jsonb));
update make_spec set payload = payload || jsonb_build_object('versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', payload->'spec')));

-- The role table names make_systems and grants it to no role.
select pg_temp.assert_true(
  not public.workspace_role_allows('owner', 'make_systems')
  and not public.workspace_role_allows('admin', 'make_systems')
  and not public.workspace_role_allows('member', 'make_systems'),
  'no workspace role grants make_systems');
select pg_temp.expect_error($$select public.workspace_role_allows('owner', 'make_everything')$$, 'workspace_permission_unknown');

-- Authority resolution.
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000004') = 'operator', 'operator member resolves to operator');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000006') = 'agency', 'delegated agency member resolves to agency');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001') = 'member', 'owner is only a member');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000002') = 'member', 'admin is only a member');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000005') = 'member', 'revoked operator is only a member');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000008') is null, 'operator without membership has no authority');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000007') is null, 'outsider has no authority');
select pg_temp.assert_true(public.workspace_make_systems_authority('d7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000006') is null, 'agency delegation does not reach another business');

-- Member create path: owners, admins and members cannot create internal tools.
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001', 'applications', 'application', 'Client intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000002', 'applications', 'application', 'Client intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000003', 'applications', 'application', 'Client intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000005', 'applications', 'application', 'Client intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001', 'custom-applications', 'custom_application', 'Built app', '{}', null, null)$$, 'workspace_make_systems_required');
-- Other saved work is unchanged for members.
select pg_temp.assert_true((select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000003', 'tracker', 'tracker', 'Still allowed', '{}', null, null)) = 1, 'members keep creating other work');
-- The operator creates through either path.
select pg_temp.assert_true((select count(*) from public.save_workspace_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000004', 'applications', 'application', 'Client intake', (select payload from make_spec), null, null)) = 1, 'operator creates an internal tool');
select pg_temp.assert_true((select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000004', 'make-operator@example.test', 'applications', 'application', 'Client intake 2', (select payload from make_spec), null, null)) = 1, 'operator creates through the maker path');

-- Maker create path.
select pg_temp.assert_true((select created_by from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000006', 'MAKE-AGENCY@example.test', 'applications', 'application', 'Agency intake', (select payload from make_spec), null, null)) = 'd7000000-0000-4000-8000-000000000006', 'delegated agency creates an internal tool');
select pg_temp.assert_true(exists(select 1 from public.application_states s join public.saved_product_work w on w.id = s.work_id where w.title = 'Agency intake' and s.lifecycle_status = 'draft'), 'agency tool starts as a draft');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000001', 'make-owner@example.test', 'applications', 'application', 'Owner intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000003', 'make-member@example.test', 'applications', 'application', 'Member intake', (select payload from make_spec), null, null)$$, 'workspace_make_systems_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000007', 'make-outsider@example.test', 'applications', 'application', 'Outsider intake', (select payload from make_spec), null, null)$$, 'workspace_membership_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000006', 'someone-else@example.test', 'applications', 'application', 'Wrong email', (select payload from make_spec), null, null)$$, 'workspace_membership_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000009', 'make-unverified@example.test', 'applications', 'application', 'Unverified', (select payload from make_spec), null, null)$$, 'workspace_membership_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000012', 'd7000000-0000-4000-8000-000000000006', 'make-agency@example.test', 'applications', 'application', 'Cross business', (select payload from make_spec), null, null)$$, 'workspace_membership_required');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000004', 'make-operator@example.test', 'tracker', 'tracker', 'Not a tool', '{}', null, null)$$, 'saved_work_invalid');
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000006', 'make-agency@example.test', 'applications', 'application', 'Foreign source', (select payload from make_spec), null, 'd7000000-0000-4000-8000-000000000021')$$, 'workspace_access_denied');

-- Revoking the delegation removes the agency's authority.
update public.workspace_delegations set status = 'revoked', revoked_at = now(), revoked_by = 'd7000000-0000-4000-8000-000000000001'
  where id = 'd7000000-0000-4000-8000-000000000030';
select pg_temp.expect_error($$select count(*) from public.save_system_work('d7000000-0000-4000-8000-000000000010', 'd7000000-0000-4000-8000-000000000006', 'make-agency@example.test', 'applications', 'application', 'After revoke', (select payload from make_spec), null, null)$$, 'workspace_membership_required');

-- Nothing here is callable with a public key.
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.save_system_work(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.save_system_work(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.workspace_make_systems_authority(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.workspace_require_make_systems(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.save_system_work(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.workspace_make_systems_authority(uuid,uuid)', 'execute'),
  'make_systems functions are service-role only');
