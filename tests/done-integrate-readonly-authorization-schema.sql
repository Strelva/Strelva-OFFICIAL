\set ON_ERROR_STOP on
create function pg_temp.ro_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'readonly authorization: %',note;end if;end$$;
create function pg_temp.ro_refuse(statement text,reason text) returns void language plpgsql as $$begin begin execute statement;exception when others then if sqlerrm<>reason and sqlstate<>reason then raise exception 'expected %, got % (%)',reason,sqlerrm,sqlstate;end if;return;end;raise exception 'expected refusal %, succeeded',reason;end$$;
begin;
insert into public.users(id,email,verified_at) values
 ('d0170000-0000-4000-8000-000000000001','readonly-business-owner@example.test',now()),
 ('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test',now()),
 ('d0170000-0000-4000-8000-000000000003','readonly-agency-member@example.test',now()),
 ('d0170000-0000-4000-8000-000000000004','readonly-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('d0170000-0000-4000-8000-000000000010','customer','Readonly business','d0170000-0000-4000-8000-000000000001'),
 ('d0170000-0000-4000-8000-000000000020','agency','Readonly agency','d0170000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000001','owner','d0170000-0000-4000-8000-000000000001'),
 ('d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000002','owner','d0170000-0000-4000-8000-000000000002'),
 ('d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000003','member','d0170000-0000-4000-8000-000000000002');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
 values('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000020','owner','d0170000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by)
 values('d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','d0170000-0000-4000-8000-000000000001');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000020','inquiries','prepare','active','Fictional inquiry scope','d0170000-0000-4000-8000-000000000001','d0170000-0000-4000-8000-000000000002',now()),
 ('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000020','website','prepare','proposed','Fictional proposed scope','d0170000-0000-4000-8000-000000000001',null,null);
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,created_by) values
 ('d0170000-0000-4000-8000-000000000030','d0170000-0000-4000-8000-000000000010','requested','Fictional website draft','Review the draft','{}',array['request_changes'],'agency','d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000001');
commit;

begin read only;
set local role service_role;
select pg_temp.ro_assert(jsonb_array_length(public.read_agency_proposals('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test','d0170000-0000-4000-8000-000000000020'))=1,'proposal with exact identity reads through service role');
select pg_temp.ro_assert(public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test')->>'canManage'='true','staffed agency reads inquiry forwarding');
select pg_temp.ro_assert(public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000001','readonly-business-owner@example.test')->>'canManage'='true','direct owner reads forwarding');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->>'displayName'='Readonly agency','request name reader traverses agency authority');
select pg_temp.ro_refuse($q$select public.read_agency_proposals('d0170000-0000-4000-8000-000000000003','readonly-agency-member@example.test','d0170000-0000-4000-8000-000000000020')$q$,'agency_directory_denied');
select pg_temp.ro_refuse($q$select public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000004','readonly-outsider@example.test')$q$,'inquiry_forwarding_access_denied');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000004','readonly-outsider@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->'displayName'='null'::jsonb,'outsider receives no provider identity');
select pg_temp.ro_refuse($q$select public.read_agency_proposals('d0170000-0000-4000-8000-000000000002','readonly-stale-email@example.test','d0170000-0000-4000-8000-000000000020')$q$,'agency_directory_denied');
select pg_temp.ro_refuse($q$select public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','readonly-stale-email@example.test')$q$,'inquiry_forwarding_access_denied');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000002','readonly-stale-email@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->'displayName'='null'::jsonb,'stale email reveals no agency identity');
reset role;
select pg_temp.ro_assert(jsonb_array_length(public.read_agency_proposals_before_ux_agency_identity('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test','d0170000-0000-4000-8000-000000000020'))=1,'private predecessor remains a reader');
-- Writers still take the original locks and therefore refuse READ ONLY.
select pg_temp.ro_refuse($q$select public.agency_directory_assert_manager('d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test')$q$,'25006');
select pg_temp.ro_refuse($q$select public.inquiry_forwarding_actor('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000001','readonly-business-owner@example.test',true)$q$,'25006');
select pg_temp.ro_refuse($q$select public.service_request_assert_agency_client('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000002',true,'readonly-agency-manager@example.test')$q$,'25006');
select pg_temp.ro_assert(not has_function_privilege('service_role','public.agency_directory_assert_manager_readonly(uuid,uuid,text)','execute') and not has_function_privilege('authenticated','public.inquiry_forwarding_actor_readonly(uuid,uuid,text)','execute') and not has_function_privilege('anon','public.service_request_assert_agency_client_readonly(uuid,uuid,uuid,text)','execute'),'new helpers stay private');
commit;

update public.users set verified_at=null where id='d0170000-0000-4000-8000-000000000002';
begin read only;
set local role service_role;
select pg_temp.ro_refuse($q$select public.read_agency_proposals('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test','d0170000-0000-4000-8000-000000000020')$q$,'agency_directory_denied');
select pg_temp.ro_refuse($q$select public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test')$q$,'inquiry_forwarding_access_denied');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->'displayName'='null'::jsonb,'revoked verified identity denies all request reads');
commit;
update public.users set verified_at=now() where id='d0170000-0000-4000-8000-000000000002';
update public.provider_seats set status='ended',ended_at=now(),ended_by='d0170000-0000-4000-8000-000000000001' where customer_workspace_id='d0170000-0000-4000-8000-000000000010' and status='active';
begin read only;
set local role service_role;
select pg_temp.ro_refuse($q$select public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test')$q$,'inquiry_forwarding_access_denied');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->'displayName'='null'::jsonb,'ended seat closes request reads');
commit;
-- Ended seats are immutable. A new explicit seat reauthorizes this fixture.
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
 values('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000020','owner','d0170000-0000-4000-8000-000000000001');
-- Seat revocation also ended its staff; reassign a fresh immutable row.
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by)
 values('d0170000-0000-4000-8000-000000000020','d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','d0170000-0000-4000-8000-000000000001');
update public.agency_client_staff set status='ended',ended_at=now(),ended_by='d0170000-0000-4000-8000-000000000001' where customer_workspace_id='d0170000-0000-4000-8000-000000000010' and status='active';
begin read only;
set local role service_role;
select pg_temp.ro_refuse($q$select public.read_inquiry_forwarding('d0170000-0000-4000-8000-000000000010','d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test')$q$,'inquiry_forwarding_access_denied');
select pg_temp.ro_assert(public.read_service_request_agency_names('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test',array['d0170000-0000-4000-8000-000000000030']::uuid[])->0->'displayName'='null'::jsonb,'ended staffing closes request reads');
commit;
update public.workspace_memberships set role='member' where workspace_id='d0170000-0000-4000-8000-000000000020' and user_id='d0170000-0000-4000-8000-000000000002';
begin read only;
set local role service_role;
select pg_temp.ro_refuse($q$select public.read_agency_proposals('d0170000-0000-4000-8000-000000000002','readonly-agency-manager@example.test','d0170000-0000-4000-8000-000000000020')$q$,'agency_directory_denied');
commit;
