\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.effort_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business effort assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.effort_error(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'no error';
exception when others then
  return sqlerrm;
end; $$;

select pg_temp.effort_assert(
  not has_function_privilege('anon','public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_business_effort(uuid,text,date,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text)','EXECUTE')
  and has_function_privilege('service_role','public.void_business_effort(uuid,text,uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.read_effort_businesses(uuid,text)','EXECUTE')
  and not has_table_privilege('service_role','public.business_effort_entries','SELECT')
  and not has_table_privilege('service_role','public.business_effort_voids','INSERT')
  and (select relrowsecurity from pg_class where oid = 'public.business_effort_entries'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.business_effort_voids'::regclass),
  'only actor-checked server functions are exposed and RLS is enabled');

insert into public.users(id,email,verified_at) values
 ('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',now()),
 ('e9100000-0000-4000-8000-000000000002','effort-owner@example.test',now()),
 ('e9100000-0000-4000-8000-000000000003','effort-revoked@example.test',now()),
 ('e9100000-0000-4000-8000-000000000004','effort-unverified@example.test',null);
insert into public.super_admins(user_id,email) values
 ('e9100000-0000-4000-8000-000000000001','effort-operator@example.test'),
 ('e9100000-0000-4000-8000-000000000004','effort-unverified@example.test');
insert into public.super_admins(user_id,email,revoked_at) values
 ('e9100000-0000-4000-8000-000000000003','effort-revoked@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('e9100000-0000-4000-8000-000000000010','customer','Effort managed business','e9100000-0000-4000-8000-000000000002'),
 ('e9100000-0000-4000-8000-000000000011','customer','Effort self-serve business','e9100000-0000-4000-8000-000000000002'),
 ('e9100000-0000-4000-8000-000000000012','personal','Effort personal work','e9100000-0000-4000-8000-000000000002'),
 ('e9100000-0000-4000-8000-000000000013','customer','Effort deleted business','e9100000-0000-4000-8000-000000000002');
insert into public.tenants(id,site_name,active) values ('effort-managed-site','Effort managed site',true);
insert into public.offering_website_bindings(id,business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
select 'e9100000-0000-4000-8000-000000000020','e9100000-0000-4000-8000-000000000010',stable_id,id,site_name,'effort-test-binding',repeat('e',64),
 'e9100000-0000-4000-8000-000000000002','e9100000-0000-4000-8000-000000000002' from public.tenants where id='effort-managed-site';

-- A zero log is an explicit measurement with normal identity, retry and void history.
select public.record_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-000000000030','e9100000-0000-4000-8000-000000000010',0,'other',
 (now() at time zone 'utc')::date,'No human work this month');
select pg_temp.effort_assert((public.record_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-000000000030','e9100000-0000-4000-8000-000000000010',0,'other',
 (now() at time zone 'utc')::date,'No human work this month')->>'minutes')::int = 0,'zero retry keeps the explicit measurement');
select pg_temp.effort_assert((select count(*) from public.business_effort_entries where id='e9100000-0000-4000-8000-000000000030')=1,'zero retry cannot duplicate');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000002','effort-owner@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',0,'other',(now() at time zone 'utc')::date,null)$q$)='business_effort_access_denied','zero logging still requires operator authority');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',-1,'other',(now() at time zone 'utc')::date,null)$q$)='business_effort_invalid','negative minutes still rejected');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000030',
 'e9100000-0000-4000-8000-000000000010',1,'other',(now() at time zone 'utc')::date,'No human work this month')$q$)='business_effort_conflict','changing zero to work under the same id conflicts');

create temporary table effort_businesses(value jsonb);
insert into effort_businesses select public.read_effort_businesses('e9100000-0000-4000-8000-000000000001','effort-operator@example.test');
select pg_temp.effort_assert((select item->>'firstEffortOn' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000010')
 =(now() at time zone 'utc')::date::text,'zero counts as first log');
select pg_temp.effort_assert((select item->'firstEffortOn' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000011')='null'::jsonb,'never logged business is retained without a fake zero');
select pg_temp.effort_assert((select item->'tenantIds' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000010')='["effort-managed-site"]'::jsonb,'managed bindings retained');
select public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000030','Wrong business');
select pg_temp.effort_assert((select item->'firstEffortOn' from jsonb_array_elements(public.read_effort_businesses('e9100000-0000-4000-8000-000000000001','effort-operator@example.test')) item
 where item->>'id'='e9100000-0000-4000-8000-000000000010')='null'::jsonb,'voided zero no longer provides coverage');

-- Cross both historical caps: every customer and every entry in the window is read.
insert into public.workspaces(id,kind,name,created_by)
select ('e9200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'customer','Coverage business '||n,'e9100000-0000-4000-8000-000000000002'
from generate_series(1,501) n;
select pg_temp.effort_assert((select count(*) from jsonb_array_elements(public.read_effort_businesses('e9100000-0000-4000-8000-000000000001','effort-operator@example.test')) item
 where item->>'id' like 'e9200000-%')=501,'business read never silently caps the denominator at 500');
insert into public.business_effort_entries(id,business_workspace_id,minutes,category,occurred_on,recorded_by)
select ('e9300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'e9100000-0000-4000-8000-000000000010',1,'support',
 (now() at time zone 'utc')::date - case when n=10001 then 40 else 0 end,'e9100000-0000-4000-8000-000000000001'
from generate_series(1,10001) n;
select pg_temp.effort_assert(jsonb_array_length(public.read_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 (now() at time zone 'utc')::date - 60,'e9100000-0000-4000-8000-000000000010'))=10002,'window read includes old entries beyond the 10000 cap and void history');
select pg_temp.effort_assert(jsonb_array_length(public.read_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 (now() at time zone 'utc')::date,null))=10001,'from date is still respected');
select pg_temp.effort_assert(jsonb_array_length(public.read_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 (now() at time zone 'utc')::date - 60,'e9100000-0000-4000-8000-000000000011'))=0,'business filter still respected');
rollback;
