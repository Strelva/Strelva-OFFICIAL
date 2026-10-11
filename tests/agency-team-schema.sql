\set ON_ERROR_STOP on
begin;
create function pg_temp.team_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency team assertion failed: %',message; end if; end; $$;
create function pg_temp.team_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end;
  raise exception 'expected % but succeeded',expected;
end; $$;
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


update public.workspace_memberships set role='admin' where user_id='5e000000-0000-4000-8000-000000000004';
insert into public.workspaces(id,kind,name,created_by) values
 ('5e000000-0000-4000-8000-000000000011','customer','Seat Client Two','5e000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('5e000000-0000-4000-8000-000000000011','5e000000-0000-4000-8000-000000000001','owner','5e000000-0000-4000-8000-000000000001');
select public.choose_business_provider('5e000000-0000-4000-8000-000000000001','ps-owner@example.test','5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000020');
select public.choose_business_provider('5e000000-0000-4000-8000-000000000001','ps-owner@example.test','5e000000-0000-4000-8000-000000000011','5e000000-0000-4000-8000-000000000020');
-- Context helpers run the actual commands with owner/admin/member identities.
create function pg_temp.team_read(who integer, agency integer default 20) returns jsonb language sql as $$
 select public.read_agency_team(('5e000000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid,
 (select email from public.users where id=('5e000000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid),
 ('5e000000-0000-4000-8000-'||lpad(agency::text,12,'0'))::uuid);
$$;
create function pg_temp.team_bulk(who integer, clients uuid[], active boolean default true) returns jsonb language sql as $$
 select public.bulk_set_agency_client_staff(('5e000000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid,
 (select email from public.users where id=('5e000000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid),
 '5e000000-0000-4000-8000-000000000020',array['5e000000-0000-4000-8000-000000000003'::uuid],clients,active);
$$;
select pg_temp.team_assert(not has_function_privilege('authenticated','public.read_agency_team(uuid,text,uuid)','execute')
 and not has_function_privilege('service_role','public.agency_team_require(uuid,text,uuid,boolean)','execute'),'internal helper and authenticated deny');
select pg_temp.team_assert((pg_temp.team_read(2)->>'canManage')::boolean and (pg_temp.team_read(4)->>'canManage')::boolean,'owner and admin can manage');
select pg_temp.team_assert(not (pg_temp.team_read(3)->>'canManage')::boolean,'member is read only');
select pg_temp.team_assert(jsonb_array_length(pg_temp.team_read(2)->'clients')=2,'unstaffed manager sees all seats');
select pg_temp.team_expect($$select pg_temp.team_read(5)$$,'agency_team_access_denied');
select pg_temp.team_expect($$select pg_temp.team_read(7)$$,'agency_team_access_denied');
select pg_temp.team_expect($$select pg_temp.team_bulk(3,array['5e000000-0000-4000-8000-000000000010'::uuid])$$,'agency_team_access_denied');
-- Second client fails after the first assignment; transaction leaves no first write.
select pg_temp.team_expect($$select pg_temp.team_bulk(4,array['5e000000-0000-4000-8000-000000000010'::uuid,'5e000000-0000-4000-8000-000000000030'::uuid])$$,'provider_seat_required');
select pg_temp.team_assert(not exists(select 1 from public.agency_client_staff where user_id='5e000000-0000-4000-8000-000000000003'),'bulk failure rolls back first assignment');
select pg_temp.team_assert(jsonb_array_length(pg_temp.team_bulk(4,array['5e000000-0000-4000-8000-000000000010'::uuid,'5e000000-0000-4000-8000-000000000011'::uuid,'5e000000-0000-4000-8000-000000000010'::uuid])->'results')=2,'deduped bulk assigns both');
select pg_temp.team_assert(public.business_record_assert_actor('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test',true)='admin','assigned staff can act');
select pg_temp.team_assert((pg_temp.team_bulk(2,array['5e000000-0000-4000-8000-000000000010'::uuid])->'results'->0->>'changed')='false','repeat no-op');
select pg_temp.team_bulk(4,array['5e000000-0000-4000-8000-000000000010'::uuid],false);
select pg_temp.team_assert(not exists(select 1 from public.agency_client_staff where customer_workspace_id='5e000000-0000-4000-8000-000000000010' and status='active'),'unassign ends access');
select pg_temp.team_expect($$select pg_temp.team_bulk(4,array[]::uuid[])$$,'agency_team_bulk_invalid');
select pg_temp.team_expect($$select pg_temp.team_bulk(4,array[null]::uuid[])$$,'agency_team_bulk_invalid');
select pg_temp.team_expect($$select public.manage_agency_team_member('5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test','5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000004','member')$$,'agency_team_access_denied');
select pg_temp.team_expect($$select public.manage_agency_team_member('5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000002',null)$$,'agency_team_member_protected');
select public.manage_agency_team_member('5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000003','admin');
select pg_temp.team_assert((select role='admin' from public.workspace_memberships where user_id='5e000000-0000-4000-8000-000000000003'),'admin changes agency role');
-- Regression: unstaffed Client One still permits accepted agency work.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,payload,created_by)
select ('5e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '5e000000-0000-4000-8000-000000000010','operations','responsibility','{}',
 '5e000000-0000-4000-8000-000000000001' from generate_series(101,104) n;
insert into public.operational_assignments(id,workspace_id,work_id,sponsor_id,sponsor_email,
 assignee_user_id,assignee_email,assignee_kind,assignee_workspace_id,offer_key,work_scope,status,accepted_at,expires_at)
select ('5e000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
 '5e000000-0000-4000-8000-000000000010',('5e000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '5e000000-0000-4000-8000-000000000001','ps-owner@example.test',
 '5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test',
 case when n=104 then 'staff' else 'agency' end,
 case when n=104 then null when n=103 then '5e000000-0000-4000-8000-000000000030'::uuid
 else '5e000000-0000-4000-8000-000000000020'::uuid end,
 'team-rejoin-'||n,'{}',case when n=102 then 'offered' else 'accepted' end,
 case when n=102 then null else now() end,now()+interval '1 day' from generate_series(101,104) n;
insert into public.offering_installations(id,business_workspace_id,definition_id,definition_version,native_resources,
 responsibility,accepted_scope,surface_ids,idempotency_key,command_digest,installed_by,updated_by)
values('5e000000-0000-4000-8000-000000000301','5e000000-0000-4000-8000-000000000010',
 'team_rejoin','1.0.0','[]','{}',array['operate'],array['team'],'team-rejoin',repeat('a',64),
 '5e000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001');
insert into public.offering_provider_deliveries(business_workspace_id,installation_id,assignment_id,status,scope,
 idempotency_key,command_digest,requested_by,expires_at,accepted_by,accepted_at,history)
values('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000301',
 '5e000000-0000-4000-8000-000000000201','accepted',array['operate'],'team-rejoin',repeat('a',64),
 '5e000000-0000-4000-8000-000000000001',now()+interval '1 day',
 '5e000000-0000-4000-8000-000000000003',now(),'[]');
select pg_temp.team_assert(public.business_record_assert_actor('5e000000-0000-4000-8000-000000000010',
 '5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test',true)='agency',
 'accepted unexpired agency assignment permits writing without staffing');
-- A revocation failure must roll back membership and earlier staff cleanup.
create function pg_temp.team_block_revocation() returns trigger language plpgsql as $$
begin raise exception 'team_test_revocation_failed'; end; $$;
create trigger team_test_block_revocation before update on public.operational_assignments
 for each row execute function pg_temp.team_block_revocation();
select pg_temp.team_expect($$select public.manage_agency_team_member('5e000000-0000-4000-8000-000000000004',
 'ps-a-unstaffed@agency-a.example.test','5e000000-0000-4000-8000-000000000020',
 '5e000000-0000-4000-8000-000000000003',null)$$,'team_test_revocation_failed');
select pg_temp.team_assert(exists(select 1 from public.workspace_memberships
 where workspace_id='5e000000-0000-4000-8000-000000000020' and user_id='5e000000-0000-4000-8000-000000000003')
 and exists(select 1 from public.agency_client_staff where customer_workspace_id='5e000000-0000-4000-8000-000000000011'
 and user_id='5e000000-0000-4000-8000-000000000003' and status='active'),
 'failed revocation rolls back membership deletion and staff cleanup');
drop trigger team_test_block_revocation on public.operational_assignments;
select public.manage_agency_team_member('5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000003',null);
select pg_temp.team_assert(not exists(select 1 from public.agency_client_staff where user_id='5e000000-0000-4000-8000-000000000003' and status='active'),'membership removal ends all staff rows');
select pg_temp.team_expect($$select public.business_record_assert_actor('5e000000-0000-4000-8000-000000000010',
 '5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test',true)$$,'business_record_access_denied');
select public.create_workspace_invitation('5e000000-0000-4000-8000-000000000020',
 '5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test',
 'ps-a-staff@agency-a.example.test','member',repeat(md5('agency-team-rejoin-261'),2),now()+interval '1 day');
select pg_temp.team_assert((select applied_role='member' from public.accept_workspace_invitation(
 repeat(md5('agency-team-rejoin-261'),2),'5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test')),
 'removed staff re-invited and accepted');
select pg_temp.team_expect($$select public.business_record_assert_actor('5e000000-0000-4000-8000-000000000010',
 '5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test',true)$$,'business_record_access_denied');
select pg_temp.team_assert((select count(*)=2 from public.operational_assignments
 where id in ('5e000000-0000-4000-8000-000000000201','5e000000-0000-4000-8000-000000000202')
 and status='revoked' and revoked_by='5e000000-0000-4000-8000-000000000004' and revoked_at is not null),
 'accepted and offered agency assignments retain removal actor and time');
select pg_temp.team_assert((select count(*)=2 from public.operational_assignments
 where id in ('5e000000-0000-4000-8000-000000000203','5e000000-0000-4000-8000-000000000204') and status='accepted'),
 'other agency and direct staff assignments untouched');
select pg_temp.team_assert((select ended_by='5e000000-0000-4000-8000-000000000004'
 and ended_at=(select revoked_at from public.operational_assignments where id='5e000000-0000-4000-8000-000000000201')
 from public.agency_client_staff where customer_workspace_id='5e000000-0000-4000-8000-000000000011'
 and user_id='5e000000-0000-4000-8000-000000000003'),'staff and assignment cleanup share actor and timestamp');
select pg_temp.team_assert(not exists(select 1 from public.agency_client_staff where user_id='5e000000-0000-4000-8000-000000000003' and status='active'),'rejoin restores no assignments');
-- Administrative membership deletes also revoke work, without guessing an actor.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('5e000000-0000-4000-8000-000000000030','5e000000-0000-4000-8000-000000000003','member',
 '5e000000-0000-4000-8000-000000000005');
delete from public.workspace_memberships where workspace_id='5e000000-0000-4000-8000-000000000030'
 and user_id='5e000000-0000-4000-8000-000000000003';
select pg_temp.team_assert((select status='revoked' and revoked_at is not null and revoked_by is null
 from public.operational_assignments where id='5e000000-0000-4000-8000-000000000203'),
 'direct delete cleans assignments and does not leak previous removal actor');
-- Admin invitations reuse ordinary invitation tokens and acceptance. No owner elevation.
select public.create_workspace_invitation('5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','ps-stranger@example.test','member',repeat(md5('agency-team-261-a'),2),now()+interval '1 day');
select pg_temp.team_assert(jsonb_array_length(pg_temp.team_read(4)->'invitations')=1 and pg_temp.team_read(3)->'invitations'='[]'::jsonb,'pending invites private to managers');
select pg_temp.team_assert((select applied_role='member' from public.accept_workspace_invitation(repeat(md5('agency-team-261-a'),2),'5e000000-0000-4000-8000-000000000006','ps-stranger@example.test')),'admin-sponsored acceptance');
select pg_temp.team_expect($$select public.create_workspace_invitation('5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','nobody@example.test','owner',repeat(md5('agency-team-261-b'),2),now()+interval '1 day')$$,'workspace_invitation_owner_required');
select public.create_workspace_invitation('5e000000-0000-4000-8000-000000000020','5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test','ps-a-staff@agency-a.example.test','admin',repeat(md5('agency-team-261-c'),2),now()+interval '1 day');
update public.workspace_memberships set role='member' where user_id='5e000000-0000-4000-8000-000000000004';
select pg_temp.team_expect($$select * from public.accept_workspace_invitation(repeat(md5('agency-team-261-c'),2),'5e000000-0000-4000-8000-000000000003','ps-a-staff@agency-a.example.test')$$,'workspace_invitation_sponsor_invalid');
update public.workspace_memberships set role='admin' where user_id='5e000000-0000-4000-8000-000000000004';
select pg_temp.team_assert(public.revoke_workspace_invitation((select id from public.workspace_invitations where token_hash=repeat(md5('agency-team-261-c'),2)),'5e000000-0000-4000-8000-000000000004','ps-a-unstaffed@agency-a.example.test')='revoked','admin revokes staff invitation');
rollback;
