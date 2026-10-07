\set ON_ERROR_STOP on
-- Uses the fictional Leslie tool retained by internal-tool-links-schema.sql.
create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end; $$;
create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin begin execute stmt; exception when others then if sqlerrm<>expected then raise; end if; return; end;
raise exception 'expected error %',expected; end; $$;
insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by)
values ('e8000000-0000-4000-8000-000000000010','owner_recipient','{"email":"owner@leslie.example.test","name":"Leslie"}','operator','e8000000-0000-4000-8000-000000000001');
insert into public.application_records(work_id,workspace_id,record_id,values,created_by) values
('e8000000-0000-4000-8000-000000000040','e8000000-0000-4000-8000-000000000010','w6-owner','{"business":"Owner notice","client":"e8000000-0000-4000-8000-000000000030"}','e8000000-0000-4000-8000-000000000002'),
('e8000000-0000-4000-8000-000000000040','e8000000-0000-4000-8000-000000000010','w6-assigned','{"business":"Assigned notice","client":"e8000000-0000-4000-8000-000000000030","handler":"e8000000-0000-4000-8000-000000000020"}','e8000000-0000-4000-8000-000000000002');
create temp table w6_claims(name text,value jsonb);
insert into w6_claims select 'owner',public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-owner',null,'e8000000-0000-4000-8000-000000000002','links-staff@example.test');
select pg_temp.assert_true((select value->>'claimed'='true' and value->>'recipientEmail'='owner@leslie.example.test' and value->>'assignedEmail' is null from w6_claims where name='owner'),'owner notified without assignee');
insert into w6_claims select 'assigned',public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-assigned','handler','e8000000-0000-4000-8000-000000000002','links-staff@example.test');
select pg_temp.assert_true((select value->>'recipientEmail'='owner@leslie.example.test' and value->>'assignedEmail'='sam@leslie.example.test' from w6_claims where name='assigned'),'one claim addresses owner and assignee');
select pg_temp.assert_true(public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-owner',null,'e8000000-0000-4000-8000-000000000002','links-staff@example.test')->>'claimed'='false','repeat cannot send again');
select pg_temp.expect_error($q$select public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-owner',null,'e8000000-0000-4000-8000-000000000001','links-operator@example.test')$q$,'internal_tool_notice_denied');
select pg_temp.expect_error($q$select public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000010','e8000000-0000-4000-8000-000000000040','w6-assigned','business','e8000000-0000-4000-8000-000000000002','links-staff@example.test')$q$,'internal_tool_notice_denied');
select pg_temp.expect_error($q$select public.claim_internal_tool_submit_notice('e8000000-0000-4000-8000-000000000012','e8000000-0000-4000-8000-000000000040','w6-owner',null,'e8000000-0000-4000-8000-000000000004','links-other@example.test')$q$,'internal_tool_notice_denied');
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_internal_tool_submit_notice(uuid,uuid,text,text,uuid,text)','execute') and has_function_privilege('service_role','public.claim_internal_tool_submit_notice(uuid,uuid,text,text,uuid,text)','execute'),'service-role only notice claim');
