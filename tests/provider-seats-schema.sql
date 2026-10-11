\set ON_ERROR_STOP on
-- Provider seats (20261009151000_provider_seats.sql), on fictional rows: the
-- owner chooses an agency, the agency staffs the client, seat AND staff AND
-- agency membership resolve to direct access in every actor function, the
-- same for every agency; ending the provider ends the seat; ending the seat
-- ends the staff rows; history is never rewritten.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ps_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'provider seat assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ps_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
-- The role business_record_assert_actor gives, or the error it raises.
create or replace function pg_temp.ps_role(p_user uuid, p_email text, p_write boolean) returns text language plpgsql as $$
begin
  return public.business_record_assert_actor('5e000000-0000-4000-8000-000000000010', p_user, p_email, p_write);
exception when others then return sqlerrm;
end; $$;

-- Privileges: RLS on, no table access, service-role commands only.
select pg_temp.ps_assert((select relrowsecurity from pg_class where oid = 'public.provider_seats'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.agency_client_staff'::regclass), 'rls on');
select pg_temp.ps_assert(not has_table_privilege('service_role', 'public.provider_seats', 'select')
  and not has_table_privilege('service_role', 'public.agency_client_staff', 'select')
  and not has_table_privilege('authenticated', 'public.provider_seats', 'insert'), 'no table privileges');
select pg_temp.ps_assert(
  has_function_privilege('service_role', 'public.choose_business_provider(uuid,text,uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.end_business_provider(uuid,text,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.end_provider_seat(uuid,text,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.set_agency_client_staff(uuid,text,uuid,uuid,uuid,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_provider_seats(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.choose_business_provider(uuid,text,uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.provider_seat_role(uuid,uuid,boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.provider_seat_direct_role()', 'execute')
  and not has_function_privilege('service_role', 'public.business_record_assert_actor(uuid,uuid,text,boolean)', 'execute'),
  'only service_role runs the commands; resolution stays internal');

-- Open decision #241: a seat is operator-level direct access, in one place.
select pg_temp.ps_assert(public.provider_seat_direct_role() = 'admin', 'seat policy answers admin');

insert into public.users(id, email, verified_at) values
  ('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test', now()),
  ('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test', now()),
  ('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', now()),
  ('5e000000-0000-4000-8000-000000000004', 'ps-a-unstaffed@agency-a.example.test', now()),
  ('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test', now()),
  ('5e000000-0000-4000-8000-000000000006', 'ps-stranger@example.test', now()),
  ('5e000000-0000-4000-8000-000000000007', 'ps-a-unverified@agency-a.example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('5e000000-0000-4000-8000-000000000010', 'customer', 'Seat Client', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000020', 'agency', 'Agency A', '5e000000-0000-4000-8000-000000000002'),
  ('5e000000-0000-4000-8000-000000000030', 'agency', 'Agency B', '5e000000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000002', 'owner', '5e000000-0000-4000-8000-000000000002'),
  ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000003', 'member', '5e000000-0000-4000-8000-000000000002'),
  ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000004', 'member', '5e000000-0000-4000-8000-000000000002'),
  ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000007', 'member', '5e000000-0000-4000-8000-000000000002'),
  ('5e000000-0000-4000-8000-000000000030', '5e000000-0000-4000-8000-000000000005', 'owner', '5e000000-0000-4000-8000-000000000005');

-- No seat: agency staff reach nothing.
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)
  = 'business_record_access_denied', 'no seat, no access');

-- Only the owner chooses, and only an agency.
select pg_temp.ps_expect($$select public.choose_business_provider('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000020')$$, 'provider_seat_owner_required');
select pg_temp.ps_expect($$select public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000010')$$, 'provider_seat_invalid');
select pg_temp.ps_expect($$select public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'wrong@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000020')$$, 'provider_seat_owner_required');

