create or replace function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$ begin if not ok then raise exception 'assertion failed: %',message; end if; end $$;
insert into public.users(id,email,verified_at) values
('b1000000-0000-4000-8000-000000000001','export-owner@example.test',clock_timestamp()),
('b1000000-0000-4000-8000-000000000002','export-member@example.test',clock_timestamp()),
('b1000000-0000-4000-8000-000000000003','export-other@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values
('b1000000-0000-4000-8000-000000000010','customer','Export Harbor','b1000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000011','agency','Delegated Agency','b1000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','owner','b1000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000002','member','b1000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000011','b1000000-0000-4000-8000-000000000003','owner','b1000000-0000-4000-8000-000000000003');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,input,created_by) values
('b1000000-0000-4000-8000-000000000022','b1000000-0000-4000-8000-000000000011','documents','document','Foreign source','{}',null,'b1000000-0000-4000-8000-000000000003');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,input,source_work_id,created_by) values
('b1000000-0000-4000-8000-000000000020','b1000000-0000-4000-8000-000000000010','tracker','tracker','Portable result','{"rows":[]}','{"privatePrompt":"excluded"}',null,'b1000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000023','b1000000-0000-4000-8000-000000000010','applications','application','Installed result','{"createdAt":"2026-09-18T12:00:00.000Z","history":[],"spec":{"title":"Installed app","maintenanceOwner":"owner","fields":[{"id":"name","label":"Name","type":"text","required":false}],"components":[{"kind":"form","fields":["name"]}]},"specVersion":1,"status":"draft","versions":[],"rehearsal":null,"records":[],"installation":{"sourceWorkId":"b1000000-0000-4000-8000-000000000022","sourceVersion":1,"baseSpec":{"title":"Installed app","maintenanceOwner":"owner","fields":[{"id":"name","label":"Name","type":"text","required":false}],"components":[{"kind":"form","fields":["name"]}]}}}',null,'b1000000-0000-4000-8000-000000000022','b1000000-0000-4000-8000-000000000001'),
('b1000000-0000-4000-8000-000000000021','b1000000-0000-4000-8000-000000000010','product-learning','internal_experiment','Internal','{"operatorNotes":"excluded"}',null,null,'b1000000-0000-4000-8000-000000000001');
insert into public.job_economics(id,workspace_id,work_id,product_id,resource_kind,payer_id,max_authorized_cents,reserved_cents,used_cents,actual_cents,actual_known,status,created_by,accepted_by,accepted_at) values
('b1000000-0000-4000-8000-000000000030','b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000020','tracker','tracker','b1000000-0000-4000-8000-000000000001',500,100,0,null,false,'accepted','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',clock_timestamp()),
('b1000000-0000-4000-8000-000000000032','b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000020','tracker','tracker','b1000000-0000-4000-8000-000000000002',600,0,0,null,false,'accepted','b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002',clock_timestamp());
insert into public.job_economics_usage(id,job_id,idempotency_key,kind,attribution,amount_cents,source,command_digest,recorded_by) values
('b1000000-0000-4000-8000-000000000031','b1000000-0000-4000-8000-000000000030','private-key','human','normal',null,'operator_reported',repeat('a',32),'b1000000-0000-4000-8000-000000000001');
insert into public.job_economics_executions(job_id,execution_key,maximum_cents,kind,attribution,status,effect,amount_cents,billable_cents,created_by,finished_at) values
('b1000000-0000-4000-8000-000000000030','private-execution-key',100,'human','normal','finished','unknown',null,100,'b1000000-0000-4000-8000-000000000001',clock_timestamp());
do $$ declare exported jsonb; caught text; before_receipts integer; owner_job jsonb; successor_job jsonb; begin
  exported:=public.export_workspace_snapshot('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','EXPORT-OWNER@example.test');
  perform pg_temp.assert_true(exported->>'schemaVersion'='1','schema is versioned');
  perform pg_temp.assert_true(exported#>>'{workspace,name}'='Export Harbor','workspace identity is present');
  perform pg_temp.assert_true(jsonb_array_length(exported->'savedResults')=2,'only supported results are exported');
  perform pg_temp.assert_true(exported#>>'{economics,jobs,0,actualKnown}'='false' and exported#>'{economics,jobs,0,actualCents}'='null'::jsonb,'unknown cost stays unknown');
  select value into owner_job from jsonb_array_elements(exported#>'{economics,jobs}') where value->>'id'='b1000000-0000-4000-8000-000000000030';
  select value into successor_job from jsonb_array_elements(exported#>'{economics,jobs}') where value->>'id'='b1000000-0000-4000-8000-000000000032';
  perform pg_temp.assert_true(owner_job->>'payerId'='b1000000-0000-4000-8000-000000000001' and owner_job->>'acceptedBy'='b1000000-0000-4000-8000-000000000001','original payer attribution is preserved');
  perform pg_temp.assert_true(successor_job->>'payerId'='b1000000-0000-4000-8000-000000000002' and successor_job->>'acceptedBy'='b1000000-0000-4000-8000-000000000002','successor payer attribution is preserved');
  perform pg_temp.assert_true(exported::text not like '%privatePrompt%' and exported::text not like '%private-key%' and exported::text not like '%private-execution-key%' and exported::text not like '%commandDigest%' and exported::text not like '%operatorNotes%' and exported::text not like '%b1000000-0000-4000-8000-000000000022%','private, idempotency, internal, and foreign lineage fields are absent');
  perform pg_temp.assert_true((select category_counts->>'economicsJobs' from public.workspace_export_receipts where workspace_id='b1000000-0000-4000-8000-000000000010')='2','receipt counts come from the returned snapshot');
  perform pg_temp.assert_true((select count(*) from public.workspace_export_receipts where workspace_id='b1000000-0000-4000-8000-000000000010')=1,'successful export has metadata receipt');
  caught:=null; begin perform public.export_workspace_snapshot('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000002','export-member@example.test'); exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_export_denied','member denied');
  caught:=null; begin perform public.export_workspace_snapshot('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000003','export-other@example.test'); exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_export_denied','delegated or foreign owner denied');
  delete from public.workspace_memberships where workspace_id='b1000000-0000-4000-8000-000000000010' and user_id='b1000000-0000-4000-8000-000000000001';
  caught:=null; begin perform public.export_workspace_snapshot('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','export-owner@example.test'); exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_export_denied','revoked owner denied');
  insert into public.workspace_memberships values('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','owner','b1000000-0000-4000-8000-000000000001',clock_timestamp());
  update public.saved_product_work set payload=jsonb_build_object('content',repeat('x',2000001)) where id='b1000000-0000-4000-8000-000000000020';
  select count(*) into before_receipts from public.workspace_export_receipts;
  caught:=null; begin perform public.export_workspace_snapshot('b1000000-0000-4000-8000-000000000010','b1000000-0000-4000-8000-000000000001','export-owner@example.test'); exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='workspace_export_too_large','over-limit snapshot denied');
  perform pg_temp.assert_true((select count(*) from public.workspace_export_receipts)=before_receipts,'over-limit creates no success receipt');
end $$;
select 'workspace export checks passed' result;
