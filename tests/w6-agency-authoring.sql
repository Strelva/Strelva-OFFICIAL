\set ON_ERROR_STOP on
-- Agency authoring and durable commands on fictional local rows only.
begin;
create function pg_temp.author_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency authoring assertion failed: %',message; end if; end;
$$;
create function pg_temp.author_expect(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlerrm<>expected then raise exception 'expected % but got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but command succeeded',expected;
end;
$$;

select pg_temp.author_assert(
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.agency_package_commands'::regclass,'public.system_version_preparations'::regclass))
  and not has_table_privilege('authenticated','public.agency_package_commands','SELECT')
  and not has_table_privilege('anon','public.system_version_preparations','INSERT')
  and has_function_privilege('service_role','public.require_agency_authoring_scope(uuid,uuid,uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.read_agency_package_command(uuid,uuid,text,uuid,uuid,text,integer,text)','EXECUTE')
  and has_function_privilege('service_role','public.record_version_preparation(uuid,uuid,text,uuid,bigint,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.read_agency_package_command(uuid,uuid,text,uuid,uuid,text,integer,text)','EXECUTE')
  and not has_function_privilege('service_role','public.agency_package_assert_shareable(jsonb)','EXECUTE'),
  'only service-role commands expose agency authoring, with RLS and closed helpers');

insert into public.users(id,email,verified_at) values
  ('ea600000-0000-4000-8000-000000000001','author-operator@example.test',now()),
  ('ea600000-0000-4000-8000-000000000002','author-owner@example.test',now()),
  ('ea600000-0000-4000-8000-000000000003','author-other@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('ea600000-0000-4000-8000-000000000010','agency','Fictional authoring agency','ea600000-0000-4000-8000-000000000001'),
  ('ea600000-0000-4000-8000-000000000011','customer','Fictional authoring client','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000012','customer','Fictional relationship-only client','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000013','customer','Fictional unrelated client','ea600000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','owner','ea600000-0000-4000-8000-000000000001'),
  ('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000002','owner','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000001','admin','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000012','ea600000-0000-4000-8000-000000000002','owner','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000013','ea600000-0000-4000-8000-000000000002','owner','ea600000-0000-4000-8000-000000000002'),
  ('ea600000-0000-4000-8000-000000000013','ea600000-0000-4000-8000-000000000001','admin','ea600000-0000-4000-8000-000000000002');
insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values
  ('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000010','operator','ea600000-0000-4000-8000-000000000001'),
  ('ea600000-0000-4000-8000-000000000012','ea600000-0000-4000-8000-000000000010','operator','ea600000-0000-4000-8000-000000000001');

select pg_temp.author_assert(public.require_agency_authoring_scope('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000011',
  'ea600000-0000-4000-8000-000000000001','author-operator@example.test'),'agency membership plus client direct admin authorizes build');
select pg_temp.author_expect($q$select public.require_agency_authoring_scope('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000012','ea600000-0000-4000-8000-000000000001','author-operator@example.test')$q$,
  'business_record_access_denied');
select pg_temp.author_expect($q$select public.require_agency_authoring_scope('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000013','ea600000-0000-4000-8000-000000000001','author-operator@example.test')$q$,
  'business_record_access_denied');
select pg_temp.author_expect($q$select public.require_agency_authoring_scope('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000002','author-owner@example.test')$q$,
  'business_record_access_denied');

create temporary table author_source(id uuid);
insert into author_source select (public.create_system_version_source('ea600000-0000-4000-8000-000000000010',
  'ea600000-0000-4000-8000-000000000001','author-operator@example.test','{"name":"Reusable intake","kind":"inquiry"}',
  'ea600000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
create function pg_temp.author_revision(n integer, definition jsonb) returns jsonb language sql as $$
  select jsonb_build_object('source',jsonb_build_object('businessId','ea600000-0000-4000-8000-000000000010',
    'systemId',(select id from author_source),'revisionId',gen_random_uuid(),'number',n),
    'definition',definition,'summary','Package '||n,'requires',jsonb_build_object('bindingKinds',jsonb_build_array('booking_calendar')),
    'publishedBy','ea600000-0000-4000-8000-000000000001','publishedAt',clock_timestamp(),'packageFingerprint','source:original');
$$;
create temporary table author_package(command uuid,value jsonb);
insert into author_package select 'ea600000-0000-4000-8000-000000000030',public.publish_agency_package(
  'ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test',
  'ea600000-0000-4000-8000-000000000030',0,pg_temp.author_revision(1,'{"title":"Intake"}'));
select pg_temp.author_assert(public.publish_agency_package('ea600000-0000-4000-8000-000000000010',
  'ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000030',0,
  pg_temp.author_revision(1,'{"title":"Intake"}'))->'source'->>'revisionId'=(select value->'source'->>'revisionId' from author_package),
  'same command replays one accepted immutable revision despite a new transient revision id/time');
select pg_temp.author_assert((select count(*) from public.system_version_source_revisions where source_system_id=(select id from author_source))=1,
  'publication retry never inserts a second revision');
select pg_temp.author_expect(format($q$select public.publish_agency_package('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test',gen_random_uuid(),0,%L)$q$,
  pg_temp.author_revision(1,'{"title":"Intake"}')),'system_version_stale');
select pg_temp.author_expect(format($q$select public.publish_agency_package('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000030',0,%L)$q$,
  pg_temp.author_revision(1,'{"title":"Changed payload"}')),'system_version_stale');
select pg_temp.author_expect(format($q$select public.publish_agency_package('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test',gen_random_uuid(),1,%L)$q$,
  jsonb_set(pg_temp.author_revision(2,'{"title":"Intake"}'),'{source,businessId}','"ea600000-0000-4000-8000-000000000011"')),'business_record_access_denied');

-- Shape, bindings, grants and secret material are rejected recursively,
-- including a sensitive object nested in an otherwise shareable array.
do $$ declare bad jsonb; begin
  for bad in select value from jsonb_array_elements('[{"records":[]},{"sections":[{"bindings":[]}]},{"nested":{"grants":[]}},{"nested":{"secret":"fixture"}},{"copy":"api_key=fixture"}]') loop
    perform pg_temp.author_expect(format($q$select public.publish_agency_package('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test',gen_random_uuid(),1,%L)$q$,
      pg_temp.author_revision(2,bad)),'system_version_input_invalid');
  end loop;
end; $$;

-- A later source revision does not erase the original command receipt.
select public.publish_agency_package('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test',
  'ea600000-0000-4000-8000-000000000031',1,pg_temp.author_revision(2,'{"title":"Improved intake"}'));
select pg_temp.author_assert(public.read_agency_package_command('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001',
  'author-operator@example.test','ea600000-0000-4000-8000-000000000030',(select id from author_source),'source:original',0,'Package 1')->'source'->>'revisionId'
  =(select value->'source'->>'revisionId' from author_package),'receipt lookup succeeds after the mutable source advances');
select pg_temp.author_expect(format($q$select public.read_agency_package_command('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000030',%L,'source:changed',0,'Package 1')$q$,
  (select id from author_source)),'system_version_stale');
select pg_temp.author_expect(format($q$select public.read_agency_package_command('ea600000-0000-4000-8000-000000000010','ea600000-0000-4000-8000-000000000002','author-owner@example.test','ea600000-0000-4000-8000-000000000030',%L,'source:original',0,'Package 1')$q$,
  (select id from author_source)),'business_record_access_denied');

-- Direct fixture rows let the preparation tests isolate their new boundary.
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
  ('ea600000-0000-4000-8000-000000000040','ea600000-0000-4000-8000-000000000011','Client intake','inquiry',gen_random_uuid(),repeat('b',64),'ea600000-0000-4000-8000-000000000002','ea600000-0000-4000-8000-000000000002');
insert into public.system_versions(id,version_system_id,business_workspace_id,source_system_id,source_workspace_id,context_kind,context_label,
  baseline_revision_id,baseline_revision,baseline_definition,created_by,created_at,updated_at)
select 'ea600000-0000-4000-8000-000000000050','ea600000-0000-4000-8000-000000000040','ea600000-0000-4000-8000-000000000011',
  (select id from author_source),'ea600000-0000-4000-8000-000000000010','agency_client','Fictional client',(value->'source'->>'revisionId')::uuid,1,'{"title":"Intake"}',
  'ea600000-0000-4000-8000-000000000002',clock_timestamp(),clock_timestamp() from author_package;
insert into public.owner_decisions(id,workspace_id,system_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,
  revision_hash,sign_in_required,expires_at) values
  ('ea600000-0000-4000-8000-000000000060','ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000040','system.go_live','owner_decides','Release intake','Go live','Stay draft','version_release','ea600000-0000-4000-8000-000000000050',repeat('a',64),false,clock_timestamp()+interval '14 days'),
  ('ea600000-0000-4000-8000-000000000061','ea600000-0000-4000-8000-000000000012',null,'system.go_live','owner_decides','Foreign decision','Go live','Stay draft','version_release','ea600000-0000-4000-8000-000000000050',repeat('a',64),false,clock_timestamp()+interval '14 days'),
  ('ea600000-0000-4000-8000-000000000062','ea600000-0000-4000-8000-000000000011',null,'system.go_live','owner_decides','Wrong source','Go live','Stay draft','version_release','another-version',repeat('a',64),false,clock_timestamp()+interval '14 days'),
  ('ea600000-0000-4000-8000-000000000063','ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000040','system.go_live','owner_decides','Wrong lifecycle','Go live','Stay draft','website','ea600000-0000-4000-8000-000000000050',repeat('a',64),false,clock_timestamp()+interval '14 days');
insert into public.owner_decisions(id,workspace_id,system_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,
  revision_hash,sign_in_required,expires_at,state,decided_at) values
  ('ea600000-0000-4000-8000-000000000064','ea600000-0000-4000-8000-000000000011',null,'system.go_live','owner_decides','Wrong System','Go live','Stay draft',
  'version_release','ea600000-0000-4000-8000-000000000050',repeat('b',64),false,clock_timestamp()+interval '14 days','superseded',clock_timestamp());
do $$ declare receipt jsonb; decision uuid; begin
  foreach decision in array array['ea600000-0000-4000-8000-000000000061','ea600000-0000-4000-8000-000000000062','ea600000-0000-4000-8000-000000000063','ea600000-0000-4000-8000-000000000064']::uuid[] loop
    perform pg_temp.author_expect(format($q$select public.record_version_preparation('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000050',1,%L)$q$,decision),'business_record_access_denied');
  end loop;
  perform pg_temp.author_expect($q$select public.record_version_preparation('ea600000-0000-4000-8000-000000000012','ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000050',1,'ea600000-0000-4000-8000-000000000060')$q$,'business_record_access_denied');
  perform pg_temp.author_expect($q$select public.record_version_preparation('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000001','author-operator@example.test','ea600000-0000-4000-8000-000000000050',2,'ea600000-0000-4000-8000-000000000060')$q$,'system_version_stale');
  perform pg_temp.author_expect($q$select public.record_version_preparation('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000003','author-other@example.test','ea600000-0000-4000-8000-000000000050',1,'ea600000-0000-4000-8000-000000000060')$q$,'business_record_access_denied');
  receipt := public.record_version_preparation('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000001','author-operator@example.test',
    'ea600000-0000-4000-8000-000000000050',1,'ea600000-0000-4000-8000-000000000060');
  perform pg_temp.author_assert(receipt->>'workspaceId'='ea600000-0000-4000-8000-000000000011' and receipt->>'decisionId'='ea600000-0000-4000-8000-000000000060'
    and receipt->>'rowRevision'='1','preparation receipt names this business/version/decision/revision');
  perform pg_temp.author_assert(public.record_version_preparation('ea600000-0000-4000-8000-000000000011','ea600000-0000-4000-8000-000000000001','author-operator@example.test',
    'ea600000-0000-4000-8000-000000000050',1,'ea600000-0000-4000-8000-000000000060')->>'receiptId'=receipt->>'receiptId','preparation retry returns one receipt');
end; $$;
select pg_temp.author_expect($q$update public.agency_package_commands set input_digest='changed'$q$,'system_version_history_immutable');
select pg_temp.author_expect($q$delete from public.system_version_preparations$q$,'system_version_history_immutable');
rollback;
