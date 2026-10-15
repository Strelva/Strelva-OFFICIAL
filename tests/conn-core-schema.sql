\set ON_ERROR_STOP on
begin;
create function pg_temp.conn_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'conn_core_assert: %',label; end if; end $$;
create function pg_temp.conn_refuses(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
 if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end;
 raise exception 'expected refusal %',expected;
end $$;
insert into public.users(id,email,verified_at) values
 ('c1000000-0000-4000-8000-000000000001','conn-owner@example.test',now()),
 ('c1000000-0000-4000-8000-000000000002','conn-agency@example.test',now()),
 ('c1000000-0000-4000-8000-000000000003','conn-other@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('c1000000-0000-4000-8000-000000000010','customer','Harbor Dental','c1000000-0000-4000-8000-000000000001'),
 ('c1000000-0000-4000-8000-000000000011','agency','North Studio','c1000000-0000-4000-8000-000000000002'),
 ('c1000000-0000-4000-8000-000000000012','customer','Twin Trees','c1000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000001','owner','c1000000-0000-4000-8000-000000000001'),
 ('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000002','owner','c1000000-0000-4000-8000-000000000002'),
 ('c1000000-0000-4000-8000-000000000012','c1000000-0000-4000-8000-000000000003','owner','c1000000-0000-4000-8000-000000000003');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000011','owner','c1000000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000011','google','prepare','active','Fictional Google permission','c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002',now());

insert into public.workspace_account_bindings(id,workspace_id,provider,status,migrated_from) values
 ('c1000000-0000-4000-8000-000000000040','c1000000-0000-4000-8000-000000000010','google','connected','oauth'),
 ('c1000000-0000-4000-8000-000000000041','c1000000-0000-4000-8000-000000000012','google','connected','oauth');
insert into public.workspace_calendar_connections(id,workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values
 ('c1000000-0000-4000-8000-000000000042','c1000000-0000-4000-8000-000000000010','google','harbor','Harbor','America/New_York','connected','c1000000-0000-4000-8000-000000000001');

insert into public.connected_accounts(workspace_id,state,generation) values ('c1000000-0000-4000-8000-000000000010','pending',7);
insert into public.workspace_google_read_grants(workspace_id,subject,google_email,scopes,refresh_token_ciphertext,connected_by) values
 ('c1000000-0000-4000-8000-000000000010','fictional','conn-owner@example.test',array['https://www.googleapis.com/auth/webmasters.readonly'],'enc:v1:AAAA:BBBB:CCCC','c1000000-0000-4000-8000-000000000001');

do $$ declare
 business uuid:='c1000000-0000-4000-8000-000000000010'; agency uuid:='c1000000-0000-4000-8000-000000000011';
 owner uuid:='c1000000-0000-4000-8000-000000000001'; staff uuid:='c1000000-0000-4000-8000-000000000002'; outsider uuid:='c1000000-0000-4000-8000-000000000003';
 cmd uuid:='c1000000-0000-4000-8000-000000000020';
 holder jsonb:=jsonb_build_object('kind','agency','workspaceId',agency);
 statement text; changed text;
begin
 perform pg_temp.conn_assert(public.read_connection_actor_scope(business,owner,'conn-owner@example.test')->'actingAgencyWorkspaceId'='null'::jsonb,'business acts directly');
 perform pg_temp.conn_assert(public.read_connection_actor_scope(business,staff,'conn-agency@example.test')->>'actingAgencyWorkspaceId'=agency::text,'staff seat agency');
 perform pg_temp.conn_refuses(format('select public.read_connection_actor_scope(%L,%L,%L)',business,outsider,'conn-other@example.test'),'connection_access_denied');
 perform pg_temp.conn_refuses(format('select public.read_connection_actor_scope(%L,%L,%L)',business,owner,'wrong@example.test'),'connection_access_denied');
 perform pg_temp.conn_assert(public.connection_agency_holds_area(agency,business,'google'),'active Prepare counts');
 perform pg_temp.conn_assert(not public.connection_agency_holds_area(agency,business,'bookings'),'missing area denies');
 perform pg_temp.conn_assert(not public.connection_agency_holds_area(agency,business,'garbage'),'unknown area denies');
 statement:=format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,staff,'conn-agency@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040','google_business_profile',holder,holder,cmd,repeat('a',64));
 execute statement; execute statement;
 perform pg_temp.conn_assert((select count(*) from public.connection_holders)=1 and (select count(*) from public.connection_holder_commands)=1,'replay stores once');
 perform pg_temp.conn_assert(jsonb_array_length(public.read_connection_holders(business))=1,'trusted holder read');
 perform pg_temp.conn_assert(public.read_connection_holders('c1000000-0000-4000-8000-000000000012')='[]'::jsonb,'sibling sees no holders');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(staff,'conn-agency@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040')=business,'agency account resolves only as served business');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040') is null,'business actor cannot borrow agency account');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(outsider,'conn-other@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040') is null,'sibling cannot borrow source account');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(staff,'conn-agency@example.test','google_business_profile:unrecorded') is null,'unrecorded ref refused');
 -- Reusing a digest while changing the body is still a conflicting command.
 changed:=replace(statement,quote_literal(holder::text),quote_literal(jsonb_build_object('kind','business','workspaceId',business)::text));
 perform pg_temp.conn_refuses(changed,'connection_access_denied'); -- invalid business access holder
 perform pg_temp.conn_refuses(replace(statement,repeat('a',64),repeat('b',64)),'connection_command_conflict');
 perform pg_temp.conn_refuses(replace(statement,'google_business_profile:c1000000-0000-4000-8000-000000000040','google_business_profile:c1000000-0000-4000-8000-000000000041'),'connection_access_denied'); -- sibling source cannot be claimed
 perform pg_temp.conn_refuses(replace(statement,'conn-agency@example.test','conn-owner@example.test'),'connection_access_denied');
 -- Product refs preserve Stripe generation and Google's read-grant identity.
 perform public.record_connection_holder(business,owner,'conn-owner@example.test','stripe:'||business||':7','stripe',jsonb_build_object('kind','business','workspaceId',business),'{"kind":"platform"}',gen_random_uuid(),repeat('8',64));
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','stripe:'||business||':7') is null,'pending Connect records ownership but does not bind');
 update public.connected_accounts set state='ready',stripe_account_id='acct_ConnFictional',configurations=array['merchant'] where workspace_id=business;
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','stripe:'||business||':7')=business,'ready current Connect generation binds');
 update public.connected_accounts set generation=8 where workspace_id=business;
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','stripe:'||business||':7') is null,'prior Connect generation cannot bind');
 perform pg_temp.conn_refuses(format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,owner,'conn-owner@example.test','stripe:'||business||':7','stripe',jsonb_build_object('kind','business','workspaceId',business),'{"kind":"platform"}',gen_random_uuid(),repeat('9',64)),'connection_access_denied');
 perform public.record_connection_holder(business,owner,'conn-owner@example.test','google_business_profile:read-grant:'||business,'google_business_profile',jsonb_build_object('kind','business','workspaceId',business),'{"kind":"platform"}',gen_random_uuid(),repeat('7',64));
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_business_profile:read-grant:'||business)=business,'current read grant binds to own business');
 update public.workspace_google_read_grants set status='revoked',refresh_token_ciphertext=null,access_token_ciphertext=null where workspace_id=business;
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_business_profile:read-grant:'||business) is null,'revoked read grant cannot bind');
 -- Multiple current seats do not select an agency by UUID order.
 insert into public.workspaces(id,kind,name,created_by) values ('c1000000-0000-4000-8000-000000000009','agency','Second Studio',staff);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('c1000000-0000-4000-8000-000000000009',staff,'owner',staff);
 insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values (business,'c1000000-0000-4000-8000-000000000009','owner',owner);
 insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values ('c1000000-0000-4000-8000-000000000009',business,staff,staff);
 perform pg_temp.conn_assert(jsonb_array_length(public.read_connection_actor_scope(business,staff,'conn-agency@example.test')->'actingAgencyWorkspaceIds')=2,'all verified staffed seats returned');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(staff,'conn-agency@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040')=business,'configured holder agency remains usable with a lower UUID seat present');
 -- Same command/digest, valid but different body still conflicts.
 perform pg_temp.conn_refuses(format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,staff,'conn-agency@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040','google_business_profile',jsonb_build_object('kind','business','workspaceId',business),holder,cmd,repeat('a',64)),'connection_command_conflict');
 -- Source status is independently authoritative after holder recording.
 perform public.record_connection_holder(business,owner,'conn-owner@example.test','google_calendar:c1000000-0000-4000-8000-000000000042','google_calendar',jsonb_build_object('kind','business','workspaceId',business),'{"kind":"platform"}',gen_random_uuid(),repeat('f',64));
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_calendar:c1000000-0000-4000-8000-000000000042')=business,'live calendar bindable');
 update public.workspace_calendar_connections set status='revoked' where id='c1000000-0000-4000-8000-000000000042';
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_calendar:c1000000-0000-4000-8000-000000000042') is null,'revoked source refused');
 delete from public.workspace_calendar_connections where id='c1000000-0000-4000-8000-000000000042';
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'conn-owner@example.test','google_calendar:c1000000-0000-4000-8000-000000000042') is null,'deleted source refused');
 -- Missing holder fields/unknown holder cannot pass SQL NULL truthiness.
 perform pg_temp.conn_refuses(format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,owner,'conn-owner@example.test','stripe:bad','stripe','{}','{"kind":"platform"}',gen_random_uuid(),repeat('d',64)),'connection_access_denied');
 update public.agency_scope_grants set status='ended',ended_by=owner,ended_at=clock_timestamp() where customer_workspace_id=business and scope='google';
 perform pg_temp.conn_assert(not public.connection_agency_holds_area(agency,business,'google'),'ended grant denies');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(staff,'conn-agency@example.test','google_business_profile:c1000000-0000-4000-8000-000000000040') is null,'ended area blocks binding');
 perform pg_temp.conn_refuses(statement,'connection_access_denied'); -- replay rechecks current authority
 insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by)
 values (business,agency,'google','full_control','proposed','Fictional consent',owner);
 perform pg_temp.conn_assert(not public.connection_agency_holds_area(agency,business,'google'),'proposed grant does not count');
 update public.agency_scope_grants set status='active',responded_by=staff,responded_at=clock_timestamp() where customer_workspace_id=business and agency_workspace_id=agency and scope='google' and status='proposed';
 perform pg_temp.conn_assert(public.connection_agency_holds_area(agency,business,'google'),'active Full control counts');
 update public.provider_seats set status='ended',ended_by=owner,ended_at=clock_timestamp() where customer_workspace_id=business;
 perform pg_temp.conn_refuses(format('select public.read_connection_actor_scope(%L,%L,%L)',business,staff,'conn-agency@example.test'),'connection_access_denied');
