\set ON_ERROR_STOP on
begin;
create function pg_temp.abo_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agent booking outcomes assertion failed: %', message; end if; end $$;
create function pg_temp.abo_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm <> expected then raise exception 'expected %, got %', expected, sqlerrm; end if; return; end;
  raise exception 'expected %, succeeded: %', expected, statement;
end $$;

insert into public.tenants(id, stable_id, site_name) values
  ('outcome-site', 'ab272000-0000-4000-8000-000000000001', 'Outcome Fixture'),
  ('other-outcome-site', 'ab272000-0000-4000-8000-000000000002', 'Other Outcome Fixture');
insert into public.business_bookings(id,calendar_key,tenant_stable_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,intake_answers,recorded_via,created_at)
values
  ('ab272000-0000-4000-8000-000000000011','ab272000-0000-4000-8000-000000000001','ab272000-0000-4000-8000-000000000001','completed','agent','Consultation',now()+interval '3 days',now()+interval '3 days 30 minutes',now()+interval '3 days 30 minutes','UTC','Private Customer','private@example.test','{}','native',clock_timestamp()),
  ('ab272000-0000-4000-8000-000000000012','ab272000-0000-4000-8000-000000000001','ab272000-0000-4000-8000-000000000001','held','agent','Consultation',now()+interval '4 days',now()+interval '4 days 30 minutes',now()+interval '4 days 30 minutes','UTC','Another Private Customer','other-private@example.test','{}','native',clock_timestamp());
insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason,at) values
  ('ab272000-0000-4000-8000-000000000011','visitor','held','confirmed','customer email confirmed',clock_timestamp()),
  ('ab272000-0000-4000-8000-000000000011','visitor','held','confirmed','duplicate confirmation replay',clock_timestamp()),
  ('ab272000-0000-4000-8000-000000000011','owner','confirmed','completed','completed by owner',clock_timestamp());
select pg_temp.abo_assert(public.record_agent_business_discovery(array['outcome-site'])=1,'one returned business increments one aggregate');
select pg_temp.abo_assert(public.record_agent_business_discovery(array['outcome-site'])=1,'a later search is counted separately');
select pg_temp.abo_assert(
  public.read_agent_booking_outcomes('outcome-site',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC')
    = jsonb_build_object('businessName','Outcome Fixture','discoveryCalls',2,'discoveryCoverage','complete','discoverySince',(now() at time zone 'UTC')::date,'holds',2,'confirmations',1,'completed',1),
  'business-scoped outcomes dedupe booking transitions and include the business name');
select pg_temp.abo_assert(
  public.read_agent_booking_outcomes('other-outcome-site',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC')
    = jsonb_build_object('businessName','Other Outcome Fixture','discoveryCalls',0,'discoveryCoverage','unknown','discoverySince',null,'holds',0,'confirmations',0,'completed',0),
  'outcomes do not cross business boundaries and an unmeasured period does not claim zero discovery');
select pg_temp.abo_assert(
  public.read_agent_booking_outcomes('outcome-site',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC')::text not like '%private@example.test%',
  'weekly proof does not expose contact data');
select pg_temp.abo_assert(not has_table_privilege('anon','public.agent_business_discovery_days','SELECT')
  and not has_table_privilege('authenticated','public.agent_business_discovery_days','SELECT')
  and not has_function_privilege('anon','public.read_agent_booking_outcomes(text,timestamptz,timestamptz)','EXECUTE'),
  'aggregates and outcome reads are server-only');
select pg_temp.abo_expect($q$select public.read_agent_booking_outcomes('outcome-site',now()-interval '10 days',now())$q$,'booking_invalid');
rollback;
