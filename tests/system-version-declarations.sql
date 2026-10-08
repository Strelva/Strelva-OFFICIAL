\set ON_ERROR_STOP on
\if :{?declaration_keep_fixture}
\else
\set declaration_keep_fixture false
\endif
-- #326: fictional local rows only; all writes roll back.
begin;
create function pg_temp.pd_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Package declarations: %',label; end if; end $$;
create function pg_temp.pd_expect(q text,expected text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',now()),
 ('bc326000-0000-4000-8000-000000000002','declaration-owner@example.test',now()),
 ('bc326000-0000-4000-8000-000000000003','declaration-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc326000-0000-4000-8000-000000000010','agency','Version agency','bc326000-0000-4000-8000-000000000001'),
 ('bc326000-0000-4000-8000-000000000011','customer','Version client','bc326000-0000-4000-8000-000000000002'),
 ('bc326000-0000-4000-8000-000000000012','customer','Foreign client','bc326000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc326000-0000-4000-8000-000000000010','bc326000-0000-4000-8000-000000000001','owner','bc326000-0000-4000-8000-000000000001'),
 ('bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000001','admin','bc326000-0000-4000-8000-000000000002'),
 ('bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000002','owner','bc326000-0000-4000-8000-000000000002');
insert into public.super_admins(user_id,email) values ('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test');
-- Final provider authority requires an accepted agency delegation; a platform
-- operator flag plus client membership is deliberately insufficient.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('bc326000-0000-4000-8000-000000000090','bc326000-0000-4000-8000-000000000011','scheduling','schedule','Delegated creation','{"reservations":[]}',
  'bc326000-0000-4000-8000-000000000002');
insert into public.workspace_delegations(id,customer_workspace_id,customer_work_id,agency_workspace_id,granted_by,accepted_by) values
 ('bc326000-0000-4000-8000-000000000091','bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000090',
  'bc326000-0000-4000-8000-000000000010','bc326000-0000-4000-8000-000000000002','bc326000-0000-4000-8000-000000000001');
create temporary table pd_source(id uuid);
insert into pd_source select (public.create_system_version_source('bc326000-0000-4000-8000-000000000010','bc326000-0000-4000-8000-000000000001',
 'declaration-operator@example.test','{"name":"Source","kind":"internal_app"}','bc326000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','bc326000-0000-4000-8000-000000000010','systemId',(select id from pd_source),'revisionId','bc326000-0000-4000-8000-000000000021','number',1),
 'definition','{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true},{"id":"priority","label":"Priority","type":"number","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}],"declaration":{"schemaVersion":1,"recordsRead":["application_records","business_owner"],"recordsWritten":["application_records"],"businessFields":{"read":["application_records.id","application_records.values.priority","application_records.values.problem","business_owner.email","business_owner.name"],"written":["application_records.id","application_records.values.priority","application_records.values.problem"]},"outsideEffects":["email"],"bindingKinds":[],"dataEgress":[{"destination":"business_owner_email","fields":["application.title","application.work_id","application_records.id","application_records.values.problem","business.workspace_id","business_owner.email"]},{"destination":"email_provider","fields":["application.title","application.work_id","application_records.id","application_records.values.problem","business.workspace_id","business_owner.email"]},{"destination":"shared_application_view","fields":["application.labels.problem","application.release_version","application.title","application.work_id","application_records.id","application_records.revision","application_records.values.problem","business.workspace_id"]}]}}'::jsonb,'summary','First','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','bc326000-0000-4000-8000-000000000001','publishedAt',now()));
