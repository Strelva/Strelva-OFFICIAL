\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.execute_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)','EXECUTE'),'application plan execution is service only');
DO $$
declare w uuid; plan_id uuid; app_spec jsonb; payload jsonb; created record; replayed record;
begin
 select id into w from public.workspaces where created_by='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind='personal' limit 1;
 app_spec := '{"title":"Repairs","maintenanceOwner":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}';
 payload := jsonb_build_object('version',1,'revision',0,'title','Repairs','createdBy','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','createdAt','2026-09-12T12:00:00Z','history','[]'::jsonb,'spec',app_spec,'specVersion',1,'status','draft','versions',jsonb_build_array(jsonb_build_object('version',1,'spec',app_spec)),'rehearsal','null'::jsonb,'records','[]'::jsonb);
 insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(w,'work_plans','plan','Prepare repairs',jsonb_build_object('version',1,'status','ready','metadata',jsonb_build_object('revision',1,'workspaceId',w),'proposedOutputs',jsonb_build_array(jsonb_build_object('id','repair-app','nativeOperationIds',jsonb_build_array('create_application'),'draft',jsonb_build_object('kind','application')))),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning id into plan_id;
 begin
  perform public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',payload || '{"status":"installed"}'::jsonb,'{}','[]');
  raise exception 'plan skipped native application checks';
 exception when others then if SQLERRM<>'work_plan_output_invalid' then raise; end if; end;
 begin
  perform public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',jsonb_set(payload,'{spec,maintenanceOwner}','"cccccccc-cccc-4ccc-8ccc-cccccccccccc"'),'{}','[]');
  raise exception 'plan assigned another maintenance owner';
 exception when others then if SQLERRM<>'work_plan_output_invalid' then raise; end if; end;
 begin
  perform public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',payload || '{"script":"fetch(secret)"}'::jsonb,'{}','[]');
  raise exception 'executable application payload accepted';
 exception when others then if SQLERRM<>'work_plan_output_invalid' then raise; end if; end;
 select * into created from public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',payload,'{}','[]');
 perform pg_temp.assert_true(created.native_product_id='applications' and not created.replayed,'reviewed plan created private application');
 perform pg_temp.assert_true((select native.source_work_id=plan_id and native.payload->>'status'='draft' and native.payload->'records'='[]'::jsonb from public.saved_product_work native where native.id=created.native_work_id),'application draft has provenance and no records');
 select * into replayed from public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',payload,'{}','[]');
 perform pg_temp.assert_true(replayed.replayed and replayed.native_work_id=created.native_work_id,'retry reopens original application');
 begin
  perform public.execute_work_plan_output(plan_id,w,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('b',64),'applications','application','Repairs',payload,'{}','[]');
  raise exception 'changed accepted inputs replayed';
 exception when others then if SQLERRM<>'work_plan_output_idempotency_conflict' then raise; end if; end;
 begin
  perform public.execute_work_plan_output(plan_id,'66666666-6666-4666-8666-666666666666','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',1,'repair-app','create_application','application-plan-test',repeat('a',64),'applications','application','Repairs',payload,'{}','[]');
  raise exception 'receipt crossed workspace boundary';
 exception when others then if SQLERRM<>'workspace_access_denied' then raise; end if; end;
end $$;
