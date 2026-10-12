\set ON_ERROR_STOP on
-- Native applications take any number of candidate versions and releases:
-- 120 revise/rehearse/publish rounds through the real RPCs, then a rollback
-- to release 1, which is far outside the recent window.
create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end; $$;

select pg_temp.assert_true(not has_table_privilege('authenticated','public.application_candidate_versions','SELECT'),'candidate archive hidden from authenticated');
select pg_temp.assert_true(not has_table_privilege('service_role','public.application_candidate_versions','INSERT'),'service role cannot write the candidate archive directly');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.application_candidate_versions'::regclass),'candidate archive RLS on');
-- Earlier fixtures' candidate versions were archived when the migration ran.
select pg_temp.assert_true(exists(select 1 from public.application_candidate_versions where work_id='91000000-0000-4000-8000-000000000020'),'existing candidate versions archived');

insert into public.users(id,email,verified_at) values
 ('91900000-0000-4000-8000-000000000001','history-owner@example.com',now()),
 ('91900000-0000-4000-8000-000000000003','history-foreign@example.com',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('91900000-0000-4000-8000-000000000010','customer','Long-lived tool business','91900000-0000-4000-8000-000000000001'),
 ('91900000-0000-4000-8000-000000000011','customer','Other business','91900000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('91900000-0000-4000-8000-000000000010','91900000-0000-4000-8000-000000000001','owner','91900000-0000-4000-8000-000000000001'),
 ('91900000-0000-4000-8000-000000000011','91900000-0000-4000-8000-000000000003','owner','91900000-0000-4000-8000-000000000003');

do $$
declare
 app_id uuid := '91900000-0000-4000-8000-000000000020';
 space_id uuid := '91900000-0000-4000-8000-000000000010';
 owner_id uuid := '91900000-0000-4000-8000-000000000001';
 email text := 'history-owner@example.com';
 spec jsonb := '{"title":"Intake v0","maintenanceOwner":"91900000-0000-4000-8000-000000000001","fields":[{"id":"name","label":"Name","type":"text","required":true}],"components":[{"kind":"form","fields":["name"]},{"kind":"list","fields":["name"]}]}';
 design_revision integer;
 release_version integer;
 state_row public.application_states;
 work_row public.saved_product_work;
 snapshot jsonb;
 caught text;
 i integer;
begin
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
 values(app_id,space_id,'applications','application','Intake v0',jsonb_build_object(
   'version',1,'revision',0,'title','Intake v0','spec',spec,'specVersion',1,'status','draft',
   'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',spec)),
   'rehearsal',null,'records','[]'::jsonb,'history','[]'::jsonb),owner_id);
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,email,0);
 perform public.publish_application_candidate(app_id,space_id,owner_id,email,0,0);

 for i in 1..120 loop
  select * into state_row from public.application_states where work_id=app_id;
  design_revision := state_row.candidate_design_revision;
  release_version := state_row.current_release_version;
  perform public.update_application_candidate(app_id,space_id,owner_id,email,design_revision,jsonb_set(spec,'{title}',to_jsonb('Intake v' || i)));
  perform public.rehearse_application_candidate(app_id,space_id,owner_id,email,design_revision + 1);
  perform public.publish_application_candidate(app_id,space_id,owner_id,email,design_revision + 1,release_version);
 end loop;

 select * into state_row from public.application_states where work_id=app_id;
 perform pg_temp.assert_true(state_row.current_release_version = 121,'release 121 published past the old 100 cap');
 perform pg_temp.assert_true(jsonb_array_length(state_row.candidate_versions) <= 50,'candidate versions keep the recent window');
 perform pg_temp.assert_true((select count(*) from public.application_candidate_versions where work_id=app_id) = 121,'every candidate version archived');
 perform pg_temp.assert_true((select count(*) from public.application_releases where work_id=app_id) = 121,'every release kept');
 select * into work_row from public.saved_product_work where id=app_id;
 perform pg_temp.assert_true(jsonb_array_length(work_row.payload->'releases') <= 50 and jsonb_array_length(work_row.payload->'versions') <= 50,'compatibility payload lists stay bounded');
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='121' and snapshot->>'title'='Intake v120','runtime serves the latest release');

 -- Roll back to release 1, outside every window.
 perform public.rollback_application_release(app_id,space_id,owner_id,email,state_row.candidate_design_revision,121,1);
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='1' and snapshot->>'title'='Intake v0','rollback reaches the first release');

 -- Another business still cannot change it.
 caught := null;
 select * into state_row from public.application_states where work_id=app_id;
 begin perform public.update_application_candidate(app_id,'91900000-0000-4000-8000-000000000011','91900000-0000-4000-8000-000000000003','history-foreign@example.com',state_row.candidate_design_revision,spec); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught is not null,'another business cannot revise');

 caught := null;
 begin update public.application_candidate_versions set created_at=now() where work_id=app_id and version=1; exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_candidate_version_immutable','candidate archive is append-only');
end $$;
