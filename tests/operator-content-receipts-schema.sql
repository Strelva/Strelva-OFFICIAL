\set ON_ERROR_STOP on
begin;
create function pg_temp.content_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'Content receipt assertion failed: %', message; end if; end;
$$;
select pg_temp.content_assert(
  has_function_privilege('service_role','public.write_operator_content(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.write_operator_content(text,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.write_operator_content(text,text,jsonb)','EXECUTE'),
  'service-role-only mutation');
insert into public.tenants(id,site_name,active,stable_id) values
  ('content-receipt-fixture','Fictional content business',true,'aa612000-0000-4000-8000-000000000001');
insert into public.content(tenant_id,section,data) values ('content-receipt-fixture','hero','{"headline":"Before"}');

do $$
declare receipt jsonb; failed boolean := false; large jsonb;
begin
  receipt := public.write_operator_content('content-receipt-fixture','hero','{"headline":"After"}');
  perform pg_temp.content_assert(receipt->>'acceptance'='accepted' and receipt->>'readback'='pending','acceptance commits before readback');
  perform pg_temp.content_assert(receipt->'beforeState'='{"headline":"Before"}'::jsonb,'prior content retained');
  perform pg_temp.content_assert((select data from public.content where tenant_id='content-receipt-fixture' and section='hero')='{"headline":"After"}'::jsonb,'authoritative content published');
  receipt := public.record_outside_write_readback((receipt->>'id')::uuid,'failed','Fixture readback unavailable; publication remains accepted.');
  perform pg_temp.content_assert(receipt->>'acceptance'='accepted' and receipt->>'readback'='failed','readback failure never reverses acceptance');
  begin perform public.write_operator_content('missing-content-fixture','hero','{}'); exception when others then failed := true; end;
  perform pg_temp.content_assert(failed,'unknown tenant cannot publish');
  failed := false;
  begin perform public.write_operator_content('content-receipt-fixture','hero','[]'); exception when others then failed := true; end;
  perform pg_temp.content_assert(failed,'malformed content cannot publish');
  large := jsonb_build_object('headline',repeat('x',20000));
  receipt := public.write_operator_content('content-receipt-fixture','hero',large);
  receipt := public.write_operator_content('content-receipt-fixture','hero','{"headline":"Small again"}');
  perform pg_temp.content_assert(receipt->'beforeState'->>'snapshotOmitted' is not null
    and receipt->'beforeState'->>'contentHash'=md5(large::text),'large prior sections explicitly retain hash instead of claiming a full snapshot');
end;
$$;

-- Receipt insertion failure must roll back the authoritative content update.
create function pg_temp.refuse_content_receipt() returns trigger language plpgsql as $$
begin if new.tenant_id='content-receipt-fixture' then raise exception 'fixture receipt rejection'; end if; return new; end;
$$;
create trigger fixture_refuse_content_receipt before insert on public.outside_write_receipts
  for each row execute function pg_temp.refuse_content_receipt();
do $$
declare failed boolean := false; count_before integer;
begin
  select count(*) into count_before from public.outside_write_receipts where tenant_id='content-receipt-fixture';
  begin perform public.write_operator_content('content-receipt-fixture','hero','{"headline":"Must never land"}');
  exception when others then failed := true; end;
  perform pg_temp.content_assert(failed,'receipt storage failure rejects publication');
  perform pg_temp.content_assert((select data from public.content where tenant_id='content-receipt-fixture' and section='hero')='{"headline":"Small again"}'::jsonb,'receipt failure rolls content back');
  perform pg_temp.content_assert((select count(*) from public.outside_write_receipts where tenant_id='content-receipt-fixture')=count_before,'receipt failure leaves no partial receipt');
end;
$$;
rollback;
