\set ON_ERROR_STOP on
-- Provider-seat conversion and legacy repair (agency 1.0 issues #246/#535).
-- Fictional users and tenants only. Run after 20261012120000.
begin;
create or replace function pg_temp.pc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'provider-seat conversion assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.pc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

insert into public.users(id, email, verified_at) values
  ('71000000-0000-4000-8000-000000000001', 'pc-operator@strelva.example.test', now()),
  ('71000000-0000-4000-8000-000000000002', 'pc-owner@example.test', now()),
  ('71000000-0000-4000-8000-000000000003', 'pc-agency-owner@example.test', now()),
  ('71000000-0000-4000-8000-000000000004', 'pc-staff@example.test', now()),
  ('71000000-0000-4000-8000-000000000005', 'pc-unstaffed@example.test', now());
insert into public.super_admins(user_id, email)
  values ('71000000-0000-4000-8000-000000000001', 'pc-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('71000000-0000-4000-8000-000000000010', 'agency', 'Fictional conversion agency', '71000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('71000000-0000-4000-8000-000000000010', '71000000-0000-4000-8000-000000000003', 'owner', '71000000-0000-4000-8000-000000000003'),
  ('71000000-0000-4000-8000-000000000010', '71000000-0000-4000-8000-000000000004', 'member', '71000000-0000-4000-8000-000000000003'),
  ('71000000-0000-4000-8000-000000000010', '71000000-0000-4000-8000-000000000005', 'member', '71000000-0000-4000-8000-000000000003');
insert into public.workspaces(id, kind, name, created_by)
  values ('71000000-0000-4000-8000-000000000030', 'agency', 'Designated Strelva Agency', '71000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ('71000000-0000-4000-8000-000000000030', '71000000-0000-4000-8000-000000000001', 'owner', '71000000-0000-4000-8000-000000000001');
insert into public.strelva_agency_workspace(workspace_id, designated_by)
  values ('71000000-0000-4000-8000-000000000030', '71000000-0000-4000-8000-000000000001');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('pc-seat-client', '71000000-0000-4000-8000-0000000000a1', 'Seat Client', true, 'pc-owner@example.test'),
  ('pc-legacy-client', '71000000-0000-4000-8000-0000000000a2', 'Legacy Client', true, 'pc-owner@example.test'),
  ('pc-joined-client', '71000000-0000-4000-8000-0000000000a3', 'Joined Client', true, 'pc-owner@example.test');

create temporary table pc_result(label text primary key, body jsonb) on commit drop;
insert into pc_result values ('conversion', public.convert_tenant_to_business(
  'pc-operator@strelva.example.test', 'pc-seat-client',
  jsonb_build_object('tenantId', 'pc-seat-client', 'tenantStableId', '71000000-0000-4000-8000-0000000000a1',
    'workspaceName', 'Seat Client', 'billing', null, 'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb,
    'agencyWorkspaceId', '71000000-0000-4000-8000-000000000010',
    'agencyStaffEmails', jsonb_build_array('pc-staff@example.test'), 'agencySelectionBasis', 'existing_contract'),
  '71000000-0000-4000-8000-0000000000c1', repeat('1', 64)));
create temporary table pc_workspace as select (body->>'workspaceId')::uuid id from pc_result where label = 'conversion';

select pg_temp.pc_assert((select body->>'operatorRole' = 'none' and body->>'operatorMembershipCreated' = 'false'
  and body#>>'{providerRoute,agencyWorkspaceId}' = '71000000-0000-4000-8000-000000000010'
  and body#>>'{providerRoute,selectionBasis}' = 'existing_contract' from pc_result where label = 'conversion'),
  format('receipt records the explicit agency route and no operator membership: %s',
    (select body::text from pc_result where label = 'conversion')));
select pg_temp.pc_assert((select provider_workspace_id = '71000000-0000-4000-8000-000000000010'
  from public.workspace_providers where customer_workspace_id = (select id from pc_workspace) and status = 'active'),
  'the explicit route wins over the designated Strelva default');
select pg_temp.pc_assert((select count(*) = 0 from public.workspace_memberships where workspace_id = (select id from pc_workspace)),
  'conversion created no personal admin membership');
select pg_temp.pc_assert((select count(*) = 1 and bool_and(status = 'active' and granted_by_kind = 'conversion')
  from public.provider_seats where customer_workspace_id = (select id from pc_workspace)
    and agency_workspace_id = '71000000-0000-4000-8000-000000000010'), 'conversion created the agency seat');
select pg_temp.pc_assert((select count(*) = 1 and bool_and(status = 'active' and user_id = '71000000-0000-4000-8000-000000000004')
  from public.agency_client_staff where customer_workspace_id = (select id from pc_workspace)
    and agency_workspace_id = '71000000-0000-4000-8000-000000000010'), 'only named agency staff receives a staff row');
select pg_temp.pc_assert(public.provider_seat_role((select id from pc_workspace), '71000000-0000-4000-8000-000000000004', false) = 'admin',
  'named agency staff has access through the active seat');
select pg_temp.pc_assert(public.provider_seat_role((select id from pc_workspace), '71000000-0000-4000-8000-000000000005', false) is null,
  'agency member without a staff row has no access');
select pg_temp.pc_expect(format($$select public.read_business_record(%L, '71000000-0000-4000-8000-000000000005', 'pc-unstaffed@example.test')$$,
  (select id from pc_workspace)), 'business_record_access_denied');

-- The existing owner-recipient route is preserved and this conversion sends no invitation.
select pg_temp.pc_assert((select r->>'email' = 'pc-owner@example.test' and r->>'from' = 'tenant'
    and (r->>'workspaceId')::uuid = (select id from pc_workspace)
  from (select public.resolve_tenant_owner_recipient('pc-seat-client') r) recipient), 'owner recipient still resolves from the tenant');
select pg_temp.pc_assert(not exists (select 1 from public.workspace_invitations where workspace_id = (select id from pc_workspace)),
  'conversion did not send or create an owner invitation');
create temporary table pc_owner_invite as
  select public.create_operator_owner_invitation('pc-operator@strelva.example.test', (select id from pc_workspace),
    'pc-owner@example.test', repeat('1a2b3c4d', 8), now() + interval '14 days') body;
select pg_temp.pc_assert((select body->>'recipientEmail' = 'pc-owner@example.test' from pc_owner_invite)
  and exists (select 1 from public.workspace_invitations where workspace_id = (select id from pc_workspace)
    and issued_by_kind = 'operator' and status = 'pending'), 'the existing owner invite can be issued explicitly');
select * from public.accept_workspace_invitation(repeat('1a2b3c4d', 8),
  '71000000-0000-4000-8000-000000000002', 'pc-owner@example.test');
select pg_temp.pc_assert((select role = 'owner' from public.workspace_memberships
  where workspace_id = (select id from pc_workspace) and user_id = '71000000-0000-4000-8000-000000000002'),
  'the owner invite is accepted without a conversion operator membership');

-- An owner can end the seat. That ends staff rows, which are the access path created by conversion.
select public.end_provider_seat('71000000-0000-4000-8000-000000000002', 'pc-owner@example.test',
  (select id from pc_workspace), '71000000-0000-4000-8000-000000000010', 'Owner ended the provider seat.');
select pg_temp.pc_assert((select status = 'ended' from public.provider_seats where customer_workspace_id = (select id from pc_workspace)),
  'seat ended');
select pg_temp.pc_assert((select status = 'ended' from public.agency_client_staff where customer_workspace_id = (select id from pc_workspace)),
  'ending the seat ended every conversion-created staff row');
select pg_temp.pc_assert(public.provider_seat_role((select id from pc_workspace), '71000000-0000-4000-8000-000000000004', false) is null,
  'staff access is gone after ending the seat');
select pg_temp.pc_expect(format($$select public.read_business_record(%L, '71000000-0000-4000-8000-000000000004', 'pc-staff@example.test')$$,
  (select id from pc_workspace)), 'business_record_access_denied');
select pg_temp.pc_assert(not exists (select 1 from public.workspace_memberships where workspace_id = (select id from pc_workspace)
  and user_id = '71000000-0000-4000-8000-000000000001'), 'the operator never had a conversion-created membership to survive seat end');

-- Simulate a receipt produced by the old conversion and repair it twice.
insert into public.workspaces(id, kind, name, created_by)
  values ('71000000-0000-4000-8000-000000000020', 'customer', 'Legacy Client', '71000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ('71000000-0000-4000-8000-000000000020', '71000000-0000-4000-8000-000000000001', 'admin', '71000000-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
    command_id, command_digest, receipt)
  values ('71000000-0000-4000-8000-0000000000a2', 'pc-legacy-client', '71000000-0000-4000-8000-000000000020',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-0000000000c2', repeat('2', 64),
    jsonb_build_object('kind', 'tenant_conversion', 'version', 1, 'tenantId', 'pc-legacy-client',
      'tenantStableId', '71000000-0000-4000-8000-0000000000a2', 'workspaceId', '71000000-0000-4000-8000-000000000020',
      'workspaceName', 'Legacy Client', 'joinedExistingWorkspace', false, 'operatorId', '71000000-0000-4000-8000-000000000001',
      'operatorRole', 'admin', 'sequence', 1, 'billing', null, 'account', null));
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
  values ('71000000-0000-4000-8000-000000000020', '71000000-0000-4000-8000-000000000030', 'conversion',
    '71000000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
  values ('71000000-0000-4000-8000-000000000030', '71000000-0000-4000-8000-000000000020',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001');
select pg_temp.pc_assert((select provider_workspace_id = '71000000-0000-4000-8000-000000000030'
  from public.workspace_providers where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active'),
  'legacy conversion created the designated Strelva provider attribution');

create temporary table pc_repath_preview as
  select public.repath_converted_tenant_provider('pc-operator@strelva.example.test', 'pc-legacy-client',
    '71000000-0000-4000-8000-000000000010', jsonb_build_array('pc-staff@example.test'), 'existing_contract', false) body;
select pg_temp.pc_assert((select body->>'legacyAdminMemberships' = '1' and body->>'legacyAdminMembershipsRemoved' = '0'
  and body->>'applied' = 'false' and jsonb_array_length(body->'staffToAdd') = 1
  and body#>>'{providerRoute,providerToEndWorkspaceId}' = '71000000-0000-4000-8000-000000000030'
  from pc_repath_preview), 're-route preview is read-only and names the legacy paths');
select pg_temp.pc_assert(exists (select 1 from public.workspace_memberships where workspace_id = '71000000-0000-4000-8000-000000000020'
  and user_id = '71000000-0000-4000-8000-000000000001' and role = 'admin')
  and exists (select 1 from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020'
    and agency_workspace_id = '71000000-0000-4000-8000-000000000030' and status = 'active')
  and not exists (select 1 from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020'
    and agency_workspace_id = '71000000-0000-4000-8000-000000000010'),
  'preview leaves legacy access and route state untouched');

create temporary table pc_repath_first as
  select public.repath_converted_tenant_provider('pc-operator@strelva.example.test', 'pc-legacy-client',
    '71000000-0000-4000-8000-000000000010', jsonb_build_array('pc-staff@example.test'), 'existing_contract', true) body;
select pg_temp.pc_assert((select body->>'legacyAdminMemberships' = '1' and body->>'legacyAdminMembershipsRemoved' = '1'
  and body->>'applied' = 'true' from pc_repath_first), 're-route creates seat/staff and removes the old admin membership');
select pg_temp.pc_assert(not exists (select 1 from public.workspace_memberships where workspace_id = '71000000-0000-4000-8000-000000000020'
  and user_id = '71000000-0000-4000-8000-000000000001')
  and (select count(*) from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active') = 1
  and (select status = 'ended' from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020'
    and agency_workspace_id = '71000000-0000-4000-8000-000000000030')
  and (select status = 'ended' from public.agency_client_staff where customer_workspace_id = '71000000-0000-4000-8000-000000000020'
    and agency_workspace_id = '71000000-0000-4000-8000-000000000030')
  and (select provider_workspace_id = '71000000-0000-4000-8000-000000000010' from public.workspace_providers
    where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active')
  and (select count(*) from public.agency_client_staff where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active') = 1,
  'legacy admin and default Strelva attribution are replaced by the selected agency seat and staff row');
create temporary table pc_repath_second as
  select public.repath_converted_tenant_provider('pc-operator@strelva.example.test', 'pc-legacy-client',
    '71000000-0000-4000-8000-000000000010', jsonb_build_array('pc-staff@example.test'), 'existing_contract', true) body;
select pg_temp.pc_assert((select body->>'alreadyRouted' = 'true' and body->>'legacyAdminMembershipsRemoved' = '0'
  from pc_repath_second), 're-route replay is idempotent');
select pg_temp.pc_assert((select count(*) = 1 from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active')
  and (select count(*) = 2 from public.provider_seats where customer_workspace_id = '71000000-0000-4000-8000-000000000020')
  and (select count(*) = 1 from public.agency_client_staff where customer_workspace_id = '71000000-0000-4000-8000-000000000020' and status = 'active')
  and (select count(*) = 2 from public.agency_client_staff where customer_workspace_id = '71000000-0000-4000-8000-000000000020')
  and (select receipt ? 'providerRoute' from public.tenant_workspace_links where tenant_stable_id = '71000000-0000-4000-8000-0000000000a2'),
  'repeat does not duplicate seat or staff and keeps the route receipt');

-- A joined conversion did not create the operator's existing admin membership;
-- re-routing changes only the old provider attribution and preserves that grant.
insert into public.workspaces(id, kind, name, created_by)
  values ('71000000-0000-4000-8000-000000000021', 'customer', 'Joined Client', '71000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ('71000000-0000-4000-8000-000000000021', '71000000-0000-4000-8000-000000000001', 'admin', '71000000-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
    command_id, command_digest, receipt)
  values ('71000000-0000-4000-8000-0000000000a3', 'pc-joined-client', '71000000-0000-4000-8000-000000000021',
    '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-0000000000c3', repeat('3', 64),
    jsonb_build_object('kind', 'tenant_conversion', 'version', 1, 'tenantId', 'pc-joined-client',
      'tenantStableId', '71000000-0000-4000-8000-0000000000a3', 'workspaceId', '71000000-0000-4000-8000-000000000021',
      'workspaceName', 'Joined Client', 'joinedExistingWorkspace', true, 'operatorId', '71000000-0000-4000-8000-000000000001',
      'operatorRole', 'admin', 'sequence', 1, 'billing', null, 'account', null));
select public.repath_converted_tenant_provider('pc-operator@strelva.example.test', 'pc-joined-client',
  '71000000-0000-4000-8000-000000000010', jsonb_build_array('pc-staff@example.test'), 'existing_contract', true);
select pg_temp.pc_assert(exists (select 1 from public.workspace_memberships where workspace_id = '71000000-0000-4000-8000-000000000021'
    and user_id = '71000000-0000-4000-8000-000000000001' and role = 'admin')
  and (select provider_workspace_id = '71000000-0000-4000-8000-000000000010' from public.workspace_providers
    where customer_workspace_id = '71000000-0000-4000-8000-000000000021' and status = 'active'),
  're-route preserves an admin membership that the old conversion did not create');

-- Current-RPC sibling joins use the conversion receipt, not personal admin
-- membership; unlinking the final site ends the conversion provider access.
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('pc-current-a', '71000000-0000-4000-8000-0000000000a4', 'Current A', true, 'pc-owner@example.test'),
  ('pc-current-b', '71000000-0000-4000-8000-0000000000a5', 'Current B', true, 'pc-owner@example.test');
create function pg_temp.pc_import(p_tenant text, p_target uuid default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id,
    'workspaceName', t.site_name, 'targetWorkspaceId', p_target))
    || jsonb_build_object('billing', null, 'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb,
      'agencyWorkspaceId', '71000000-0000-4000-8000-000000000010',
      'agencyStaffEmails', jsonb_build_array('pc-staff@example.test'), 'agencySelectionBasis', 'existing_contract')
  from public.tenants t where t.id = p_tenant
$$;
create temporary table pc_current as select public.convert_tenant_to_business('pc-operator@strelva.example.test',
  'pc-current-a', pg_temp.pc_import('pc-current-a'), gen_random_uuid(), repeat('4', 64)) body;
select pg_temp.pc_expect(format($$select public.convert_tenant_to_business('pc-operator@strelva.example.test',
  'pc-current-b', %L::jsonb, gen_random_uuid(), repeat('5',64))$$,
  pg_temp.pc_import('pc-current-b', (select id from pc_workspace))), 'tenant_conversion_provider_previously_ended');
select pg_temp.pc_assert(not exists (select 1 from public.tenant_workspace_links
  where tenant_stable_id = '71000000-0000-4000-8000-0000000000a5'), 'joining an owner-ended seat cannot restore provider access');
select public.convert_tenant_to_business('pc-operator@strelva.example.test', 'pc-current-b',
  pg_temp.pc_import('pc-current-b', (select (body->>'workspaceId')::uuid from pc_current)), gen_random_uuid(), repeat('6',64));
select pg_temp.pc_assert((select count(*) = 2 from public.tenant_workspace_links
  where workspace_id = (select (body->>'workspaceId')::uuid from pc_current))
  and not exists (select 1 from public.workspace_memberships
    where workspace_id = (select (body->>'workspaceId')::uuid from pc_current))
  and (select count(*) = 1 from public.provider_seats where status = 'active'
    and customer_workspace_id = (select (body->>'workspaceId')::uuid from pc_current)),
  'a sibling joins with one seat and no operator membership');
select public.unlink_tenant_from_business('pc-operator@strelva.example.test', 'pc-current-b',
  (select (body->>'workspaceId')::uuid from pc_current), gen_random_uuid(), repeat('7',64));
select pg_temp.pc_assert(public.provider_seat_role((select (body->>'workspaceId')::uuid from pc_current),
  '71000000-0000-4000-8000-000000000004', false) = 'admin', 'unlinking one sibling preserves the remaining provider access');
select public.unlink_tenant_from_business('pc-operator@strelva.example.test', 'pc-current-a',
  (select (body->>'workspaceId')::uuid from pc_current), gen_random_uuid(), repeat('8',64));
select pg_temp.pc_assert(not exists (select 1 from public.tenant_workspace_links
    where workspace_id = (select (body->>'workspaceId')::uuid from pc_current))
  and public.provider_seat_role((select (body->>'workspaceId')::uuid from pc_current),
    '71000000-0000-4000-8000-000000000004', false) is null
  and not exists (select 1 from public.agency_client_staff where status = 'active'
    and customer_workspace_id = (select (body->>'workspaceId')::uuid from pc_current)),
  'unlinking the final converted site removes provider access without a personal admin grant');

rollback;
