\set ON_ERROR_STOP on
create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end; $$;

select pg_temp.assert_true(
  not has_function_privilege('service_role', 'public.submit_application_record_internal(uuid,integer,integer,text,jsonb,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.publish_application_candidate(uuid,uuid,uuid,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.publish_application_candidate(uuid,uuid,uuid,text,integer,integer)', 'EXECUTE'),
  'only authorized service wrappers expose mutations');
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_records', 'INSERT')
  and not has_table_privilege('service_role', 'public.application_releases', 'UPDATE'),
  'direct service table writes cannot bypass release and record checks');

insert into public.users(id,email,verified_at) values
 ('91000000-0000-4000-8000-000000000001','release-owner@example.com',now()),
 ('91000000-0000-4000-8000-000000000002','release-staff@example.com',now()),
 ('91000000-0000-4000-8000-000000000003','release-foreign@example.com',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('91000000-0000-4000-8000-000000000010','customer','Repair business','91000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000011','customer','Different business','91000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000001','owner','91000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000002','member','91000000-0000-4000-8000-000000000001'),
 ('91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000003','owner','91000000-0000-4000-8000-000000000003');

do $$
declare
 app_id uuid := '91000000-0000-4000-8000-000000000020';
 space_id uuid := '91000000-0000-4000-8000-000000000010';
 owner_id uuid := '91000000-0000-4000-8000-000000000001';
 staff_id uuid := '91000000-0000-4000-8000-000000000002';
 foreign_id uuid := '91000000-0000-4000-8000-000000000003';
 spec jsonb := '{"title":"Repair requests","maintenanceOwner":"91000000-0000-4000-8000-000000000001","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}';
 next_spec jsonb;
 snapshot jsonb;
 caught text;
begin
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
 values(app_id,space_id,'applications','application','Repair requests',jsonb_build_object(
   'version',1,'revision',0,'title','Repair requests','spec',spec,'specVersion',1,'status','draft',
   'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',spec)),
   'rehearsal',null,'records','[]'::jsonb,'history','[]'::jsonb),owner_id);
 caught := null;
 begin perform public.application_runtime_snapshot(app_id); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_release_unavailable','drafts have no employee runtime');
 caught := null;
 begin perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0,0); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_rehearsal_required','publication requires exact candidate checks');
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0);
 perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0,0);
 perform public.submit_application_record(app_id,space_id,staff_id,'release-staff@example.com',1,0,'first','{"problem":"Leaking tap"}');

 next_spec := jsonb_set(spec,'{title}','"Repair requests updated"');
 perform public.update_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0,next_spec);
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='1' and snapshot->>'title'='Repair requests','candidate change leaves released application intact');
 perform public.submit_application_record(app_id,space_id,staff_id,'release-staff@example.com',1,1,'second','{"problem":"Broken door"}');
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',1);
 -- A new customer record after rehearsal must remain when publication commits.
 perform public.submit_application_record(app_id,space_id,staff_id,'release-staff@example.com',1,2,'third','{"problem":"Loose handle"}');
 perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',1,1);
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='2' and jsonb_array_length(snapshot->'records')=3,'publication preserves records entered during preparation');
 perform pg_temp.assert_true(snapshot->'records'->0->>'createdBy'=staff_id::text,'record attribution comes from authenticated actor');
 perform public.rollback_application_release(app_id,space_id,owner_id,'release-owner@example.com',1,2,1);
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='1' and jsonb_array_length(snapshot->'records')=3,'interface rollback preserves all three customer records');

 caught:=null;
 begin perform public.update_application_candidate(app_id,space_id,staff_id,'release-staff@example.com',2,spec); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_design_access_denied','staff use does not grant application design');
 caught:=null;
 begin perform public.submit_application_record(app_id,space_id,foreign_id,'release-foreign@example.com',1,3,'foreign','{"problem":"Not permitted"}'); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_access_denied','another business cannot submit');
 caught:=null;
 begin perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',1,1); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_design_revision_conflict','stale approved candidate cannot publish');

 -- Current records must block a newly required field without a migration.
 next_spec := jsonb_set(spec,'{fields}',(spec->'fields') || '[{"id":"priority","label":"Priority","type":"number","required":true}]'::jsonb);
 perform public.update_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',2,next_spec);
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',3);
 caught:=null;
 begin perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',3,1); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_rehearsal_required','incompatible candidate cannot publish over existing data');
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='1' and jsonb_array_length(snapshot->'records')=3,'failed publication leaves the current app and records unchanged');

 delete from public.workspace_memberships where workspace_id=space_id and user_id=staff_id;
 caught:=null;
 begin perform public.submit_application_record(app_id,space_id,staff_id,'release-staff@example.com',1,3,'revoked','{"problem":"Not permitted"}'); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_access_denied','revoked member cannot append a record');
 perform public.retire_application(app_id,space_id,owner_id,'release-owner@example.com',3);
 caught:=null;
 begin perform public.application_runtime_snapshot(app_id); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_release_unavailable','retired application cannot keep serving a retained release');
 perform pg_temp.assert_true((select count(*) from public.application_records where work_id=app_id)=3,'retirement preserves customer data');

 caught:=null;
 begin perform public.validate_application_spec('{}'::jsonb); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_schema_invalid','missing JSON properties cannot pass SQL null semantics');

 -- Rehearsal is not publication. A record accepted after checks can make
 -- the candidate incompatible, and publication must inspect that new data.
 app_id := '91000000-0000-4000-8000-000000000021';
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
 values(app_id,space_id,'applications','application','Publication race',jsonb_build_object(
   'version',1,'revision',0,'title','Publication race','spec',spec,'specVersion',1,'status','draft',
   'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',spec)),
   'rehearsal',null,'records','[]'::jsonb,'history','[]'::jsonb),owner_id);
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0);
 perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0,0);
 next_spec := jsonb_set(spec,'{fields,0,type}','"number"');
 perform public.update_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',0,next_spec);
 perform public.rehearse_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',1);
 perform public.submit_application_record(app_id,space_id,owner_id,'release-owner@example.com',1,0,'arrived-after-checks','{"problem":"A valid entry in the current application"}');
 caught:=null;
 begin perform public.publish_application_candidate(app_id,space_id,owner_id,'release-owner@example.com',1,1); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='application_record_invalid','publication revalidates records committed after rehearsal');
 snapshot := public.application_runtime_snapshot(app_id);
 perform pg_temp.assert_true(snapshot->>'release_version'='1' and jsonb_array_length(snapshot->'records')=1,'failed current-data validation keeps old release and newly accepted record');
end; $$;
select 'application release checks passed' as result;
