\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
 raise exception 'Expected error % for %',expected,statement;
end $$;

do $$ declare signature text; begin
 foreach signature in array array['public.read_connected_site_installer(uuid,uuid,text)','public.read_connected_site_connection_metadata(uuid)','public.create_connected_site_for_installer(uuid,uuid,text,jsonb)'] loop
 perform pg_temp.assert_true(has_function_privilege('service_role',signature,'execute'),'service role executes '||signature);
 perform pg_temp.assert_true(not has_function_privilege('anon',signature,'execute') and not has_function_privilege('authenticated',signature,'execute'),'client roles cannot execute '||signature);
 end loop;
end $$;

insert into public.users(id,email,verified_at) values
 ('bc120000-0000-4000-8000-000000000001','ct-owner@example.test',now()),
 ('bc120000-0000-4000-8000-000000000002','ct-staff@example.test',now()),
 ('bc120000-0000-4000-8000-000000000003','ct-admin@example.test',now()),
 ('bc120000-0000-4000-8000-000000000004','ct-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc120000-0000-4000-8000-000000000011','customer','Harbor Dental','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000012','agency','North Studio','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000013','agency','Twin Trees','bc120000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000001','owner','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000003','admin','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000004','member','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000012','bc120000-0000-4000-8000-000000000002','member','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000013','bc120000-0000-4000-8000-000000000002','admin','bc120000-0000-4000-8000-000000000001');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000012','owner','bc120000-0000-4000-8000-000000000001'),
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000013','owner','bc120000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('bc120000-0000-4000-8000-000000000012','bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','bc120000-0000-4000-8000-000000000001');

