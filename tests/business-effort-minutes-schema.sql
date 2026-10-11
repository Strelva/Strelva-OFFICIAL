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

-- Record, then retry the same command after a lost response.
create temporary table effort_first(value jsonb);
insert into effort_first select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','Effort-Operator@example.test','e9100000-0000-4000-8000-000000000030',
 'e9100000-0000-4000-8000-000000000010',45,'delivery',((now() at time zone 'utc')::date - 40),'  Launch checklist  ');
select pg_temp.effort_assert((select value->>'minutes' from effort_first)='45'
 and (select value->>'note' from effort_first)='Launch checklist'
 and (select value->>'recordedBy' from effort_first)='e9100000-0000-4000-8000-000000000001'
 and (select value->'void' from effort_first)='null'::jsonb,'entry records minutes, trimmed note and verified operator');
select pg_temp.effort_assert(public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000030',
 'e9100000-0000-4000-8000-000000000010',45,'delivery',((now() at time zone 'utc')::date - 40),'Launch checklist')
 = (select value from effort_first),'identical retry returns the original entry');
select pg_temp.effort_assert((select count(*) from public.business_effort_entries where id='e9100000-0000-4000-8000-000000000030')=1,'retry does not duplicate');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000030',
 'e9100000-0000-4000-8000-000000000010',50,'delivery',((now() at time zone 'utc')::date - 40),'Launch checklist')$q$)
 ='business_effort_conflict','a changed retry under the same id is rejected');

-- Authority.
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000002','effort-owner@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_access_denied','business owner without super-admin is denied');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000003','effort-revoked@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_access_denied','revoked super-admin is denied');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000004','effort-unverified@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_access_denied','unverified super-admin is denied');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','someone-else@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_access_denied','mismatched verified email is denied');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.read_effort_businesses(
 'e9100000-0000-4000-8000-000000000002','effort-owner@example.test')$q$)
 ='business_effort_access_denied','reads require super-admin too');

-- Validation and business identity.
select pg_temp.effort_assert(pg_temp.effort_error(format($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000010',%s,%L,%L::date,%L)$q$, v.minutes, v.category, v.occurred_on, v.note))
 ='business_effort_invalid', 'invalid input: ' || v.label)
from (values
 (-1,'support',(now() at time zone 'utc')::date,null::text,'negative minutes'),
 (1441,'support',(now() at time zone 'utc')::date,null,'more than a day'),
 (10,'build',(now() at time zone 'utc')::date,null,'unknown category'),
 (10,'support',(now() at time zone 'utc')::date + 1,null,'future date'),
 (10,'support',date '2019-12-31',null,'too old'),
 (10,'support',(now() at time zone 'utc')::date,repeat('x',281),'long note'),
 (10,'support',(now() at time zone 'utc')::date,'   ','blank note')
) as v(minutes,category,occurred_on,note,label);
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-000000000012',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_business_not_found','a personal workspace is not a business');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.record_business_effort(
 'e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000031',
 'e9100000-0000-4000-8000-0000000000ff',10,'support',(now() at time zone 'utc')::date,null)$q$)
 ='business_effort_business_not_found','an unknown business is rejected');

-- Append-only.
select pg_temp.effort_assert(pg_temp.effort_error($q$update public.business_effort_entries set minutes=1 where id='e9100000-0000-4000-8000-000000000030'$q$)
 ='business_effort_append_only','entries cannot be edited');
select pg_temp.effort_assert(pg_temp.effort_error($q$delete from public.business_effort_entries where id='e9100000-0000-4000-8000-000000000030'$q$)
 ='business_effort_append_only','entries cannot be deleted directly');

-- Correction by void.
select public.record_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000032',
 'e9100000-0000-4000-8000-000000000010',30,'support',((now() at time zone 'utc')::date - 90),null);
select pg_temp.effort_assert((public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-000000000032','Logged against the wrong business')->'void'->>'reason')='Logged against the wrong business','void records the reason');
select pg_temp.effort_assert((public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-000000000032',' Logged against the wrong business ')->'void'->>'voidedBy')='e9100000-0000-4000-8000-000000000001','identical void retry is accepted');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-000000000032','Another reason')$q$)='business_effort_conflict','a second different void is rejected');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 'e9100000-0000-4000-8000-0000000000fe','Missing')$q$)='business_effort_entry_not_found','unknown entry cannot be voided');
select pg_temp.effort_assert(pg_temp.effort_error($q$select public.void_business_effort('e9100000-0000-4000-8000-000000000002','effort-owner@example.test',
 'e9100000-0000-4000-8000-000000000030','Not mine')$q$)='business_effort_access_denied','non-admin cannot void');
select pg_temp.effort_assert(pg_temp.effort_error($q$delete from public.business_effort_voids where entry_id='e9100000-0000-4000-8000-000000000032'$q$)
 ='business_effort_append_only','voids cannot be removed');
select pg_temp.effort_assert((select count(*) from public.business_effort_entries where id='e9100000-0000-4000-8000-000000000032')=1,'voided entry is retained');

-- Reads.
create temporary table effort_businesses(value jsonb);
insert into effort_businesses select public.read_effort_businesses('e9100000-0000-4000-8000-000000000001','effort-operator@example.test');
select pg_temp.effort_assert((select item->'tenantIds' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000010')
 ='["effort-managed-site"]'::jsonb,'managed site is found through its active binding');
select pg_temp.effort_assert((select item->>'firstEffortOn' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000010')
 =((now() at time zone 'utc')::date - 40)::text,'first effort date ignores the voided older entry');
select pg_temp.effort_assert((select item->'firstEffortOn' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000011')
 ='null'::jsonb and (select item->'tenantIds' from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000011')='[]'::jsonb,
 'self-serve business without a website is measurable');
select pg_temp.effort_assert(not exists(select 1 from effort_businesses, jsonb_array_elements(value) item where item->>'id'='e9100000-0000-4000-8000-000000000012'),'personal workspaces are excluded');
select pg_temp.effort_assert(jsonb_array_length(public.read_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 ((now() at time zone 'utc')::date - 365),'e9100000-0000-4000-8000-000000000010'))=2,'window read returns entries including voided ones');
select pg_temp.effort_assert(jsonb_array_length(public.read_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test',
 ((now() at time zone 'utc')::date - 60),null))=1,'window excludes older entries');

-- Deleting a business follows its retention and cascades its effort history.
select public.record_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000033',
 'e9100000-0000-4000-8000-000000000013',15,'other',(now() at time zone 'utc')::date,null);
select public.void_business_effort('e9100000-0000-4000-8000-000000000001','effort-operator@example.test','e9100000-0000-4000-8000-000000000033','Test');
delete from public.workspaces where id='e9100000-0000-4000-8000-000000000013';
select pg_temp.effort_assert(not exists(select 1 from public.business_effort_entries where id='e9100000-0000-4000-8000-000000000033')
 and not exists(select 1 from public.business_effort_voids where entry_id='e9100000-0000-4000-8000-000000000033'),'business deletion cascades effort');
rollback;