create temporary table ps_results(name text primary key, body jsonb) on commit drop;
insert into ps_results values ('choose_a', public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000020'));
select pg_temp.ps_assert((select body->>'source' = 'business_choice' and body->>'grantedByKind' = 'owner' and body->>'replayed' = 'false'
  from ps_results where name = 'choose_a'), 'provider row and seat written together');
select pg_temp.ps_assert((select count(*) from public.workspace_providers where customer_workspace_id = '5e000000-0000-4000-8000-000000000010'
  and status = 'active' and provider_workspace_id = '5e000000-0000-4000-8000-000000000020') = 1, 'one active provider row');
select pg_temp.ps_assert((public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000020')->>'replayed') = 'true', 'choosing again replays');
select pg_temp.ps_assert((select count(*) from public.provider_seats where customer_workspace_id = '5e000000-0000-4000-8000-000000000010') = 1,
  'a replay writes no second seat');

-- A seat alone is not access: the member must be staffed on the client.
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)
  = 'business_record_access_denied', 'seat without staff row: no access');
select pg_temp.ps_expect($$select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003', true)$$,
  'agency_client_staff_access_denied');
select pg_temp.ps_expect($$select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000006', true)$$,
  'agency_client_staff_invalid');
select pg_temp.ps_assert((public.set_agency_client_staff('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003', true)->>'changed') = 'true',
  'agency owner staffs a member');
select pg_temp.ps_assert((public.set_agency_client_staff('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003', true)->>'changed') = 'false',
  'staffing twice is a no-op');
select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000007', true);

-- Seat AND staff AND agency membership: direct access everywhere, as the policy's role.
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false) = 'admin', 'record read: admin');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', true) = 'admin', 'record write: admin');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000007', 'ps-a-unverified@agency-a.example.test', false)
  = 'business_record_access_denied', 'an unverified staff member is refused');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000004', 'ps-a-unstaffed@agency-a.example.test', false)
  = 'business_record_access_denied', 'an unstaffed member of the same agency is refused');
