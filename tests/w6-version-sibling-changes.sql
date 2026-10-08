\set ON_ERROR_STOP on
begin;
create function pg_temp.vs_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Version sibling comparison: %',label; end if; end $$;
create function pg_temp.vs_expect(q text,expected text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test',now()),
 ('bc640000-0000-4000-8000-000000000002','sibling-owner@example.test',now()),
 ('bc640000-0000-4000-8000-000000000003','sibling-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc640000-0000-4000-8000-000000000010','agency','Version agency','bc640000-0000-4000-8000-000000000001'),
 ('bc640000-0000-4000-8000-000000000011','customer','Version client','bc640000-0000-4000-8000-000000000002'),
 ('bc640000-0000-4000-8000-000000000012','customer','Foreign client','bc640000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc640000-0000-4000-8000-000000000010','bc640000-0000-4000-8000-000000000001','owner','bc640000-0000-4000-8000-000000000001'),
 ('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000001','admin','bc640000-0000-4000-8000-000000000002'),
 ('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000002','owner','bc640000-0000-4000-8000-000000000002');
insert into public.super_admins(user_id,email) values ('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test');
create temporary table vs_source(id uuid);
insert into vs_source select (public.create_system_version_source('bc640000-0000-4000-8000-000000000010','bc640000-0000-4000-8000-000000000001',
 'sibling-operator@example.test','{"name":"Source","kind":"internal_app"}','bc640000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','bc640000-0000-4000-8000-000000000010','systemId',(select id from vs_source),'revisionId','bc640000-0000-4000-8000-000000000021','number',1),
 'definition','{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}'::jsonb,'summary','First','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','bc640000-0000-4000-8000-000000000001','publishedAt',now()));
create function pg_temp.vs_lineage() returns jsonb language sql as $$ select jsonb_build_object(
 'id',gen_random_uuid(),'version',jsonb_build_object('businessId','bc640000-0000-4000-8000-000000000011','systemId','bc640000-0000-4000-8000-000000000030'),
 'source',jsonb_build_object('businessId','bc640000-0000-4000-8000-000000000010','systemId',(select id from vs_source)),
 'context','{"kind":"agency_client","label":"Client"}'::jsonb,'baseline','{"revision":1,"definition":{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}}'::jsonb,
 'overrides','[]'::jsonb,'bindings','[]'::jsonb,'localData','{}'::jsonb,'releases','[]'::jsonb,'currentRelease',null,
 'decisions','[]'::jsonb,'grants','[]'::jsonb,'rowRevision',1,'createdBy','bc640000-0000-4000-8000-000000000001','createdAt',now(),'updatedAt',now()) $$;


insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('bc640000-0000-4000-8000-000000000012','bc640000-0000-4000-8000-000000000001','admin','bc640000-0000-4000-8000-000000000002');
create temporary table vs_created(name text,value jsonb);
insert into vs_created values ('first',public.create_version_system_command('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test',pg_temp.vs_lineage(),'Client first','internal_app','bc640000-0000-4000-8000-000000000030')),
 ('sibling',public.create_version_system_command('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test',pg_temp.vs_lineage(),'Client sibling','internal_app','bc640000-0000-4000-8000-000000000031')),
 ('foreign',public.create_version_system_command('bc640000-0000-4000-8000-000000000001','sibling-operator@example.test',jsonb_set(pg_temp.vs_lineage(),'{version,businessId}','"bc640000-0000-4000-8000-000000000012"'),'Foreign sibling','internal_app','bc640000-0000-4000-8000-000000000032'));
select pg_temp.vs_assert(not has_function_privilege('service_role','public.system_version_sibling_changes(public.system_versions)','EXECUTE') and not has_function_privilege('service_role','public.read_business_versions_sibling_core(uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.read_business_versions(uuid,uuid,text)','EXECUTE'),'only checked scope wrapper is public to service role');
do $$ declare v jsonb; result jsonb; siblings jsonb; comp jsonb; begin
 v:=(select value from vs_created where name='sibling');
 v:=public.save_system_version('bc640000-0000-4000-8000-000000000002','sibling-owner@example.test',(v->>'id')::uuid,1,jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','title','value','Location-specific intake','setBy','bc640000-0000-4000-8000-000000000002','setAt',now()))));
 result:=public.read_business_versions('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000002','sibling-owner@example.test');
 siblings:=(select item->'siblings' from jsonb_array_elements(result->'versions') item where item->>'id'=(select value->>'id' from vs_created where name='first'));
 perform pg_temp.vs_assert(jsonb_array_length(siblings)=1 and siblings->0->>'id'=v->>'id','same source siblings stay within the permitted business');
 comp:=siblings->0->'comparison';
 perform pg_temp.vs_assert(comp->>'state'='ready' and comp->'changes'='[{"path":"title","beforePresent":true,"afterPresent":true,"before":"Client intake","after":"Location-specific intake"}]'::jsonb,'sibling shows actual baseline and local values');
 perform pg_temp.vs_assert(not result::text like '%Foreign sibling%','foreign business sibling remains hidden');
 -- Wildcard restoration and removal compare the actual complete definition.
 v:=public.save_system_version('bc640000-0000-4000-8000-000000000002','sibling-owner@example.test',(v->>'id')::uuid,2,jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','*','value',(v->'baseline'->'definition')-'components','setBy','bc640000-0000-4000-8000-000000000002','setAt',now()))));
 result:=public.read_business_versions('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000002','sibling-owner@example.test');
 comp:=(select item->'siblings'->0->'comparison' from jsonb_array_elements(result->'versions') item where item->>'id'=(select value->>'id' from vs_created where name='first'));
 perform pg_temp.vs_assert(comp->'changes'->0->>'path'='components' and comp->'changes'->0->'afterPresent'='false'::jsonb,'whole definition restoration describes removed paths');
 -- Direct trusted-store polluted data must fail closed in this public read.
 v:=public.save_system_version('bc640000-0000-4000-8000-000000000002','sibling-owner@example.test',(v->>'id')::uuid,3,jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','secret','value','fixture-sensitive-value','setBy','bc640000-0000-4000-8000-000000000002','setAt',now()))));
 result:=public.read_business_versions('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000002','sibling-owner@example.test');
 comp:=(select item->'siblings'->0->'comparison' from jsonb_array_elements(result->'versions') item where item->>'id'=(select value->>'id' from vs_created where name='first'));
 perform pg_temp.vs_assert(comp='{"state":"unavailable","changes":[]}'::jsonb and not result::text like '%fixture-sensitive-value%','polluted sibling definition exposes no sensitive value');
end $$;
select pg_temp.vs_expect($q$select public.read_business_versions('bc640000-0000-4000-8000-000000000011','bc640000-0000-4000-8000-000000000003','sibling-stranger@example.test')$q$,'business_record_access_denied');
rollback;