select pg_temp.assert_true(public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000001',' CT-OWNER@example.test ')->>'kind'='business','verified owner installs for business');
select pg_temp.assert_true(public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000003','ct-admin@example.test')->>'kind'='business','direct admin installs for business');
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000004','ct-member@example.test')$q$,'workspace_access_denied');
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000012','website','prepare','active','Fictional local consent','bc120000-0000-4000-8000-000000000001','bc120000-0000-4000-8000-000000000002',now()),
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000013','website','prepare','active','Fictional local consent','bc120000-0000-4000-8000-000000000001','bc120000-0000-4000-8000-000000000002',now());
select pg_temp.assert_true(public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')='{"kind":"agency","workspaceId":"bc120000-0000-4000-8000-000000000012"}','only actually staffed agency supplies holder');

-- Refuse current identity, membership, staffing, seat and area losses.
savepoint valid_authority;
update public.users set verified_at=null where id='bc120000-0000-4000-8000-000000000002';
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
rollback to valid_authority;
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','other@example.test')$q$,'workspace_access_denied');
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000012','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
update public.agency_scope_grants set status='ended',ended_by='bc120000-0000-4000-8000-000000000001',ended_at=now() where agency_workspace_id='bc120000-0000-4000-8000-000000000012';
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
select pg_temp.expect_error($q$select public.create_connected_site_for_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test','{"installerHolder":{"kind":"agency","workspaceId":"bc120000-0000-4000-8000-000000000012"}}')$q$,'workspace_access_denied');
rollback to valid_authority;
update public.agency_client_staff set status='ended',ended_by='bc120000-0000-4000-8000-000000000001',ended_at=now() where agency_workspace_id='bc120000-0000-4000-8000-000000000012';
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
rollback to valid_authority;
update public.provider_seats set status='ended',ended_by='bc120000-0000-4000-8000-000000000001',ended_at=now() where agency_workspace_id='bc120000-0000-4000-8000-000000000012';
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
rollback to valid_authority;
delete from public.workspace_memberships where workspace_id='bc120000-0000-4000-8000-000000000012' and user_id='bc120000-0000-4000-8000-000000000002';
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
rollback to valid_authority;
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values ('bc120000-0000-4000-8000-000000000013','bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','bc120000-0000-4000-8000-000000000001');
select pg_temp.expect_error($q$select public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')$q$,'workspace_access_denied');
rollback to valid_authority;
update public.agency_scope_grants set status='ended',ended_by='bc120000-0000-4000-8000-000000000001',ended_at=now() where agency_workspace_id='bc120000-0000-4000-8000-000000000012' and scope='website';
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000012','website','full_control','active','Fictional local consent','bc120000-0000-4000-8000-000000000001','bc120000-0000-4000-8000-000000000002',now());
select pg_temp.assert_true(public.read_connected_site_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test')->>'kind'='agency','Full control also carries the website area');
rollback to valid_authority;

-- Atomic create refuses absent/stale holder and retains no inserted site.
select pg_temp.expect_error($q$select public.create_connected_site_for_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test','{}')$q$,'workspace_access_denied');
select pg_temp.expect_error($q$select public.create_connected_site_for_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test','{"installerHolder":{"kind":"business","workspaceId":"bc120000-0000-4000-8000-000000000011"}}')$q$,'workspace_access_denied');
select public.create_connected_site_for_installer('bc120000-0000-4000-8000-000000000011','bc120000-0000-4000-8000-000000000002','ct-staff@example.test',jsonb_build_object('installerHolder',jsonb_build_object('kind','agency','workspaceId','bc120000-0000-4000-8000-000000000012'),'publicKey','sk_pub_'||repeat('n',24),'verificationToken',repeat('t',32),'label','Harbor Dental','siteUrl','https://harbor.example/','siteHost','harbor.example','allowedOrigins',jsonb_build_array('https://harbor.example'),'platform','unknown'));
select pg_temp.assert_true(jsonb_array_length(public.read_connected_site_connection_metadata('bc120000-0000-4000-8000-000000000011'))=1,'source lists metadata for exact business');
-- Cross-lane installer/source contract: record the actual newly inserted site,
-- preserve its agency holder, and require verification before a Version binds.
select public.record_connection_holder('bc120000-0000-4000-8000-000000000011',
 'bc120000-0000-4000-8000-000000000002','ct-staff@example.test','connected_site:'||s.id,'connected_site',
 '{"kind":"agency","workspaceId":"bc120000-0000-4000-8000-000000000012"}','{"kind":"platform"}',gen_random_uuid(),repeat('b',64))
from public.connected_sites s where s.business_workspace_id='bc120000-0000-4000-8000-000000000011';
select pg_temp.assert_true(public.read_system_version_connection_owner('bc120000-0000-4000-8000-000000000002',
 'ct-staff@example.test','connected_site:'||s.id) is null,'unverified installed site cannot bind')
from public.connected_sites s where s.business_workspace_id='bc120000-0000-4000-8000-000000000011';
update public.connected_sites set verified_at=clock_timestamp() where business_workspace_id='bc120000-0000-4000-8000-000000000011';
select pg_temp.assert_true(public.read_system_version_connection_owner('bc120000-0000-4000-8000-000000000002',
 'ct-staff@example.test','connected_site:'||s.id)='bc120000-0000-4000-8000-000000000011'::uuid,'verified agency-installed site binds for staffed agency')
from public.connected_sites s where s.business_workspace_id='bc120000-0000-4000-8000-000000000011';
select pg_temp.assert_true(public.read_system_version_connection_owner('bc120000-0000-4000-8000-000000000001',
 'ct-owner@example.test','connected_site:'||s.id) is null,'business cannot borrow agency-installed site')
from public.connected_sites s where s.business_workspace_id='bc120000-0000-4000-8000-000000000011';

select pg_temp.assert_true(public.read_connected_site_connection_metadata('bc120000-0000-4000-8000-000000000013')='[]','sibling workspace has no metadata');
select pg_temp.assert_true((select array_agg(k order by k)=array['business_workspace_id','created_at','id','label','status','verified_at'] from jsonb_object_keys(public.read_connected_site_connection_metadata('bc120000-0000-4000-8000-000000000011')->0) k),'metadata has only safe display fields');
rollback;