select pg_temp.ps_assert((select access = 'admin' and work_ids is null from public.system_actor_scope('5e000000-0000-4000-8000-000000000010',
  '5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)), 'systems read: whole business');
select pg_temp.ps_assert((select access = 'admin' and work_ids is null from public.system_actor_scope('5e000000-0000-4000-8000-000000000010',
  '5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', true)), 'systems write: whole business');
select pg_temp.ps_assert(public.read_version_actor('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test')->'memberships'
  @> '[{"businessId":"5e000000-0000-4000-8000-000000000010","role":"admin","via":"provider_seat"}]'::jsonb
  and public.read_version_actor('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test')->'memberships'
  @> '[{"businessId":"5e000000-0000-4000-8000-000000000020","role":"member","via":"membership"}]'::jsonb, 'versions actor: seat and membership');
select pg_temp.ps_assert(public.read_version_actor('5e000000-0000-4000-8000-000000000004', 'ps-a-unstaffed@agency-a.example.test')->'memberships'
  = '[{"businessId":"5e000000-0000-4000-8000-000000000020","role":"member","via":"membership"}]'::jsonb, 'versions actor: unstaffed sees only the agency');
select pg_temp.ps_assert(public.system_version_member_role('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003',
  'ps-a-staff@agency-a.example.test') = 'admin'
  and '5e000000-0000-4000-8000-000000000010'::uuid = any(public.system_version_actor_workspaces('5e000000-0000-4000-8000-000000000003',
    'ps-a-staff@agency-a.example.test')), 'versions member helpers include the seat');
select pg_temp.ps_assert(public.workspace_require('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003',
  'manage_delegations') = 'admin', 'workspace permission: admin tier');
select pg_temp.ps_expect($$select public.workspace_require('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003',
  'invite_members')$$, 'workspace_permission_denied');
select pg_temp.ps_expect($$select public.workspace_require('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000004',
  'create_work')$$, 'workspace_membership_required');
select pg_temp.ps_assert(public.list_provided_clients('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020') @> '[{"customerWorkspaceId":"5e000000-0000-4000-8000-000000000010","role":"admin","access":"provider_seat","source":"business_choice"}]'::jsonb,
  'agency client list shows the seat');
select pg_temp.ps_assert(public.list_provided_clients('5e000000-0000-4000-8000-000000000004', 'ps-a-unstaffed@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020') = '[]'::jsonb, 'unstaffed members do not see the client');
select pg_temp.ps_assert(jsonb_array_length(public.read_agency_provider_seats('5e000000-0000-4000-8000-000000000004',
  'ps-a-unstaffed@agency-a.example.test', '5e000000-0000-4000-8000-000000000020')->0->'staff') = 2, 'the agency team sees who is staffed');
select pg_temp.ps_expect($$select public.read_agency_provider_seats('5e000000-0000-4000-8000-000000000005',
  'ps-b-owner@agency-b.example.test', '5e000000-0000-4000-8000-000000000020')$$, 'provider_seat_access_denied');

-- The exposed TypeScript authority resolver is executable only by service_role.
-- A verified staffed provider gets a seat claim, never an invented membership.
select pg_temp.ps_assert(has_function_privilege('service_role', 'public.read_version_actor(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_version_actor(uuid,text)', 'execute'), 'version resolver service-only');
select pg_temp.ps_assert(not exists(select 1 from public.workspace_memberships
  where workspace_id = '5e000000-0000-4000-8000-000000000010' and user_id = '5e000000-0000-4000-8000-000000000003'), 'staff has no direct client membership');
select pg_temp.ps_assert(public.read_version_actor('5e000000-0000-4000-8000-000000000003', 'wrong@example.test')->'memberships' = '[]'::jsonb, 'resolver rejects wrong verified email');
select pg_temp.ps_assert(public.read_version_actor('5e000000-0000-4000-8000-000000000007', 'ps-a-unverified@agency-a.example.test')->'memberships' = '[]'::jsonb, 'resolver rejects unverified staff');
select pg_temp.ps_assert(not (public.read_version_actor('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test')->'memberships'
  @> '[{"businessId":"5e000000-0000-4000-8000-000000000010","via":"provider_seat"}]'::jsonb), 'resolver rejects cross-agency staff');

-- Leaving the agency ends the person's staff row; being added back restores
-- nothing until an owner/admin staffs them again.
delete from public.workspace_memberships
  where workspace_id = '5e000000-0000-4000-8000-000000000020' and user_id = '5e000000-0000-4000-8000-000000000003';
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)
  = 'business_record_access_denied', 'removed from the agency: no access');
select pg_temp.ps_assert(public.read_version_actor('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test')->'memberships' = '[]'::jsonb, 'resolver sees membership removal immediately');
select pg_temp.ps_assert((select status = 'ended' and ended_by is null and ended_at is not null from public.agency_client_staff
  where agency_workspace_id = '5e000000-0000-4000-8000-000000000020' and user_id = '5e000000-0000-4000-8000-000000000003'),
  'leaving the agency ends the staff row');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000003', 'member', '5e000000-0000-4000-8000-000000000002');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)
  = 'business_record_access_denied', 'added back: still no client access');
select pg_temp.ps_assert(public.list_provided_clients('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020') = '[]'::jsonb, 'added back: the client is not listed');
select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000002', 'ps-a-owner@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000003', true);
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false) = 'admin',
  'staffed again: access again');

-- Another agency gets nothing from Agency A's seat, and cannot staff without one.
select pg_temp.ps_expect($$select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test',
  '5e000000-0000-4000-8000-000000000030', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', true)$$,
  'provider_seat_required');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test', false)
  = 'business_record_access_denied', 'another agency: no access');

