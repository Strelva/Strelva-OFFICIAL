\set ON_ERROR_STOP on
-- Reuse the fictional make-systems fixture. No direct customer membership
-- is required for an actively delegated agency; owners file Requests.
begin;
update public.workspace_delegations set status='active',revoked_at=null,revoked_by=null
  where id='d7000000-0000-4000-8000-000000000030';
create function pg_temp.wp_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'work plan assertion: %',message; end if; end; $$;
create function pg_temp.wp_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise; end if; return; end;
  raise exception 'expected error %',expected;
end; $$;
create temp table wp_saved as select * from public.save_system_work_plan(
  'd7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test',
  'Intake from one sentence',
  '{"version":1,"status":"ready","metadata":{"workspaceId":"d7000000-0000-4000-8000-000000000010","createdBy":"d7000000-0000-4000-8000-000000000006","revision":1},"proposedOutputs":[{"id":"intake","draft":{"kind":"application"},"nativeOperationIds":["create_application"]}]}',null);
select pg_temp.wp_assert((select count(*)=1 from wp_saved),'delegated plan saved');
select pg_temp.wp_assert((select count(*)=1 from public.read_system_work_plan(
  'd7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test',(select id from wp_saved))),'delegated read');
create temp table wp_native as select '{"version":1,"revision":0,"title":"Intake","createdBy":"d7000000-0000-4000-8000-000000000006","createdAt":"2026-10-07T12:00:00Z","history":[],"status":"draft","specVersion":1,"spec":{"title":"Intake","maintenanceOwner":"d7000000-0000-4000-8000-000000000006","fields":[{"id":"name","label":"Name","type":"text","required":true},{"id":"contact","label":"Contact","type":"contact","required":false}],"components":[{"kind":"form","fields":["name","contact"]}]},"versions":[],"records":[],"rehearsal":null}'::jsonb payload;
update wp_native set payload=jsonb_set(payload,'{versions}',jsonb_build_array(jsonb_build_object('version',1,'spec',payload->'spec')));
create temp table wp_output as select * from public.execute_system_work_plan_output(
  (select id from wp_saved),'d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test',
  1,'intake','create_application','w6-plan-intake',repeat('a',64),'applications','application','Intake',
  (select payload from wp_native),
  '{}','[]');
select pg_temp.wp_assert((select status='completed' and not replayed from wp_output),'native draft completed');
select pg_temp.wp_assert((select count(*)=1 from public.list_system_work_plan_outputs(
  (select id from wp_saved),'d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test')),'execution listed');
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000001','make-owner@example.test')$q$,'workspace_make_systems_required');
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000002','make-admin@example.test')$q$,'workspace_make_systems_required');
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000003','make-member@example.test')$q$,'workspace_make_systems_required');
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000012','d7000000-0000-4000-8000-000000000006','make-agency@example.test')$q$,'workspace_membership_required');
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','wrong@example.test')$q$,'workspace_access_denied');
update public.workspace_delegations set status='revoked',revoked_at=clock_timestamp()
  where customer_workspace_id='d7000000-0000-4000-8000-000000000010' and agency_workspace_id='d7000000-0000-4000-8000-000000000011';
select pg_temp.wp_error($q$select public.require_system_work_plan_actor('d7000000-0000-4000-8000-000000000010','d7000000-0000-4000-8000-000000000006','make-agency@example.test')$q$,'workspace_membership_required');
select pg_temp.wp_assert(not has_function_privilege('authenticated','public.save_system_work_plan(uuid,uuid,text,text,jsonb,jsonb)','execute'),'browser cannot bypass app release');
rollback;
