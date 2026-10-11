\set ON_ERROR_STOP on
begin;
create function pg_temp.vm_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Version management: %',label; end if; end $$;
create function pg_temp.vm_expect(q text,expected text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('bc600000-0000-4000-8000-000000000001','version-operator@example.test',now()),
 ('bc600000-0000-4000-8000-000000000002','version-owner@example.test',now()),
 ('bc600000-0000-4000-8000-000000000003','version-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc600000-0000-4000-8000-000000000010','agency','Version agency','bc600000-0000-4000-8000-000000000001'),
 ('bc600000-0000-4000-8000-000000000011','customer','Version client','bc600000-0000-4000-8000-000000000002'),
 ('bc600000-0000-4000-8000-000000000012','customer','Foreign client','bc600000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc600000-0000-4000-8000-000000000010','bc600000-0000-4000-8000-000000000001','owner','bc600000-0000-4000-8000-000000000001'),
 ('bc600000-0000-4000-8000-000000000011','bc600000-0000-4000-8000-000000000001','admin','bc600000-0000-4000-8000-000000000002'),
 ('bc600000-0000-4000-8000-000000000011','bc600000-0000-4000-8000-000000000002','owner','bc600000-0000-4000-8000-000000000002');
create temporary table vm_source(id uuid);
insert into vm_source select (public.create_system_version_source('bc600000-0000-4000-8000-000000000010','bc600000-0000-4000-8000-000000000001',
 'version-operator@example.test','{"name":"Source","kind":"internal_app"}','bc600000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('bc600000-0000-4000-8000-000000000001','version-operator@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','bc600000-0000-4000-8000-000000000010','systemId',(select id from vm_source),'revisionId','bc600000-0000-4000-8000-000000000021','number',1),
 'definition','{"title":"Source","added":"Current field"}'::jsonb,'summary','First','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','bc600000-0000-4000-8000-000000000001','publishedAt',now()));
create function pg_temp.vm_lineage() returns jsonb language sql as $$ select jsonb_build_object(
 'id',gen_random_uuid(),'version',jsonb_build_object('businessId','bc600000-0000-4000-8000-000000000011','systemId','bc600000-0000-4000-8000-000000000030'),
 'source',jsonb_build_object('businessId','bc600000-0000-4000-8000-000000000010','systemId',(select id from vm_source)),
 'context','{"kind":"agency_client","label":"Client"}'::jsonb,'baseline','{"revision":1,"definition":{"title":"Source","added":"Current field"}}'::jsonb,
 'overrides','[]'::jsonb,'bindings','[]'::jsonb,'localData','{}'::jsonb,'releases','[]'::jsonb,'currentRelease',null,
 'decisions','[]'::jsonb,'grants','[]'::jsonb,'rowRevision',1,'createdBy','bc600000-0000-4000-8000-000000000001','createdAt',now(),'updatedAt',now()) $$;
create temporary table vm_created(value jsonb);
insert into vm_created select public.create_version_system_command('bc600000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vm_lineage(),'Client intake','internal_app','bc600000-0000-4000-8000-000000000030');
select pg_temp.vm_assert(public.create_version_system_command('bc600000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vm_lineage(),'Client intake','internal_app','bc600000-0000-4000-8000-000000000030')->>'id'=(select value->>'id' from vm_created),'lost creation reply retries the same Version');
select pg_temp.vm_assert((select count(*) from public.systems where business_workspace_id='bc600000-0000-4000-8000-000000000011')=1,'retry creates no orphan or duplicate System');
select pg_temp.vm_expect($q$select public.create_version_system_command('bc600000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vm_lineage(),'Altered command','internal_app','bc600000-0000-4000-8000-000000000030')$q$,'system_command_conflict');
select pg_temp.vm_expect($q$select public.create_version_system_command('bc600000-0000-4000-8000-000000000003','version-stranger@example.test',pg_temp.vm_lineage(),'Client intake','internal_app',gen_random_uuid())$q$,'business_record_access_denied');
select pg_temp.vm_assert((select value->'bindings'='[]'::jsonb and value->'localData'='{}'::jsonb and value->'grants'='[]'::jsonb and value->'currentRelease'='null'::jsonb from vm_created),'accounts, data, grants and Live start empty');
select pg_temp.vm_assert(public.read_business_system('bc600000-0000-4000-8000-000000000010','bc600000-0000-4000-8000-000000000001','version-operator@example.test',(select id from vm_source))->'system'->>'id'=(select id::text from vm_source),'agency author can read its own packaged source through native System ports');
select pg_temp.vm_assert(not has_function_privilege('authenticated','public.create_version_system_command(uuid,text,jsonb,text,text,uuid)','EXECUTE'),'creation RPC remains service-role only');
do $$ declare saved jsonb; draft jsonb; begin
 draft:=jsonb_set((select value from vm_created),'{overrides}',jsonb_build_array(jsonb_build_object('path','*','value','{"title":"Earlier release"}'::jsonb,
   'setBy','bc600000-0000-4000-8000-000000000001','setAt',now())));
 saved:=public.save_system_version('bc600000-0000-4000-8000-000000000001','version-operator@example.test',(draft->>'id')::uuid,1,draft);
 perform pg_temp.vm_assert(saved->'overrides'->0->>'path'='*' and saved->'baseline'=draft->'baseline','whole-definition restoration persists without changing baseline');
 perform pg_temp.vm_assert(saved->'currentRelease'='null'::jsonb and saved->'releases'='[]'::jsonb,'saving a restoration draft does not release');
 perform pg_temp.vm_expect(format('select public.save_system_version(%L,%L,%L,1,%L)',
   'bc600000-0000-4000-8000-000000000001','version-operator@example.test',draft->>'id',draft),'system_version_stale');
end $$;
insert into public.workspace_calendar_connections(id,workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values
 ('bc600000-0000-4000-8000-000000000040','bc600000-0000-4000-8000-000000000011','google','fixture','Client calendar','America/New_York','connected','bc600000-0000-4000-8000-000000000002'),
 ('bc600000-0000-4000-8000-000000000041','bc600000-0000-4000-8000-000000000012','google','foreign','Private calendar','America/New_York','connected','bc600000-0000-4000-8000-000000000002');
select pg_temp.vm_assert(jsonb_array_length(public.read_version_binding_choices('bc600000-0000-4000-8000-000000000011','bc600000-0000-4000-8000-000000000001','version-operator@example.test'))=1,'only this business account is offered, never a sibling/agency/foreign credential');
rollback;
