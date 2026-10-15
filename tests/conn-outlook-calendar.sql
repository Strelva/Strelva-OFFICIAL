\set ON_ERROR_STOP on
begin;
create function pg_temp.conn_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'conn_outlook_assert: %',label; end if; end $$;
create function pg_temp.conn_refuses(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
 if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end;
 raise exception 'expected refusal %',expected;
end $$;
insert into public.users(id,email,verified_at) values
 ('c3000000-0000-4000-8000-000000000001','outlook-owner@example.test',now()),
 ('c3000000-0000-4000-8000-000000000002','outlook-agency@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('c3000000-0000-4000-8000-000000000010','customer','Harbor Dental','c3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-000000000011','agency','North Studio','c3000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('c3000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000001','owner','c3000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-000000000011','c3000000-0000-4000-8000-000000000002','owner','c3000000-0000-4000-8000-000000000002');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('c3000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000011','owner','c3000000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('c3000000-0000-4000-8000-000000000011','c3000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002');
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at) values
 ('c3000000-0000-4000-8000-000000000010','c3000000-0000-4000-8000-000000000011','bookings','prepare','active','Fictional bookings permission','c3000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000002',now());
insert into public.workspace_calendar_connections(id,workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values
 ('c3000000-0000-4000-8000-000000000042','c3000000-0000-4000-8000-000000000010','outlook','harbor','Harbor','America/New_York','connected','c3000000-0000-4000-8000-000000000001');

do $$ declare
 business uuid:='c3000000-0000-4000-8000-000000000010'; agency uuid:='c3000000-0000-4000-8000-000000000011';
 owner uuid:='c3000000-0000-4000-8000-000000000001'; staff uuid:='c3000000-0000-4000-8000-000000000002';
 ref text:='outlook_calendar:c3000000-0000-4000-8000-000000000042'; definition jsonb; declaration jsonb;
begin
 perform pg_temp.conn_assert(public.connection_provider_area('outlook_calendar')='bookings','outlook area is bookings');
 perform pg_temp.conn_assert(public.connection_provider_area('google_calendar')='bookings','google calendar area unchanged');
 perform pg_temp.conn_assert(public.connection_source_workspace('outlook_calendar',ref,true)=business,'outlook source resolves to its business');
 perform pg_temp.conn_assert(public.connection_source_workspace('google_calendar',ref,true) is null,'outlook ref is not a google_calendar ref');
 perform public.record_connection_holder(business,owner,'outlook-owner@example.test',ref,'outlook_calendar',jsonb_build_object('kind','business','workspaceId',business),'{"kind":"platform"}',gen_random_uuid(),repeat('1',64));
 perform pg_temp.conn_assert((select count(*) from public.connection_holders where provider='outlook_calendar')=1,'outlook holder recorded');
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'outlook-owner@example.test',ref)=business,'outlook calendar bindable by its business');
 -- Agency access is not a path for a business's calendar.
 perform pg_temp.conn_refuses(format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,staff,'outlook-agency@example.test',ref,'outlook_calendar',
  jsonb_build_object('kind','business','workspaceId',business),jsonb_build_object('kind','agency','workspaceId',agency),gen_random_uuid(),repeat('2',64)),'connection_access_denied');
 perform pg_temp.conn_refuses(format('select public.record_connection_holder(%L,%L,%L,%L,%L,%L,%L,%L,%L)',business,staff,'outlook-agency@example.test',ref,'outlook_calendar',
  jsonb_build_object('kind','agency','workspaceId',agency),'{"kind":"platform"}',gen_random_uuid(),repeat('3',64)),'connection_access_denied');
 update public.workspace_calendar_connections set status='revoked' where id='c3000000-0000-4000-8000-000000000042';
 perform pg_temp.conn_assert(public.read_system_version_connection_owner(owner,'outlook-owner@example.test',ref) is null,'revoked outlook source refused');
 -- The Google calendar branch still resolves only google rows.
 update public.workspace_calendar_connections set status='connected' where id='c3000000-0000-4000-8000-000000000042';
 perform pg_temp.conn_assert(public.connection_source_workspace('google_calendar','google_calendar:c3000000-0000-4000-8000-000000000042',true) is null,'google_calendar does not resolve an outlook row');
 -- Apps may name it: a valid but unused claim is "exceeded", an unknown provider is "invalid".
 definition:='{"kind":"website_section","title":"FAQ","items":[{"question":"When?","answer":"Ask our team."}]}'::jsonb;
 declaration:=public.system_package_behavior(definition,'{}');
 perform public.system_package_assert_declaration(definition,declaration,'{}');
 perform pg_temp.conn_refuses(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections}','[{"provider":"outlook_calendar","access":"read","optional":true,"purpose":"Unused claim"}]')),'system_package_declaration_exceeded');
 perform pg_temp.conn_refuses(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections}','[{"provider":"imaginary","access":"read","optional":true,"purpose":"Unsafe claim"}]')),'system_package_declaration_invalid');
end $$;
select pg_temp.conn_assert(not has_function_privilege('anon','public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb)','execute')
 and not has_function_privilege('service_role','public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb)','execute'),'helpers stay private');
select pg_temp.conn_assert(not has_function_privilege('service_role','public.system_package_assert_declaration(jsonb,jsonb,text[])','execute'),'declaration validator stays private');
select pg_temp.conn_assert(has_function_privilege('service_role','public.record_connection_holder(uuid,uuid,text,text,text,jsonb,jsonb,uuid,text)','execute'),'service RPC still allowed');
rollback;
