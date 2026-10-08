\set ON_ERROR_STOP on
\if :{?qualification_keep_fixture}
\else
\set qualification_keep_fixture false
\endif
begin;
create function pg_temp.rq_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Revision qualification: %',label; end if; end $$;
create function pg_temp.rq_expect(q text,expected text) returns void language plpgsql as $$
begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',now()),
 ('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test',now()),
 ('bc327000-0000-4000-8000-000000000003','qualification-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('bc327000-0000-4000-8000-000000000010','agency','Qualification creator','bc327000-0000-4000-8000-000000000001'),
 ('bc327000-0000-4000-8000-000000000011','customer','Qualification reader','bc327000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc327000-0000-4000-8000-000000000010','bc327000-0000-4000-8000-000000000001','owner','bc327000-0000-4000-8000-000000000001'),
 ('bc327000-0000-4000-8000-000000000011','bc327000-0000-4000-8000-000000000002','owner','bc327000-0000-4000-8000-000000000002');
create temporary table rq_source(id uuid);
insert into rq_source select (public.create_system_version_source('bc327000-0000-4000-8000-000000000010','bc327000-0000-4000-8000-000000000001',
 'qualification-creator@example.test','{"name":"Source","kind":"internal_app"}','bc327000-0000-4000-8000-000000000020',repeat('b',64))->'system'->>'id')::uuid;
create temporary table rq_revisions(value jsonb);
do $$ declare definition jsonb:='{"kind":"internal_app","title":"Requests","fields":[{"id":"subject","label":"Subject","type":"text","required":true}],"components":[{"kind":"form","fields":["subject"]}]}'::jsonb; n int;
begin
 definition:=definition||jsonb_build_object('declaration',public.system_version_native_behavior(definition));
 for n in 1..2 loop
  if n=2 then definition:=jsonb_set(definition,'{title}','"Updated requests"'); end if;
  insert into rq_revisions select public.publish_system_version_source_revision('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',jsonb_build_object(
   'source',jsonb_build_object('businessId','bc327000-0000-4000-8000-000000000010','systemId',(select id from rq_source),'revisionId',case when n=1 then 'bc327000-0000-4000-8000-000000000031' else 'bc327000-0000-4000-8000-000000000032' end,'number',n),
   'definition',definition,'summary','Qualification fixture','requires','{"bindingKinds":[]}'::jsonb,'publishedBy','bc327000-0000-4000-8000-000000000001','publishedAt',now()));
 end loop;
end $$;
select public.put_system_version_source('bc327000-0000-4000-8000-000000000010','bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',(select id from rq_source),array['bc327000-0000-4000-8000-000000000011'::uuid]);
grant select on rq_source,rq_revisions to service_role;
create function pg_temp.rq_record(n int default 1) returns jsonb language sql as $$
 select jsonb_build_object('id',case when n=1 then 'bc327000-0000-4000-8000-000000000101' else 'bc327000-0000-4000-8000-000000000102' end,
  'schemaVersion',1,'source',r.value->'source','previousRevisionId',case when n=1 then null else 'bc327000-0000-4000-8000-000000000031' end,
  'comparedPaths',case when n=1 then '[]'::jsonb else '["title"]'::jsonb end,'automatedStatus','passed',
  'humanReview',jsonb_build_object('status','pending','reason','review_policy_pending'),'evaluatedBy','bc327000-0000-4000-8000-000000000001','evaluatedAt','2026-10-08T00:00:00.000Z',
  'evidence',(select jsonb_agg(jsonb_build_object('id','source_revision.'||k,'source',r.value->'source','check',k,
   'kind',case when k='rehearsal' then 'integration_test' else 'focused_test' end,'environment','local','status','passed','reference','source-revision:'||(r.value->'source'->>'revisionId')||':'||k,
   'checkedAt','2026-10-08T00:00:00.000Z','summary','Bounded local fixture')) from unnest(array['shareable_definition','declaration_match','rehearsal','prior_revision_compare']) k))
 from rq_revisions r where (value->'source'->>'number')::int=n
$$;
create function pg_temp.rq_save(record jsonb,n int default 1) returns jsonb language sql as $$
 select public.record_system_revision_qualification('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',
  (value->'source'->>'revisionId')::uuid,value->'definition','{}'::text[],record) from rq_revisions where (value->'source'->>'number')::int=n
$$;
select pg_temp.rq_assert((select relrowsecurity from pg_class where oid='public.system_revision_qualifications'::regclass),'RLS enabled');
select pg_temp.rq_assert(not has_table_privilege('service_role','public.system_revision_qualifications','INSERT')
 and not has_table_privilege('authenticated','public.system_revision_qualifications','SELECT')
 and not has_table_privilege('anon','public.system_revision_qualifications','SELECT')
 and not has_function_privilege('authenticated','public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.read_system_revision_qualifications(uuid,text,uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.system_revision_qualification_paths(jsonb,jsonb)','EXECUTE'),'no direct table or helper bypass');
set local role service_role;
select pg_temp.rq_assert(pg_temp.rq_save(pg_temp.rq_record())=pg_temp.rq_record(),'service evidence stored');
select pg_temp.rq_assert(pg_temp.rq_save(pg_temp.rq_record())=pg_temp.rq_record(),'exact replay');
select pg_temp.rq_assert(public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000031')=jsonb_build_array(pg_temp.rq_record()),'shared source reads evidence');
select pg_temp.rq_assert(public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test','bc327000-0000-4000-8000-000000000032')='[]','new revision inherits no qualification');
select pg_temp.rq_assert(pg_temp.rq_save(pg_temp.rq_record(2),2)=pg_temp.rq_record(2),'actual prior revision compared');
select pg_temp.rq_expect($q$select public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000003','qualification-stranger@example.test','bc327000-0000-4000-8000-000000000031')$q$,'business_record_access_denied');
select pg_temp.rq_expect($q$select public.record_system_revision_qualification('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000031',(select value->'definition' from rq_revisions limit 1),'{}',pg_temp.rq_record())$q$,'business_record_access_denied');
select pg_temp.rq_expect($q$select public.record_system_revision_qualification('bc327000-0000-4000-8000-000000000001','wrong@example.test','bc327000-0000-4000-8000-000000000031',(select value->'definition' from rq_revisions limit 1),'{}',pg_temp.rq_record())$q$,'business_record_access_denied');
select pg_temp.rq_expect($q$select public.record_system_revision_qualification('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test','bc327000-0000-4000-8000-000000000031','{}','{}',pg_temp.rq_record())$q$,'system_revision_qualification_stale');
select pg_temp.rq_expect($q$select pg_temp.rq_save(pg_temp.rq_record(2))$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(2),'{previousRevisionId}','null'),2)$q$,'system_revision_qualification_stale');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(2),'{comparedPaths}','[]'),2)$q$,'system_revision_qualification_stale');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{evidence,0,status}','"failed"'))$q$,'system_revision_qualification_stale');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{evidence,1,check}','"shareable_definition"'))$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{evidence,1,source,revisionId}','"bc327000-0000-4000-8000-000000000032"'))$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{humanReview,status}','"approved"'))$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{humanReview,status}','"failed"'))$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(pg_temp.rq_record()||'{"status":"qualified"}')$q$,'system_revision_qualification_invalid');
select pg_temp.rq_expect($q$select pg_temp.rq_save(jsonb_set(pg_temp.rq_record(),'{evidence,0,summary}','"Replacement"'))$q$,'system_revision_qualification_stale');
select pg_temp.rq_assert(pg_temp.rq_save(jsonb_set(jsonb_set(jsonb_set(pg_temp.rq_record(),'{id}','"bc327000-0000-4000-8000-000000000103"'),'{evidence,2,status}','"failed"'),'{automatedStatus}','"failed"'))->'humanReview'='{"status":"pending","reason":"review_policy_pending"}','failed automated attempt still awaits human review');
select pg_temp.rq_expect($q$insert into public.system_revision_qualifications(id) values(gen_random_uuid())$q$,'permission denied');
reset role;
select pg_temp.rq_assert((select count(*)=3 from public.system_revision_qualifications),'replay does not duplicate history');
select pg_temp.rq_expect($q$update public.system_revision_qualifications set record=record$q$,'system_revision_qualification_immutable');
select pg_temp.rq_expect($q$delete from public.system_revision_qualifications$q$,'system_revision_qualification_immutable');
select public.put_system_version_source('bc327000-0000-4000-8000-000000000010','bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',(select id from rq_source),'{}');
select pg_temp.rq_expect($q$select public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000031')$q$,'business_record_access_denied');
-- Retention follows deletion of the owning source, as existing Version history
-- does. Two FK cascade paths must not deadlock or block the owning-row cleanup.
savepoint qualification_source_cleanup;
delete from public.system_version_sources where system_id=(select id from rq_source);
select pg_temp.rq_assert(not exists(select 1 from public.system_revision_qualifications),'whole-source deletion cascades evidence');
rollback to savepoint qualification_source_cleanup;
insert into public.workspaces(id,kind,name,created_by) values ('bc327000-0000-4000-8000-000000000013','agency','Seat provider','bc327000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('bc327000-0000-4000-8000-000000000013','bc327000-0000-4000-8000-000000000002','owner','bc327000-0000-4000-8000-000000000002');
-- A real provider seat retains inherited source visibility, but is not a
-- direct creator membership and cannot append qualification evidence.
insert into public.workspaces(id,kind,name,created_by) values
 ('bc327000-0000-4000-8000-000000000012','customer','Seat-only qualification client','bc327000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('bc327000-0000-4000-8000-000000000012','bc327000-0000-4000-8000-000000000001','owner','bc327000-0000-4000-8000-000000000001');
select public.choose_business_provider('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test','bc327000-0000-4000-8000-000000000012','bc327000-0000-4000-8000-000000000013');
select public.set_agency_client_staff('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000013','bc327000-0000-4000-8000-000000000012','bc327000-0000-4000-8000-000000000002',true);
create temporary table rq_seat_source(id uuid);
insert into rq_seat_source select (public.create_system_version_source('bc327000-0000-4000-8000-000000000012','bc327000-0000-4000-8000-000000000001',
 'qualification-creator@example.test','{"name":"Customer source","kind":"internal_app"}','bc327000-0000-4000-8000-000000000021',repeat('c',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','bc327000-0000-4000-8000-000000000012','systemId',(select id from rq_seat_source),'revisionId','bc327000-0000-4000-8000-000000000033','number',1),
 'definition',(select value->'definition' from rq_revisions limit 1),'summary','Seat fixture','requires','{"bindingKinds":[]}'::jsonb,'publishedBy','bc327000-0000-4000-8000-000000000001','publishedAt',now()));
select pg_temp.rq_assert(public.provider_seat_role('bc327000-0000-4000-8000-000000000012','bc327000-0000-4000-8000-000000000002',false)='admin','seat fixture resolves real admin access');
set local role service_role;
select pg_temp.rq_assert(public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000033')='[]','seat can read evidence under existing source visibility');
select pg_temp.rq_expect($q$select public.record_system_revision_qualification('bc327000-0000-4000-8000-000000000002','qualification-reader@example.test','bc327000-0000-4000-8000-000000000033',(select value->'definition' from rq_revisions limit 1),'{}',pg_temp.rq_record())$q$,'business_record_access_denied');
reset role;
set local role authenticated;
select pg_temp.rq_expect($q$select public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test','bc327000-0000-4000-8000-000000000031')$q$,'permission denied');
reset role;
\if :qualification_keep_fixture
commit;
\else
rollback;
\endif
