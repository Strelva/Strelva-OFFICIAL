\set ON_ERROR_STOP on
-- Root-owned disposable native cluster only; every fictional row rolls back.
begin;
create function pg_temp.bs_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'booking settings primary assertion: %',message; end if; end $$;
create function pg_temp.bs_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm=expected then return; end if; raise; end;
  raise exception 'expected failure %',expected;
end $$;
create function pg_temp.bs_config() returns jsonb language sql as $$
select '{"bufferMinutes":10,"minNoticeMinutes":1440,"maxAdvanceDays":60,"defaultLengthMinutes":45,"timezone":"America/New_York","bookableHours":[{"day":5,"opens":"10:00","closes":"16:00"}],"legacyRequiresPayment":false}'::jsonb
$$;
insert into public.tenants(id,stable_id,site_name,active) values
 ('bs-primary','ed182000-0000-4000-8000-000000000001','Fictional primary settings',true),
 ('bs-foreign','ed182000-0000-4000-8000-000000000002','Fictional other settings',true),
 ('bs-empty','ed182000-0000-4000-8000-000000000003','Fictional no settings',true);
select public.upsert_tenant_booking_settings('bs-primary',pg_temp.bs_config()||'{"mode":"request","maxPerDay":4,"defaultLengthMinutes":60,"bufferMinutes":15,"bookableOverrides":[{"date":"2026-12-25","closed":true}]}','native');
select public.upsert_tenant_booking_settings('bs-foreign',pg_temp.bs_config()||'{"mode":"request","maxPerDay":2}','native');
create temporary table bs_before as select calendar_key,to_jsonb(s) row from public.booking_settings s
 where calendar_key in ('ed182000-0000-4000-8000-000000000001','ed182000-0000-4000-8000-000000000002');

-- Reproduce the old provenance false acknowledgement on real SQL.
select pg_temp.bs_assert(public.upsert_tenant_booking_settings('bs-primary',pg_temp.bs_config(),'dual_write')->>'status'='updated','old mirror acknowledges');
select pg_temp.bs_assert((select default_length_minutes=60 and buffer_minutes=15 from public.booking_settings where calendar_key='ed182000-0000-4000-8000-000000000001'),'old mirror preserves values despite acknowledgement');

select pg_temp.bs_assert(not has_function_privilege('anon','public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)','execute')
 and not has_function_privilege('authenticated','public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)','execute')
 and has_function_privilege('service_role','public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)','execute'),'service-only RPC ACL');
select pg_temp.bs_assert(not has_table_privilege('service_role','public.booking_settings','update'),'no direct service-role table mutation');
set local role anon;
do $$ begin
  begin perform public.write_tenant_booking_settings_fields('bs-primary','config','{}','{}');
  exception when insufficient_privilege then return; end;
  raise exception 'anonymous RPC unexpectedly admitted';
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform public.write_tenant_booking_settings_fields('bs-primary','config','{}','{}');
  exception when insufficient_privilege then return; end;
  raise exception 'authenticated RPC unexpectedly admitted';
end $$;
reset role;
set local role service_role;
select pg_temp.bs_assert(public.write_tenant_booking_settings_fields('bs-primary','config',pg_temp.bs_config(),pg_temp.bs_config())->>'status'='updated','primary native config acknowledges');
reset role;
select pg_temp.bs_assert((select default_length_minutes=45 and buffer_minutes=10 and mode='request' and max_per_day=4 and recorded_via='native'
 and bookable_overrides='[{"date":"2026-12-25","closed":true}]'::jsonb from public.booking_settings where calendar_key='ed182000-0000-4000-8000-000000000001'),'native config actually saved, policy/companion preserved');
select pg_temp.bs_assert((select to_jsonb(s)-array['buffer_minutes','min_notice_minutes','max_advance_days','default_length_minutes','timezone','bookable_hours','legacy_requires_payment','revision','updated_at'] = b.row-array['buffer_minutes','min_notice_minutes','max_advance_days','default_length_minutes','timezone','bookable_hours','legacy_requires_payment','revision','updated_at']
 from public.booking_settings s join bs_before b using(calendar_key) where s.calendar_key='ed182000-0000-4000-8000-000000000001'),'all unselected columns unchanged');
create temporary table bs_config_saved as select to_jsonb(s) row from public.booking_settings s where calendar_key='ed182000-0000-4000-8000-000000000001';
set local role service_role;
select public.write_tenant_booking_settings_fields('bs-primary','overrides','{"bookableOverrides":[{"date":"2026-12-31","closed":true}]}',pg_temp.bs_config());
reset role;
select pg_temp.bs_assert((select to_jsonb(s)-array['bookable_overrides','revision','updated_at']=(select row-array['bookable_overrides','revision','updated_at'] from bs_config_saved)
 and bookable_overrides='[{"date":"2026-12-31","closed":true}]'::jsonb from public.booking_settings s where calendar_key='ed182000-0000-4000-8000-000000000001'),'override primary keeps latest config and all native policy');
select pg_temp.bs_assert((select to_jsonb(s)=b.row from public.booking_settings s join bs_before b using(calendar_key) where s.calendar_key='ed182000-0000-4000-8000-000000000002'),'other tenant untouched');

-- Unknown scope and forbidden native-policy fields never mutate the row.
create temporary table bs_after as select to_jsonb(s) row from public.booking_settings s where calendar_key='ed182000-0000-4000-8000-000000000001';
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('no-such-owner','config',pg_temp.bs_config(),pg_temp.bs_config())$q$,'booking_unknown_tenant');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','config',pg_temp.bs_config()||'{"mode":"instant"}',pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','overrides','{"bookableOverrides":[],"maxPerDay":null}',pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','config',pg_temp.bs_config()||'{"bufferMinutes":999}',pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','config',pg_temp.bs_config()||'{"bufferMinutes":"10"}',pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','config',null,pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','overrides','{"bookableOverrides":null}',pg_temp.bs_config())$q$,'booking_invalid');
select pg_temp.bs_expect($q$select public.write_tenant_booking_settings_fields('bs-primary','overrides','{"bookableOverrides":[]}',pg_temp.bs_config()||'{"mode":"instant"}')$q$,'booking_invalid');
select pg_temp.bs_assert((select to_jsonb(s)=(select row from bs_after) from public.booking_settings s where calendar_key='ed182000-0000-4000-8000-000000000001'),'invalid attempts have no revision or data mutation');

-- First override save uses producer-provided legacy defaults only at INSERT.
set local role service_role;
select pg_temp.bs_assert(public.write_tenant_booking_settings_fields('bs-empty','overrides','{"bookableOverrides":[]}',pg_temp.bs_config())->>'status'='recorded','absent row inserted');
reset role;
select pg_temp.bs_assert((select default_length_minutes=45 and min_notice_minutes=1440 and mode='instant' and max_per_day is null and recorded_via='native' and bookable_overrides='[]'::jsonb
 from public.booking_settings where calendar_key='ed182000-0000-4000-8000-000000000003'),'insert defaults honored');
rollback;
