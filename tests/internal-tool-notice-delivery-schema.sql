\set ON_ERROR_STOP on
begin;
create function pg_temp.nd_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'notice assertion: %',message; end if; end; $$;
create temp table nd_lease as select public.lease_internal_tool_notice(
  (select id from public.internal_tool_notices where record_id='w6-assigned'),
  'e8000000-0000-4000-8000-000000000010','{"subject":"Original transport"}') value;
select pg_temp.nd_assert((select value->>'lease' is not null from nd_lease),'first transport leased');
select pg_temp.nd_assert(public.lease_internal_tool_notice((select (value->>'noticeId')::uuid from nd_lease),
  'e8000000-0000-4000-8000-000000000010','{"subject":"Changed transport"}') is null,'concurrent sender refused');
select pg_temp.nd_assert(not public.finish_internal_tool_notice_delivery((select (value->>'noticeId')::uuid from nd_lease),
  'e8000000-0000-4000-8000-000000000010',gen_random_uuid(),'sent','fake'),'another lease cannot finish');
select public.finish_internal_tool_notice_delivery((select (value->>'noticeId')::uuid from nd_lease),
  'e8000000-0000-4000-8000-000000000010',(select (value->>'lease')::uuid from nd_lease),'failed',null);
update public.internal_tool_notices set updated_at=clock_timestamp()-interval '6 minutes' where record_id='w6-assigned';
select pg_temp.nd_assert(jsonb_array_length(public.list_internal_tool_notice_retries())=1,'known failure due');
update nd_lease set value=public.lease_internal_tool_notice((value->>'noticeId')::uuid,
  'e8000000-0000-4000-8000-000000000010','{"subject":"Changed transport"}');
select pg_temp.nd_assert((select value->'delivery'->>'subject'='Original transport' from nd_lease),'retry transport frozen');
select public.finish_internal_tool_notice_delivery((select (value->>'noticeId')::uuid from nd_lease),
  'e8000000-0000-4000-8000-000000000010',(select (value->>'lease')::uuid from nd_lease),'sent','provider-1');
select pg_temp.nd_assert(public.lease_internal_tool_notice((select (value->>'noticeId')::uuid from nd_lease),
  'e8000000-0000-4000-8000-000000000010',null) is null,'accepted send cannot be replayed');
select pg_temp.nd_assert(jsonb_array_length(public.list_internal_tool_notice_retries())=0,'accepted send absent from retries');
-- An unknown outcome (process died after provider acceptance) stays pending.
select public.lease_internal_tool_notice((select id from public.internal_tool_notices where record_id='w6-owner'),
  'e8000000-0000-4000-8000-000000000010','{"subject":"Unknown outcome"}');
update public.internal_tool_notices set updated_at=clock_timestamp()-interval '20 minutes',delivery_lease_until=clock_timestamp()-interval '15 minutes' where record_id='w6-owner';
select pg_temp.nd_assert(public.lease_internal_tool_notice((select id from public.internal_tool_notices where record_id='w6-owner'),
  'e8000000-0000-4000-8000-000000000010',null) is null,'expired lease with unknown outcome must not resend');
select pg_temp.nd_assert(jsonb_array_length(public.read_catalog_tool_notice_failures('e8000000-0000-4000-8000-000000000001','links-operator@example.test'))>=1,'unknown outcome reaches operator');
select pg_temp.nd_assert(jsonb_array_length(public.read_catalog_tool_notices('e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002','links-staff@example.test',clock_timestamp()-interval '1 day'))>=2,'member sees handled receipts');
select pg_temp.nd_assert(not has_function_privilege('authenticated','public.lease_internal_tool_notice(uuid,uuid,jsonb)','execute'),'browser cannot lease sender');
rollback;