create function pg_temp.pd_lineage() returns jsonb language sql as $$ select jsonb_build_object(
 'id',gen_random_uuid(),'version',jsonb_build_object('businessId','bc326000-0000-4000-8000-000000000011','systemId','bc326000-0000-4000-8000-000000000030'),
 'source',jsonb_build_object('businessId','bc326000-0000-4000-8000-000000000010','systemId',(select id from pd_source)),
 'context','{"kind":"agency_client","label":"Client"}'::jsonb,'baseline','{"revision":1,"definition":{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true},{"id":"priority","label":"Priority","type":"number","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}],"declaration":{"schemaVersion":1,"recordsRead":["application_records","business_owner"],"recordsWritten":["application_records"],"businessFields":{"read":["application_records.id","application_records.values.priority","application_records.values.problem","business_owner.email","business_owner.name"],"written":["application_records.id","application_records.values.priority","application_records.values.problem"]},"outsideEffects":["email"],"bindingKinds":[],"dataEgress":[{"destination":"business_owner_email","fields":["application.title","application.work_id","application_records.id","application_records.values.problem","business.workspace_id","business_owner.email"]},{"destination":"email_provider","fields":["application.title","application.work_id","application_records.id","application_records.values.problem","business.workspace_id","business_owner.email"]},{"destination":"shared_application_view","fields":["application.labels.problem","application.release_version","application.title","application.work_id","application_records.id","application_records.revision","application_records.values.problem","business.workspace_id"]}]}}}'::jsonb,
 'overrides','[]'::jsonb,'bindings','[]'::jsonb,'localData','{}'::jsonb,'releases','[]'::jsonb,'currentRelease',null,
 'decisions','[]'::jsonb,'grants','[]'::jsonb,'rowRevision',1,'createdBy','bc326000-0000-4000-8000-000000000001','createdAt',now(),'updatedAt',now()) $$;

create function pg_temp.pd_payload() returns jsonb language sql as $$ select jsonb_build_object(
 'version',1,'revision',0,'title','Client intake','createdBy','bc326000-0000-4000-8000-000000000001','createdAt',now(),
 'history','[]'::jsonb,'spec',((pg_temp.pd_lineage()->'baseline'->'definition')-array['kind','declaration'])||jsonb_build_object('maintenanceOwner','bc326000-0000-4000-8000-000000000001'),
 'specVersion',1,'status','draft','versions',jsonb_build_array(jsonb_build_object('version',1,'spec',((pg_temp.pd_lineage()->'baseline'->'definition')-array['kind','declaration'])||jsonb_build_object('maintenanceOwner','bc326000-0000-4000-8000-000000000001'))),
 'rehearsal',null,'records','[]'::jsonb) $$;