end $$;
-- Check grants across all client roles and all new functions/tables.
select pg_temp.conn_assert((select bool_and(relrowsecurity) from pg_class where oid in ('public.connection_holders'::regclass,'public.connection_holder_commands'::regclass)),'RLS enabled');
do $$ declare role_name text; table_name text; f record; begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
 foreach table_name in array array['connection_holders','connection_holder_commands'] loop
 perform pg_temp.conn_assert(not has_table_privilege(role_name,'public.'||table_name,'select,insert,update,delete'),'tables private: '||role_name); end loop; end loop;
 for f in select signature from conn_core_rollback.functions where before_definition is null loop
 perform pg_temp.conn_assert(not has_function_privilege('anon',f.signature,'execute') and not has_function_privilege('authenticated',f.signature,'execute'),'RPC client denial'); end loop;
 perform pg_temp.conn_assert(has_function_privilege('service_role','public.record_connection_holder(uuid,uuid,text,text,text,jsonb,jsonb,uuid,text)','execute'),'service RPC allowed');
 perform pg_temp.conn_assert(not has_function_privilege('service_role','public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb)','execute'),'helper stays private');
end $$;
rollback;
-- All reader functions work in a READ ONLY transaction, including the trusted server read.
begin read only;
select public.read_connection_holders('c1000000-0000-4000-8000-000000000010');
select public.connection_agency_holds_area('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000010','google');
rollback;