-- The owner switches to Agency B: A's provider row, seat and staff all end; B
-- reaches the business by exactly the same path.
select public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000030');
select pg_temp.ps_assert((select status = 'ended' and end_reason = 'The owner chose another provider.' from public.workspace_providers
  where provider_workspace_id = '5e000000-0000-4000-8000-000000000020'), 'old provider ended');
select pg_temp.ps_assert((select status = 'ended' and ended_by = '5e000000-0000-4000-8000-000000000001' from public.provider_seats
  where agency_workspace_id = '5e000000-0000-4000-8000-000000000020'), 'old seat ended with the provider');
select pg_temp.ps_assert(not exists (select 1 from public.agency_client_staff
  where agency_workspace_id = '5e000000-0000-4000-8000-000000000020' and status = 'active'), 'old staff ended with the seat');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test', false)
  = 'business_record_access_denied', 'the old agency loses access');
select public.set_agency_client_staff('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test',
  '5e000000-0000-4000-8000-000000000030', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', true);
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test', true) = 'admin',
  'the new agency: same access, same path');

-- The agency steps back from the seat; attribution stays until the owner ends it.
select pg_temp.ps_expect($$select public.end_provider_seat('5e000000-0000-4000-8000-000000000003', 'ps-a-staff@agency-a.example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000030', null)$$, 'provider_seat_access_denied');
select pg_temp.ps_assert((public.end_provider_seat('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000030', null)->>'endedByKind') = 'agency', 'agency steps back');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test', false)
  = 'business_record_access_denied', 'no seat after stepping back');
select pg_temp.ps_assert(exists (select 1 from public.workspace_providers where provider_workspace_id = '5e000000-0000-4000-8000-000000000030'
  and status = 'active'), 'attribution kept');
select pg_temp.ps_assert(not (public.read_version_actor('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test')->'memberships'
  @> '[{"businessId":"5e000000-0000-4000-8000-000000000010","via":"provider_seat"}]'::jsonb), 'resolver sees ended seat immediately');
-- Choosing B again restores a seat; staff must be put back explicitly.
select pg_temp.ps_assert((public.choose_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000030')->>'replayed') = 'false', 'seat restored');
select pg_temp.ps_assert(pg_temp.ps_role('5e000000-0000-4000-8000-000000000005', 'ps-b-owner@agency-b.example.test', false)
  = 'business_record_access_denied', 'a restored seat has no staff yet');

-- The owner ends the provider: its seat ends too.
select pg_temp.ps_assert((public.end_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', 'Switching to in-house.')->>'ended') = 'true', 'provider ended');
select pg_temp.ps_assert(not exists (select 1 from public.provider_seats where customer_workspace_id = '5e000000-0000-4000-8000-000000000010'
  and status = 'active'), 'no active seat after the provider ends');
select pg_temp.ps_assert((public.end_business_provider('5e000000-0000-4000-8000-000000000001', 'ps-owner@example.test',
  '5e000000-0000-4000-8000-000000000010', null)->>'ended') = 'false', 'ending twice is a no-op');

-- History is append-only.
select pg_temp.ps_expect($$update public.provider_seats set granted_by_kind = 'conversion'$$, 'provider_seat_immutable');
select pg_temp.ps_expect($$update public.provider_seats set status = 'active', ended_at = null, ended_by = null where status = 'ended'$$, 'provider_seat_immutable');
select pg_temp.ps_expect($$delete from public.provider_seats$$, 'provider_seat_immutable');
select pg_temp.ps_expect($$update public.agency_client_staff set user_id = '5e000000-0000-4000-8000-000000000004'$$, 'agency_client_staff_immutable');
select pg_temp.ps_expect($$delete from public.agency_client_staff$$, 'agency_client_staff_immutable');
select pg_temp.ps_expect($$insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
  values ('5e000000-0000-4000-8000-000000000020', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000004',
    '5e000000-0000-4000-8000-000000000002')$$, 'agency_client_staff_invalid');

rollback;
