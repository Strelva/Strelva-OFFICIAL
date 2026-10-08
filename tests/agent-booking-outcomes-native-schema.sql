\set ON_ERROR_STOP on

-- This script runs only inside a disposable clone of the SQL contract database.
-- Commit fixtures between the literal read-only service-role checks so each
-- identity view sees the state a real server reader would see.
begin;
insert into public.users(id,email,verified_at)
values ('ab272100-0000-4000-8000-000000000003','outcomes-native-owner@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by)
values ('ab272100-0000-4000-8000-000000000001','customer','Native Outcomes Fixture','ab272100-0000-4000-8000-000000000003');
insert into public.tenants(id,stable_id,site_name,active)
values ('outcomes-native-site','ab272100-0000-4000-8000-000000000002','Hosted Outcomes Fixture',true);
insert into public.booking_settings(calendar_key,workspace_id,mode,buffer_minutes,min_notice_minutes,recorded_via)
values ('ab272100-0000-4000-8000-000000000001','ab272100-0000-4000-8000-000000000001','request',0,0,'native');
insert into public.business_bookings(id,calendar_key,workspace_id,legacy_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via,created_at)
values
 ('ab272100-0000-4000-8000-000000000010','ab272100-0000-4000-8000-000000000001','ab272100-0000-4000-8000-000000000001','outcomes-native-request','held','agent','Consultation',clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 30 minutes',clock_timestamp()+interval '4 days 30 minutes','UTC','Fixture Customer','customer@example.test','native',clock_timestamp()),
 ('ab272100-0000-4000-8000-000000000012','ab272100-0000-4000-8000-000000000001','ab272100-0000-4000-8000-000000000001','outcomes-native-owner-only','confirmed','agent','Consultation',clock_timestamp()+interval '6 days',clock_timestamp()+interval '6 days 30 minutes',clock_timestamp()+interval '6 days 30 minutes','UTC','Fixture Customer','customer@example.test','backfill',clock_timestamp());
insert into public.business_booking_access(booking_id,manage_hash,manage_ciphertext,confirm_hash,confirm_ciphertext,confirm_until)
values ('ab272100-0000-4000-8000-000000000010',repeat('1',64),'enc:v1:fixture-manage',repeat('a',64),'enc:v1:fixture-confirm',clock_timestamp()+interval '15 minutes');
insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
values ('ab272100-0000-4000-8000-000000000012','owner','held','confirmed','Owner-confirmed historical agent row without customer receipt');
select public.record_agent_business_discovery(array['workspace:ab272100-0000-4000-8000-000000000001']);
select public.confirm_agent_booking(repeat('a',64),false);
select public.confirm_agent_booking(repeat('a',64),false);
select public.set_tenant_booking_status('workspace:ab272100-0000-4000-8000-000000000001','outcomes-native-request','confirmed','owner','Owner later confirms the request');
commit;

set role service_role;
begin read only;
do $$
declare
  v_from timestamptz := date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_result jsonb;
begin
  v_result := public.read_agent_booking_outcomes('workspace:ab272100-0000-4000-8000-000000000001',v_from,v_from+interval '1 day');
  if (v_result->>'holds')::int <> 2 or (v_result->>'confirmations')::int <> 1 or (v_result->>'discoveryCalls')::int <> 1 then
    raise exception 'native request confirmation proof mismatch: %',v_result;
  end if;
  v_result := public.read_agent_booking_outcomes('workspace:ab272100-0000-4000-8000-000000000001',v_from+interval '1 day',v_from+interval '2 days');
  if (v_result->>'confirmations')::int <> 0 then
    raise exception 'confirmation escaped its requested reporting window: %',v_result;
  end if;
end $$;
commit;
reset role;

begin;
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
values ('ab272100-0000-4000-8000-000000000002','outcomes-native-site','ab272100-0000-4000-8000-000000000001','ab272100-0000-4000-8000-000000000003','ab272100-0000-4000-8000-000000000004',repeat('c',64),'{}');
insert into public.booking_settings(calendar_key,tenant_stable_id,workspace_id,mode,buffer_minutes,min_notice_minutes,recorded_via)
values ('ab272100-0000-4000-8000-000000000002','ab272100-0000-4000-8000-000000000002','ab272100-0000-4000-8000-000000000001','instant',0,0,'native');
insert into public.business_bookings(id,calendar_key,tenant_stable_id,workspace_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via,created_at)
values ('ab272100-0000-4000-8000-000000000011','ab272100-0000-4000-8000-000000000002','ab272100-0000-4000-8000-000000000002','ab272100-0000-4000-8000-000000000001','held','agent','Consultation',clock_timestamp()+interval '5 days',clock_timestamp()+interval '5 days 30 minutes',clock_timestamp()+interval '5 days 30 minutes','UTC','Fixture Customer','customer@example.test','native',clock_timestamp());
insert into public.business_booking_access(booking_id,manage_hash,manage_ciphertext,confirm_hash,confirm_ciphertext,confirm_until)
values ('ab272100-0000-4000-8000-000000000011',repeat('2',64),'enc:v1:fixture-manage',repeat('b',64),'enc:v1:fixture-confirm',clock_timestamp()+interval '15 minutes');
select public.record_agent_business_discovery(array['outcomes-native-site']);
select public.confirm_agent_booking(repeat('b',64),false);
commit;

set role service_role;
begin read only;
do $$
declare
  v_from timestamptz := date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_result jsonb;
begin
  v_result := public.read_agent_booking_outcomes('outcomes-native-site',v_from,v_from+interval '1 day');
  if (v_result->>'holds')::int <> 3 or (v_result->>'confirmations')::int <> 2 or (v_result->>'discoveryCalls')::int <> 2 then
    raise exception 'linked hosted outcomes did not include both historical calendars: %',v_result;
  end if;
  v_result := public.read_agent_booking_outcomes('workspace:ab272100-0000-4000-8000-000000000001',v_from,v_from+interval '1 day');
  if (v_result->>'holds')::int <> 2 or (v_result->>'confirmations')::int <> 1 or (v_result->>'discoveryCalls')::int <> 1 then
    raise exception 'native workspace outcome scope changed after hosted link: %',v_result;
  end if;
end $$;
commit;
reset role;
