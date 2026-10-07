\set ON_ERROR_STOP on
-- Fictional fixtures only. Roll back all label visibility changes.
begin;
create function pg_temp.label_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'label assertion: %',message; end if; end; $$;
create function pg_temp.label_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise; end if; return; end;
  raise exception 'expected label error %',expected;
end; $$;
update public.application_use_grants set status='revoked',revoked_at=clock_timestamp()
where work_id='e8000000-0000-4000-8000-000000000040' and recipient_email='links-outsider@example.test' and status='active';
create temp table label_grant as select * from public.grant_application_use_with_edit(
'e8000000-0000-4000-8000-000000000001','links-operator@example.test','e8000000-0000-4000-8000-000000000040',
'links-outsider@example.test',array['form','list'],'own','own',false,'Read intake names',clock_timestamp()+interval '1 day');
-- A human name and phone for this recipient's own contact, plus real staff email.
update public.business_contacts set name='Current client'
where id=(select (r.values->>'client')::uuid from public.application_records r
  where r.work_id='e8000000-0000-4000-8000-000000000040' and r.record_id='w6-use');
create temp table label_result as select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',
(select id from label_grant),1) value;
select pg_temp.label_assert((select jsonb_array_length(value->'labels') from label_result)=2,'only own linked fields');
select pg_temp.label_assert((select count(*) from label_result, jsonb_array_elements(value->'labels') item
where item->>'recordId'='w6-use' and item->>'fieldId'='handler' and item->>'label'='Sam Rivera · sam@leslie.example.test')=1,'staff name and email');
select pg_temp.label_assert((select count(*) from label_result, jsonb_array_elements(value->'labels') item
where item->>'fieldId'='client' and item->>'label' like 'Current client · %')=1,'contact name and phone');
select pg_temp.label_assert((select value::text !~ 'Other client|Other Staff|Pat No Email|Former Staff|Brightline' from label_result),'no directory or foreign labels');
-- Wider record scope only reveals labels referenced in that wider record set.
update public.application_use_grants set record_read_scope='all',record_edit_scope='none' where id=(select id from label_grant);
delete from label_result;
insert into label_result select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1);
select pg_temp.label_assert((select exists(select 1 from jsonb_array_elements(value->'labels') item where item->>'recordId'='r1') from label_result),'all scope names another visible record');
update public.application_use_grants set record_read_scope='none' where id=(select id from label_grant);
select pg_temp.label_assert(public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1)->'labels'='[]'::jsonb,'no record read means no labels');
-- A field outside the granted view cannot be named, even on a visible record.
update public.application_releases set spec=jsonb_set(spec,'{components}',
'[{"kind":"form","fields":["business","client","handler","documents"]},{"kind":"list","fields":["business","client"]}]'::jsonb)
where work_id='e8000000-0000-4000-8000-000000000040' and version=1;
update public.application_use_grants set record_read_scope='own',views=array['list'] where id=(select id from label_grant);
delete from label_result;
insert into label_result select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1);
select pg_temp.label_assert((select jsonb_array_length(value->'labels')=1 and value::text not like '%Sam Rivera%' from label_result),'hidden staff field has no label');
-- The bound grant/release, identity, expiry and revocation are checked again.
select pg_temp.label_error($q$select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040','e8000000-0000-4000-8000-000000000099',1)$q$,'application_use_conflict');
select pg_temp.label_error($q$select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),2)$q$,'application_use_conflict');
select pg_temp.label_error($q$select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000004','links-other@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1)$q$,'application_use_denied');
update public.application_use_grants set expires_at=clock_timestamp()-interval '1 second' where id=(select id from label_grant);
select pg_temp.label_error($q$select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1)$q$,'application_use_denied');
update public.application_use_grants set expires_at=clock_timestamp()+interval '1 day',status='revoked',revoked_at=clock_timestamp() where id=(select id from label_grant);
select pg_temp.label_error($q$select public.read_internal_tool_use_link_labels(
'e8000000-0000-4000-8000-000000000003','links-outsider@example.test','e8000000-0000-4000-8000-000000000040',(select id from label_grant),1)$q$,'application_use_denied');
select pg_temp.label_assert(has_function_privilege('service_role','public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer)','execute')
and not has_function_privilege('authenticated','public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer)','execute')
and not has_function_privilege('anon','public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer)','execute')
and not has_function_privilege('public','public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer)','execute'),'service role only');
rollback;
