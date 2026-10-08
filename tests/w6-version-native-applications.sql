\set ON_ERROR_STOP on
\if :{?native_keep_fixture}
\else
\set native_keep_fixture false
\endif
\if :{?native_authority_lock_fixture}
\else
\set native_authority_lock_fixture false
\endif
begin;
create function pg_temp.vn_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Version native runtime: %',label; end if; end $$;
create function pg_temp.vn_expect(q text,expected text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('bc630000-0000-4000-8000-000000000001','version-operator@example.test',now()),
 ('bc630000-0000-4000-8000-000000000002','version-owner@example.test',now()),
 ('bc630000-0000-4000-8000-000000000003','version-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc630000-0000-4000-8000-000000000010','agency','Version agency','bc630000-0000-4000-8000-000000000001'),
 ('bc630000-0000-4000-8000-000000000011','customer','Version client','bc630000-0000-4000-8000-000000000002'),
 ('bc630000-0000-4000-8000-000000000012','customer','Foreign client','bc630000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc630000-0000-4000-8000-000000000010','bc630000-0000-4000-8000-000000000001','owner','bc630000-0000-4000-8000-000000000001'),
 ('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000001','admin','bc630000-0000-4000-8000-000000000002'),
 ('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000002','owner','bc630000-0000-4000-8000-000000000002');
-- Ordinary staffed provider authority prepares the client draft. The platform
-- operator flag below is deliberately retained for the denied Live path.
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000010','owner','bc630000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('bc630000-0000-4000-8000-000000000010','bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000001','bc630000-0000-4000-8000-000000000001');
insert into public.super_admins(user_id,email) values ('bc630000-0000-4000-8000-000000000001','version-operator@example.test');
create temporary table vn_source(id uuid);
insert into vn_source select (public.create_system_version_source('bc630000-0000-4000-8000-000000000010','bc630000-0000-4000-8000-000000000001',
 'version-operator@example.test','{"name":"Source","kind":"internal_app"}','bc630000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('bc630000-0000-4000-8000-000000000001','version-operator@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','bc630000-0000-4000-8000-000000000010','systemId',(select id from vn_source),'revisionId','bc630000-0000-4000-8000-000000000021','number',1),
 'definition','{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}'::jsonb,'summary','First','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','bc630000-0000-4000-8000-000000000001','publishedAt',now()));
create function pg_temp.vn_lineage() returns jsonb language sql as $$ select jsonb_build_object(
 'id',gen_random_uuid(),'version',jsonb_build_object('businessId','bc630000-0000-4000-8000-000000000011','systemId','bc630000-0000-4000-8000-000000000030'),
 'source',jsonb_build_object('businessId','bc630000-0000-4000-8000-000000000010','systemId',(select id from vn_source)),
 'context','{"kind":"agency_client","label":"Client"}'::jsonb,'baseline','{"revision":1,"definition":{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}}'::jsonb,
 'overrides','[]'::jsonb,'bindings','[]'::jsonb,'localData','{}'::jsonb,'releases','[]'::jsonb,'currentRelease',null,
 'decisions','[]'::jsonb,'grants','[]'::jsonb,'rowRevision',1,'createdBy','bc630000-0000-4000-8000-000000000001','createdAt',now(),'updatedAt',now()) $$;

create function pg_temp.vn_payload() returns jsonb language sql as $$ select jsonb_build_object(
 'version',1,'revision',0,'title','Client intake','createdBy','bc630000-0000-4000-8000-000000000001','createdAt',now(),
 'history','[]'::jsonb,'spec',((pg_temp.vn_lineage()->'baseline'->'definition')-'kind')||jsonb_build_object('maintenanceOwner','bc630000-0000-4000-8000-000000000001'),
 'specVersion',1,'status','draft','versions',jsonb_build_array(jsonb_build_object('version',1,'spec',((pg_temp.vn_lineage()->'baseline'->'definition')-'kind')||jsonb_build_object('maintenanceOwner','bc630000-0000-4000-8000-000000000001'))),
 'rehearsal',null,'records','[]'::jsonb) $$;
create temporary table vn_created(value jsonb);
insert into vn_created select public.create_version_system_command('bc630000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vn_lineage(),'Client intake','internal_app','bc630000-0000-4000-8000-000000000030',pg_temp.vn_payload());
select pg_temp.vn_assert(public.create_version_system_command('bc630000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vn_lineage(),'Client intake','internal_app','bc630000-0000-4000-8000-000000000030',pg_temp.vn_payload())->>'id'=(select value->>'id' from vn_created),'uncertain reply reuses real artifact');
select pg_temp.vn_assert((select count(*) from public.saved_product_work where workspace_id='bc630000-0000-4000-8000-000000000011')=1,'retry creates exactly one native application');
select pg_temp.vn_assert((select value->'bindings'='[]'::jsonb and value->'localData'='{}'::jsonb and value->'grants'='[]'::jsonb from vn_created),'no source records, accounts or grants copied');
select pg_temp.vn_assert((select origin_kind='saved_work' and origin_ref=n.work_id::text from public.systems s join public.system_version_native_applications n on n.version_id=(select (value->>'id')::uuid from vn_created) where s.id=(select (value->'version'->>'systemId')::uuid from vn_created)),'canonical System opens executable saved application');
select pg_temp.vn_assert(not has_function_privilege('authenticated','public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)','EXECUTE') and not has_function_privilege('service_role','public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb)','EXECUTE') and not has_table_privilege('service_role','public.system_version_native_applications','INSERT'),'native mapping and private release core cannot bypass checked wrappers');
select pg_temp.vn_expect($q$select public.create_version_system_command('bc630000-0000-4000-8000-000000000003','version-stranger@example.test',pg_temp.vn_lineage(),'Client intake','internal_app',gen_random_uuid(),pg_temp.vn_payload())$q$,'business_record_access_denied');
select pg_temp.vn_expect($q$select public.create_version_system_command('bc630000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vn_lineage(),'Client intake','website',gen_random_uuid(),pg_temp.vn_payload())$q$,'system_version_input_invalid');
select pg_temp.vn_expect($q$select public.create_version_system_command('bc630000-0000-4000-8000-000000000001','version-operator@example.test',pg_temp.vn_lineage(),'Client intake','internal_app',gen_random_uuid(),jsonb_set(pg_temp.vn_payload(),'{records}','[{"private":"source record"}]'))$q$,'system_version_input_invalid');
create function pg_temp.vn_release(v jsonb,definition jsonb) returns jsonb language sql as $$ select jsonb_set(jsonb_set(v,'{releases}',(v->'releases')||jsonb_build_array(jsonb_build_object('number',jsonb_array_length(v->'releases')+1,'definition',definition,'baselineRevision',1,'overridePaths',case when definition=v->'baseline'->'definition' then '[]'::jsonb when definition->'fields' is distinct from v->'baseline'->'definition'->'fields' then '["fields"]'::jsonb else '["title"]'::jsonb end,'releasedBy','bc630000-0000-4000-8000-000000000002','releasedAt',now()))),'{currentRelease}',to_jsonb(jsonb_array_length(v->'releases')+1)) $$;
create function pg_temp.vn_approve(v jsonb) returns void language plpgsql as $$ declare decision jsonb; hash text; begin
 hash:=encode(sha256(convert_to('["version_release","'||(v->>'id')||'",'||(v->>'rowRevision')||']','UTF8')),'hex');
 decision:=public.open_owner_decision('bc630000-0000-4000-8000-000000000011',jsonb_build_object('kind','system.change_live','route','owner_decides','systemId',v->'version'->>'systemId','title','Put intake live','approveEffect','The runtime changes','notYetEffect','Nothing changes','sourceLifecycle','version_release','sourceId',v->>'id','revisionHash',hash,'adminMayDecide',false));
 perform public.record_version_preparation('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000001','version-operator@example.test',(v->>'id')::uuid,(v->>'rowRevision')::bigint,(decision->>'id')::uuid);
 perform public.claim_owner_decision('bc630000-0000-4000-8000-000000000011',(decision->>'id')::uuid,hash,'approve','session','bc630000-0000-4000-8000-000000000002','version-owner@example.test',null);
end $$;
\if :native_authority_lock_fixture
select pg_temp.vn_approve((select value from vn_created));
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000003','owner','bc630000-0000-4000-8000-000000000002');
commit;
\else
do $$ declare v jsonb; draft jsonb; native uuid; spec jsonb; snapshot jsonb; begin
 v:=(select value from vn_created);
 native:=(select work_id from public.system_version_native_applications where version_id=(v->>'id')::uuid);
 perform pg_temp.vn_expect(format('select public.application_runtime_snapshot(%L)',native),'application_release_unavailable');
 perform pg_temp.vn_assert(public.read_version_native_runtime('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000002','version-owner@example.test',(v->>'id')::uuid)->'releaseNumber'='null'::jsonb,'new Version starts draft');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000001','version-operator@example.test',v->>'id',pg_temp.vn_release(v,v->'baseline'->'definition')),'system_version_release_approval_required');
 if to_regclass('release_rollback_baseline.version_live_owner_authority') is not null then
   -- Preserve a fictional historical operator decision, and prove it cannot
   -- drive today's owner-only runtime. The subtransaction removes only this
   -- fixture; no real issued decision is modified by the migration.
   begin
     declare historical jsonb; hash text; begin
       hash:=encode(sha256(convert_to('["version_release","'||(v->>'id')||'",'||(v->>'rowRevision')||']','UTF8')),'hex');
       historical:=public.open_owner_decision('bc630000-0000-4000-8000-000000000011',jsonb_build_object('kind','system.change_live','route','strelva_reviews','systemId',v->'version'->>'systemId','title','Historical provider review','approveEffect','The runtime changes','notYetEffect','Nothing changes','sourceLifecycle','version_release','sourceId',v->>'id','revisionHash',hash,'adminMayDecide',false));
       perform public.record_version_preparation('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000001','version-operator@example.test',(v->>'id')::uuid,1,(historical->>'id')::uuid);
       update public.owner_decisions set state='approved',decided_by_kind='operator',decided_by='bc630000-0000-4000-8000-000000000001',decided_at=now() where id=(historical->>'id')::uuid;
       perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',pg_temp.vn_release(v,v->'baseline'->'definition')),'system_version_release_approval_required');
       raise exception 'vn_rollback_historical_fixture';
     end;
   exception when others then
     if sqlerrm<>'vn_rollback_historical_fixture' then raise; end if;
   end;
 end if;
 perform pg_temp.vn_approve(v);
 if to_regclass('release_rollback_baseline.version_live_owner_authority') is not null then
   perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000001','version-operator@example.test',v->>'id',pg_temp.vn_release(v,v->'baseline'->'definition')),'system_version_release_owner_required');
   update public.users set verified_at=null where id='bc630000-0000-4000-8000-000000000002';
   perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',pg_temp.vn_release(v,v->'baseline'->'definition')),'business_record_access_denied');
   update public.users set verified_at=now() where id='bc630000-0000-4000-8000-000000000002';
   insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
     ('bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000003','owner','bc630000-0000-4000-8000-000000000002');
   update public.workspace_memberships set role='admin' where workspace_id='bc630000-0000-4000-8000-000000000011' and user_id='bc630000-0000-4000-8000-000000000002';
   perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000003','version-stranger@example.test',v->>'id',pg_temp.vn_release(v,v->'baseline'->'definition')),'system_version_release_approval_required');
   update public.workspace_memberships set role='owner' where workspace_id='bc630000-0000-4000-8000-000000000011' and user_id='bc630000-0000-4000-8000-000000000002';
   delete from public.workspace_memberships where workspace_id='bc630000-0000-4000-8000-000000000011' and user_id='bc630000-0000-4000-8000-000000000003';
 end if;
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',jsonb_set(pg_temp.vn_release(v,v->'baseline'->'definition'),'{currentRelease}','null')),'system_version_input_invalid');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',pg_temp.vn_release(v,jsonb_set(v->'baseline'->'definition','{title}','"Forged candidate"'))),'system_version_stale');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',jsonb_set(pg_temp.vn_release(v,v->'baseline'->'definition'),'{overrides}','[{"path":"title","value":"Unapproved draft","setBy":"bc630000-0000-4000-8000-000000000002","setAt":"2026-10-07T12:00:00Z"}]')),'system_version_stale');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,1,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',pg_temp.vn_release(pg_temp.vn_release(v,v->'baseline'->'definition'),v->'baseline'->'definition')),'system_version_input_invalid');
 v:=public.save_system_version('bc630000-0000-4000-8000-000000000002','version-owner@example.test',(v->>'id')::uuid,1,pg_temp.vn_release(v,v->'baseline'->'definition'));
 snapshot:=public.application_runtime_snapshot(native);
 perform pg_temp.vn_assert(snapshot->>'release_version'='1' and snapshot->>'title'='Client intake' and snapshot->'records'='[]'::jsonb,'Version release publishes its own live runtime');
 perform pg_temp.vn_assert((select lifecycle='live' and current_revision_number=1 from public.systems where id=(v->'version'->>'systemId')::uuid),'approved native publication moves its canonical System to Live');
 perform public.submit_application_record(native,'bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000002','version-owner@example.test',1,0,'client-record','{"problem":"Destination record"}');
 draft:=jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','title','value','Adapted intake','setBy','bc630000-0000-4000-8000-000000000002','setAt',now())));
 v:=public.save_system_version('bc630000-0000-4000-8000-000000000002','version-owner@example.test',(v->>'id')::uuid,2,draft);
 perform pg_temp.vn_assert(public.application_runtime_snapshot(native)->>'title'='Client intake','saving adaptation leaves live runtime intact');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,3,%L)','bc630000-0000-4000-8000-000000000001','version-operator@example.test',v->>'id',pg_temp.vn_release(v,jsonb_set(v->'baseline'->'definition','{title}','"Adapted intake"'))),'system_version_release_approval_required');
 perform pg_temp.vn_approve(v);
 v:=public.save_system_version('bc630000-0000-4000-8000-000000000002','version-owner@example.test',(v->>'id')::uuid,3,pg_temp.vn_release(v,jsonb_set(v->'baseline'->'definition','{title}','"Adapted intake"')));
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,4,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',jsonb_set(v,'{currentRelease}','1')),'system_version_input_invalid');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,4,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',jsonb_set(v,'{currentRelease}','null')),'system_version_input_invalid');
 snapshot:=public.application_runtime_snapshot(native);
 perform pg_temp.vn_assert(snapshot->>'release_version'='2' and snapshot->>'title'='Adapted intake' and jsonb_array_length(snapshot->'records')=1,'release changes executable interface while preserving destination record');
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,3,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',v),'system_version_stale');
 spec:=jsonb_set(v->'baseline'->'definition','{fields}',(v->'baseline'->'definition'->'fields')||'[{"id":"priority","label":"Priority","type":"number","required":true}]'::jsonb);
 -- A valid candidate can still be incompatible with records already accepted.
 draft:=jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','*','value',spec,'setBy','bc630000-0000-4000-8000-000000000002','setAt',now())));
 v:=public.save_system_version('bc630000-0000-4000-8000-000000000002','version-owner@example.test',(v->>'id')::uuid,4,draft);
 perform pg_temp.vn_approve(v);
 perform pg_temp.vn_expect(format('select public.save_system_version(%L,%L,%L,5,%L)','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id',pg_temp.vn_release(v,spec)),'application_rehearsal_required');
 perform pg_temp.vn_assert((select row_revision=5 and current_release=2 from public.system_versions where id=(v->>'id')::uuid) and public.application_runtime_snapshot(native)->>'release_version'='2' and jsonb_array_length(public.application_runtime_snapshot(native)->'records')=1,'failed native publish rolls back Version release, pointer and record changes together');
 perform pg_temp.vn_assert((select count(*)=2 from public.system_version_releases where version_id=(v->>'id')::uuid),'failed publish leaves no false release history');
 spec:=(select candidate_spec from public.application_states where work_id=native);
 perform public.update_application_candidate(native,'bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000002','version-owner@example.test',1,jsonb_set(spec,'{title}','"Outside edit"'));
 perform pg_temp.vn_expect(format('select public.read_version_native_runtime(%L,%L,%L,%L)','bc630000-0000-4000-8000-000000000011','bc630000-0000-4000-8000-000000000002','version-owner@example.test',v->>'id'),'system_version_stale');
end $$;
\if :native_keep_fixture
commit;
\else
rollback;
\endif
\endif