create temporary table pd_created(value jsonb);
insert into pd_created select public.create_version_system_command('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_lineage(),'Client intake','internal_app','bc326000-0000-4000-8000-000000000030',pg_temp.pd_payload());
select pg_temp.pd_assert(public.create_version_system_command('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_lineage(),'Client intake','internal_app','bc326000-0000-4000-8000-000000000030',pg_temp.pd_payload())->>'id'=(select value->>'id' from pd_created),'uncertain reply reuses real artifact');
select pg_temp.pd_assert((select count(*) from public.saved_product_work where workspace_id='bc326000-0000-4000-8000-000000000011' and product_id='applications')=1,'retry creates exactly one native application');
select pg_temp.pd_assert((select value->'bindings'='[]'::jsonb and value->'localData'='{}'::jsonb and value->'grants'='[]'::jsonb from pd_created),'no source records, accounts or grants copied');
select pg_temp.pd_assert((select origin_kind='saved_work' and origin_ref=n.work_id::text from public.systems s join public.system_version_native_applications n on n.version_id=(select (value->>'id')::uuid from pd_created) where s.id=(select (value->'version'->>'systemId')::uuid from pd_created)),'canonical System opens executable saved application');
select pg_temp.pd_assert(not has_function_privilege('authenticated','public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)','EXECUTE') and not has_function_privilege('service_role','public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb)','EXECUTE') and not has_table_privilege('service_role','public.system_version_native_applications','INSERT'),'native mapping and private release core cannot bypass checked wrappers');
select pg_temp.pd_expect($q$select public.create_version_system_command('bc326000-0000-4000-8000-000000000003','declaration-stranger@example.test',pg_temp.pd_lineage(),'Client intake','internal_app',gen_random_uuid(),pg_temp.pd_payload())$q$,'business_record_access_denied');
select pg_temp.pd_expect($q$select public.create_version_system_command('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_lineage(),'Client intake','website',gen_random_uuid(),pg_temp.pd_payload())$q$,'system_version_input_invalid');
select pg_temp.pd_expect($q$select public.create_version_system_command('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_lineage(),'Client intake','internal_app',gen_random_uuid(),jsonb_set(pg_temp.pd_payload(),'{records}','[{"private":"source record"}]'))$q$,'system_version_input_invalid');
create function pg_temp.pd_release(v jsonb,definition jsonb) returns jsonb language sql as $$
  with recursive changes(path,before,after) as (
    select ''::text,v->'baseline'->'definition',definition
    union all
    select case when c.path='' then k.key else c.path||'.'||k.key end,c.before->k.key,c.after->k.key
      from changes c cross join lateral (
        select jsonb_object_keys(case when jsonb_typeof(c.before)='object' and jsonb_typeof(c.after)='object' then c.before||c.after else '{}'::jsonb end) key
      ) k where c.before is distinct from c.after
  ), paths as (select coalesce(jsonb_agg(path order by path),'[]'::jsonb) value from changes
    where path<>'' and before is distinct from after and not (coalesce(jsonb_typeof(before),'')='object' and coalesce(jsonb_typeof(after),'')='object'))
  select jsonb_set(jsonb_set(v,'{releases}',(v->'releases')||jsonb_build_array(jsonb_build_object(
    'number',jsonb_array_length(v->'releases')+1,'definition',definition,'baselineRevision',v->'baseline'->'revision',
    'overridePaths',paths.value,'releasedBy','bc326000-0000-4000-8000-000000000002','releasedAt',now()))),
    '{currentRelease}',to_jsonb(jsonb_array_length(v->'releases')+1)) from paths
$$;
create function pg_temp.pd_approve(v jsonb) returns void language plpgsql as $$ declare decision jsonb; hash text; begin
 hash:=encode(sha256(convert_to('["version_release","'||(v->>'id')||'",'||(v->>'rowRevision')||']','UTF8')),'hex');
 decision:=public.open_owner_decision('bc326000-0000-4000-8000-000000000011',jsonb_build_object('kind','system.change_live','route','owner_decides','systemId',v->'version'->>'systemId','title','Put intake live','approveEffect','The runtime changes','notYetEffect','Nothing changes','sourceLifecycle','version_release','sourceId',v->>'id','revisionHash',hash,'adminMayDecide',false));
 perform public.record_version_preparation('bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',(v->>'id')::uuid,(v->>'rowRevision')::bigint,(decision->>'id')::uuid);
 perform public.claim_owner_decision('bc326000-0000-4000-8000-000000000011',(decision->>'id')::uuid,hash,'approve','session','bc326000-0000-4000-8000-000000000002','declaration-owner@example.test',null);
end $$;

create function pg_temp.pd_revision(definition jsonb,n integer default 2) returns jsonb language sql as $$ select jsonb_build_object(
 'source',jsonb_build_object('businessId','bc326000-0000-4000-8000-000000000010','systemId',(select id from pd_source),'revisionId',gen_random_uuid(),'number',n),
 'definition',definition,'summary','Declaration fixture','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','bc326000-0000-4000-8000-000000000001','publishedAt',now(),'packageFingerprint','declaration:fixture') $$;
create function pg_temp.pd_save(v jsonb, candidate jsonb) returns jsonb language sql as $$
 select public.save_system_version('bc326000-0000-4000-8000-000000000002','declaration-owner@example.test',(v->>'id')::uuid,(v->>'rowRevision')::bigint,candidate)
$$;
create function pg_temp.pd_override(v jsonb, definition jsonb) returns jsonb language sql as $$
 select jsonb_set(v,'{overrides}',jsonb_build_array(jsonb_build_object('path','*','value',definition,
 'setBy','bc326000-0000-4000-8000-000000000002','setAt',now())))
$$;
create function pg_temp.pd_snapshot(version_id uuid) returns jsonb language sql as $$
 select jsonb_build_object('version',to_jsonb(v),'releases',(select coalesce(jsonb_agg(to_jsonb(r) order by number),'[]') from public.system_version_releases r where r.version_id=v.id),
 'runtime',to_jsonb(s),'system',to_jsonb(sys),'native',to_jsonb(n),
 'nativeReleases',(select coalesce(jsonb_agg(to_jsonb(r) order by version),'[]') from public.application_releases r where r.work_id=n.work_id))
 from public.system_versions v join public.system_version_native_applications n on n.version_id=v.id
 join public.application_states s on s.work_id=n.work_id join public.systems sys on sys.id=v.version_system_id where v.id=version_id
$$;

-- Explicit golden declaration prevents the SQL inference helper from proving itself.
select pg_temp.pd_assert(public.system_version_native_behavior(pg_temp.pd_lineage()->'baseline'->'definition')=
 pg_temp.pd_lineage()->'baseline'->'definition'->'declaration','native inference matches the fixed golden declaration');
select pg_temp.pd_assert((select not (candidate_spec ? 'declaration') from public.application_states s
 join public.system_version_native_applications n on n.work_id=s.work_id where n.version_id=(select (value->>'id')::uuid from pd_created)),
 'native executable spec strips declaration metadata');
select pg_temp.pd_assert(not has_function_privilege('service_role','public.system_version_assert_native_declaration(jsonb,jsonb,text[])','EXECUTE')
 and not has_function_privilege('authenticated','public.save_system_version(uuid,text,uuid,bigint,jsonb)','EXECUTE')
 and not has_table_privilege('service_role','public.system_version_source_revisions','INSERT')
 and not has_table_privilege('service_role','public.system_version_releases','INSERT'), 'no public helper or table bypass');

-- Inspect every new private helper/trigger and affected callable boundary.
do $$ declare signature text; role_name text; begin
 foreach signature in array array[
  'public.system_version_declaration_strings(jsonb,text[])',
  'public.system_version_assert_declaration(jsonb,text[])',
  'public.system_version_declaration_list(text[])',
  'public.system_version_native_behavior(jsonb)',
  'public.system_version_assert_native_declaration(jsonb,jsonb,text[])',
  'public.system_version_source_declaration_guard()',
  'public.system_version_native_release_declaration_guard()',
  'public.system_version_native_pointer_declaration_guard()',
  'public.agency_package_assert_shareable(jsonb)',
  'public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb)'
 ] loop
  foreach role_name in array array['anon','authenticated','service_role'] loop
   perform pg_temp.pd_assert(not has_function_privilege(role_name,signature,'EXECUTE'),'private helper closed: '||role_name||' '||signature);
  end loop;
 end loop;
 foreach signature in array array[
  'public.publish_system_version_source_revision(uuid,text,jsonb)',
  'public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb)',
  'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
  'public.save_system_version(uuid,text,uuid,bigint,jsonb)',
  'public.read_system_version_pinned_revision(uuid,text,uuid)'
 ] loop
  perform pg_temp.pd_assert(has_function_privilege('service_role',signature,'EXECUTE')
   and not has_function_privilege('anon',signature,'EXECUTE') and not has_function_privilege('authenticated',signature,'EXECUTE'),
   'checked service-only wrapper: '||signature);
 end loop;
 perform pg_temp.pd_assert((select count(*)=3 from pg_trigger where not tgisinternal and tgenabled='O'
   and tgname in ('system_version_source_declaration_guard','system_version_native_release_declaration_guard','system_version_native_pointer_declaration_guard')),
  'all declaration enforcement triggers enabled');
end $$;

-- Every public publication path rejects underdeclaration atomically.
do $$ declare definition jsonb:=pg_temp.pd_lineage()->'baseline'->'definition'; bad jsonb; revision jsonb; begin
 for bad in select x from jsonb_array_elements(jsonb_build_array(
  definition-'declaration',jsonb_set(definition,'{declaration}','{}'),
  jsonb_set(definition,'{declaration,recordsRead}','[]'),jsonb_set(definition,'{declaration,recordsWritten}','[]'),
  jsonb_set(definition,'{declaration,businessFields,read}','[]'),jsonb_set(definition,'{declaration,businessFields,written}','[]'),
  jsonb_set(definition,'{declaration,outsideEffects}','[]'),jsonb_set(definition,'{declaration,dataEgress}','[]'),
  jsonb_set(definition,'{declaration,dataEgress,0,fields}','[]'),
  jsonb_set(definition,'{declaration,bindingKinds}','["booking_calendar"]'),
  jsonb_set(definition,'{declaration,recordsRead}','["application_records","application_records"]'),
  jsonb_set(definition,'{declaration,businessFields,read}','["*"]'),
  jsonb_set(definition,'{declaration,unexpected}','true'),
  definition||'{"script":"sendEmail()"}'::jsonb,
  jsonb_set(definition,'{kind}','"website"'), definition-'kind',
  jsonb_set(definition,'{fields,0,type}','null'),jsonb_set(definition,'{components,0,kind}','null')
 )) x loop
  revision:=pg_temp.pd_revision(bad);
  perform pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
    'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',revision),'system_version_declaration_invalid');
  perform pg_temp.pd_expect(format('select public.publish_agency_package(%L,%L,%L,%L,1,%L)',
    'bc326000-0000-4000-8000-000000000010','bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',gen_random_uuid(),revision),'system_version_declaration_invalid');
 end loop;
 perform pg_temp.pd_assert((select count(*)=1 from public.system_version_source_revisions where source_system_id=(select id from pd_source))
  and not exists(select 1 from public.agency_package_commands where source_system_id=(select id from pd_source)),'invalid publication writes neither revision nor durable receipt');
end $$;

-- Contact, assigned-person, and type-to-email behavior is inferred independently.
do $$ declare definition jsonb:=pg_temp.pd_lineage()->'baseline'->'definition'; changed jsonb; actual jsonb; begin
 changed:=jsonb_set(definition,'{fields,1,type}','"contact"'); actual:=public.system_version_native_behavior(changed);
 perform pg_temp.pd_assert(actual->'recordsWritten' ? 'business_contacts' and actual->'businessFields'->'read' ? 'business_contacts.phone_key', 'contact capabilities inferred');
 perform pg_temp.pd_expect(format('select public.system_version_assert_native_declaration(%L,%L,%L)',changed,definition->'declaration','{}'),'system_version_declaration_invalid');
 changed:=jsonb_set(definition,'{fields,1,type}','"assigned_person"'); actual:=public.system_version_native_behavior(changed);
 perform pg_temp.pd_assert(actual->'recordsRead' ? 'business_people' and exists(select 1 from jsonb_array_elements(actual->'dataEgress') x where x->>'destination'='assigned_person_email'), 'assigned person implies read and email egress');
 changed:=jsonb_set(definition,'{fields,1,type}','"text"');
 perform pg_temp.pd_expect(format('select public.system_version_assert_native_declaration(%L,%L,%L)',changed,definition->'declaration','{}'),'system_version_declaration_invalid');
end $$;

-- Shared snapshots expose schema labels/options as well as values. Their
-- release/record revision metadata is shared-only, without granting access.
do $$ declare definition jsonb:=pg_temp.pd_lineage()->'baseline'->'definition';
  visible_number jsonb; visible_select jsonb; hidden_select jsonb; actual jsonb; hidden_actual jsonb;
  shared jsonb; narrowed jsonb; allowance text;
begin
 visible_number:=jsonb_set(definition,'{components,0,fields}','["problem","priority"]');
 visible_number:=jsonb_set(visible_number,'{declaration}',public.system_version_native_behavior(visible_number));
 visible_select:=jsonb_set(visible_number,'{fields,1}',(visible_number->'fields'->1)||'{"type":"select","options":["normal","urgent"]}'::jsonb);
 actual:=public.system_version_native_behavior(visible_select);
 select flow->'fields' into shared from jsonb_array_elements(actual->'dataEgress') flow where flow->>'destination'='shared_application_view';
 perform pg_temp.pd_assert(shared ?& array['application.labels.problem','application.labels.priority','application.options.priority',
   'application.release_version','application_records.revision'],'shared labels, select options and revision metadata are declared');
 perform pg_temp.pd_assert(not exists(select 1 from jsonb_array_elements(actual->'dataEgress') flow
   where flow->>'destination'<>'shared_application_view' and (flow->'fields') ?| array['application.release_version','application_records.revision']),
   'revision metadata is not spuriously declared as email payload');
 -- Same field id, existing value and label allowance, but new option text.
 perform pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
   'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(visible_select)),
   'system_version_declaration_invalid');
 foreach allowance in array array['application.labels.problem','application.labels.priority','application.options.priority',
   'application.release_version','application_records.revision'] loop
   narrowed:=jsonb_set(visible_select,'{declaration}',actual);
   narrowed:=jsonb_set(narrowed,'{declaration,dataEgress,2,fields}',shared-allowance);
   perform pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
     'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(narrowed)),
     'system_version_declaration_invalid');
 end loop;
 hidden_select:=jsonb_set(definition,'{fields,1}',(definition->'fields'->1)||'{"type":"select","options":["normal","urgent"]}'::jsonb);
 hidden_actual:=public.system_version_native_behavior(hidden_select);
 select flow->'fields' into shared from jsonb_array_elements(hidden_actual->'dataEgress') flow where flow->>'destination'='shared_application_view';
 perform pg_temp.pd_assert(not (shared ?| array['application.labels.priority','application.options.priority','application_records.values.priority']),
   'unreferenced fields do not add shared labels, options or values');
 hidden_select:=jsonb_set(hidden_select,'{declaration}',hidden_actual);
 hidden_select:=jsonb_set(hidden_select,'{components,1,fields}','["problem","priority"]');
 perform pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
   'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(hidden_select)),
   'system_version_declaration_invalid');
 perform pg_temp.pd_assert((select count(*)=1 from public.system_version_source_revisions where source_system_id=(select id from pd_source)),
   'shared-egress underclaims never append a source revision');
end $$;

-- Accepted native releases preserve owner approval and all-or-nothing writes.
do $$ declare v jsonb; definition jsonb; changed jsonb; narrow jsonb; snapshot jsonb; native uuid; state public.application_states;
  row_revision bigint; baseline_count integer;
begin
 v:=(select value from pd_created); definition:=v->'baseline'->'definition';
 native:=(select work_id from public.system_version_native_applications where version_id=(v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,definition)),'system_version_release_approval_required');
 perform public.rehearse_application_candidate(native,'bc326000-0000-4000-8000-000000000011',
   'bc326000-0000-4000-8000-000000000002','declaration-owner@example.test',0);
 snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select public.publish_application_candidate(%L,%L,%L,%L,0,0)',native,
   'bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000002','declaration-owner@example.test'),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'direct native publication cannot bypass Version approval/history');
 perform pg_temp.pd_approve(v);
 v:=pg_temp.pd_save(v,pg_temp.pd_release(v,definition));
 perform pg_temp.pd_assert(public.application_runtime_snapshot(native)->>'release_version'='1','declared package releases an executable native runtime');

 -- Stop sharing after adoption. Destination owner still gets this exact pin,
 -- while a stranger learns nothing and general source access stays unchanged.
 perform public.put_system_version_source('bc326000-0000-4000-8000-000000000010','bc326000-0000-4000-8000-000000000001',
   'declaration-operator@example.test',(select id from pd_source),'{}');
 perform pg_temp.pd_assert(public.read_system_version_pinned_revision('bc326000-0000-4000-8000-000000000002',
   'declaration-owner@example.test',(v->>'id')::uuid)->'definition'=definition,'unsharing does not erase the adopted declaration');
 perform pg_temp.pd_expect(format('select public.read_system_version_pinned_revision(%L,%L,%L)',
   'bc326000-0000-4000-8000-000000000003','declaration-stranger@example.test',v->>'id'),'business_record_access_denied');

 -- Title-only adaptation fits its declaration and still needs a fresh decision.
 changed:=jsonb_set(definition,'{title}','"Adapted intake"');
 v:=pg_temp.pd_save(v,pg_temp.pd_override(v,changed));
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,changed)),'system_version_release_approval_required');
 perform pg_temp.pd_approve(v); v:=pg_temp.pd_save(v,pg_temp.pd_release(v,changed));
 perform pg_temp.pd_assert(public.application_runtime_snapshot(native)->>'title'='Adapted intake','within-declaration adaptation succeeds');
 select * into state from public.application_states where work_id=native;
 snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select public.rollback_application_release(%L,%L,%L,%L,%s,2,1)',native,
   'bc326000-0000-4000-8000-000000000011','bc326000-0000-4000-8000-000000000002','declaration-owner@example.test',state.candidate_design_revision),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'direct native rollback cannot bypass Version release pointer');

 -- '*' is recomputed from stored overrides. Local declaration metadata cannot
 -- authorize contacts, person emails, egress expansion, or unknown behavior.
 for changed in select x from jsonb_array_elements(jsonb_build_array(
   jsonb_set(definition,'{fields,1,type}','"contact"'),
   jsonb_set(definition,'{fields,1,type}','"assigned_person"'),
   jsonb_set(definition,'{fields,1,type}','"text"'),
   definition||'{"outsideEffects":["payment"]}'::jsonb,
   jsonb_set(definition,'{declaration,outsideEffects}','["email","payment"]'),
   definition-'declaration'
 )) x loop
   v:=pg_temp.pd_save(v,pg_temp.pd_override(v,changed));
   perform pg_temp.pd_approve(v); snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
   perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,changed)),'system_version_declaration_invalid');
   perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'rejected release atomically retains Version, native, System and history');
 end loop;
 changed:=jsonb_set(definition,'{fields,1,type}','"contact"');
 changed:=jsonb_set(changed,'{declaration}',public.system_version_native_behavior(changed));
 v:=pg_temp.pd_save(v,pg_temp.pd_override(v,changed));
 perform pg_temp.pd_approve(v); snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,changed)),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'self-consistent caller declaration still cannot widen the source pin');

 -- Adoption of a narrower revision does not silently approve kept '*' work.
 narrow:=jsonb_set(definition,'{fields}',jsonb_build_array(definition->'fields'->0));
 narrow:=jsonb_set(narrow,'{declaration}',public.system_version_native_behavior(narrow));
 perform public.publish_system_version_source_revision('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(narrow));
 changed:=jsonb_set(definition,'{declaration}',narrow->'declaration');
 v:=pg_temp.pd_save(v,jsonb_set(pg_temp.pd_override(v,changed),'{baseline}',jsonb_build_object('revision',2,'definition',narrow)));
 perform pg_temp.pd_approve(v); snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,changed)),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'narrowed adoption rejects kept broader behavior');
 v:=pg_temp.pd_save(v,jsonb_set(v,'{overrides}','[]'));
 perform pg_temp.pd_approve(v); v:=pg_temp.pd_save(v,pg_temp.pd_release(v,narrow));
 perform pg_temp.pd_assert(public.application_runtime_snapshot(native)->>'release_version'='3','cleared broader override releases narrowed source');
 -- Restoring old implementation bytes must obey today's adopted declaration.
 changed:=jsonb_set(v->'releases'->0->'definition','{declaration}',narrow->'declaration');
 v:=pg_temp.pd_save(v,pg_temp.pd_override(v,changed));
 perform pg_temp.pd_approve(v); snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,changed)),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'old release restore cannot widen a narrowed declaration');

 -- The compatibility boundary may retain undeclared untyped lineage, never
 -- execute it. Republish and adopt declared source before release.
 perform public.publish_system_version_source_revision('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision('{"kind":"google_listing","title":"Legacy draft"}',3));
 v:=pg_temp.pd_save(v,jsonb_set(jsonb_set(v,'{overrides}','[]'),'{baseline}','{"revision":3,"definition":{"kind":"google_listing","title":"Legacy draft"}}'));
 snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,v->'baseline'->'definition')),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'missing declaration is an explicit failure, never a successful no-op');
 perform public.publish_system_version_source_revision('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(narrow,4));
 v:=pg_temp.pd_save(v,jsonb_set(v,'{baseline}',jsonb_build_object('revision',4,'definition',narrow)));
 perform pg_temp.pd_approve(v); v:=pg_temp.pd_save(v,pg_temp.pd_release(v,narrow));
 perform pg_temp.pd_assert(public.application_runtime_snapshot(native)->>'release_version'='4','republished and adopted declaration restores release path');
 update pd_created set value=v;
end $$;
-- Source-level prerequisites remain distinct from runtime-inferred behavior.
do $$ declare v jsonb:=(select value from pd_created); definition jsonb; revision jsonb; snapshot jsonb; begin
 definition:=jsonb_set(v->'baseline'->'definition','{declaration,bindingKinds}','["booking_calendar"]');
 revision:=jsonb_set(pg_temp.pd_revision(definition,5),'{requires,bindingKinds}','["booking_calendar"]');
 perform public.publish_system_version_source_revision('bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',revision);
 v:=pg_temp.pd_save(v,jsonb_set(jsonb_set(v,'{overrides}','[]'),'{baseline}',jsonb_build_object('revision',5,'definition',definition)));
 perform pg_temp.pd_approve(v); snapshot:=pg_temp.pd_snapshot((v->>'id')::uuid);
 perform pg_temp.pd_expect(format('select pg_temp.pd_save(%L,%L)',v,pg_temp.pd_release(v,definition)),'system_version_declaration_invalid');
 perform pg_temp.pd_assert(snapshot=pg_temp.pd_snapshot((v->>'id')::uuid),'required binding must exist locally at release');
end $$;
-- Dropping executable type metadata must not bypass source shareability.
select pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
 'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision('{"records":[{"private":"fixture"}]}',6)),
 'system_version_declaration_invalid');
select pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
 'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision(
 jsonb_set(pg_temp.pd_lineage()->'baseline'->'definition','{title}','"token=fictional-placeholder"'),6)),
 'system_version_declaration_invalid');
select pg_temp.pd_expect(format('select public.publish_system_version_source_revision(%L,%L,%L)',
 'bc326000-0000-4000-8000-000000000001','declaration-operator@example.test',pg_temp.pd_revision('{"kind":"google_listing","content":{"__proto__":{"x":1}}}',6)),
 'system_version_declaration_invalid');
\if :declaration_keep_fixture
commit;
\else
rollback;
\endif
