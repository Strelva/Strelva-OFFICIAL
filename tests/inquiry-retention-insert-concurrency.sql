\set ON_ERROR_STOP on
-- Run only inside the disposable retention-helper clone. A second real
-- connection inserts an event and holds the origin key-share lock until commit.
create extension if not exists dblink;
insert into public.tenants(id,site_name) values ('retention-event-race','Event race fixture');
select dblink_connect('retention_event_writer',format('host=%L port=%s dbname=%L user=%L',
  split_part(current_setting('unix_socket_directories'),',',1),current_setting('port'),current_database(),current_user));
select dblink_exec('retention_event_writer','begin');
select dblink_exec('retention_event_writer',$$insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail)
  select stable_id,'lead_concurrent_late_copy','delivery','system','{"status":"accepted","body":"Concurrent copy body"}'
  from public.tenants where id='retention-event-race'$$);
begin;
set local lock_timeout='200ms';
do $$ begin
  begin
    delete from public.tenants where id='retention-event-race';
    raise exception 'origin deletion bypassed concurrent event key-share lock';
  exception when lock_not_available then null;
  end;
end $$;
rollback;
select dblink_exec('retention_event_writer','commit');
select dblink_disconnect('retention_event_writer');
delete from public.tenants where id='retention-event-race';
do $$ begin
  if not exists(select 1 from public.inquiry_events where lead_id='lead_concurrent_late_copy'
    and retain_until between clock_timestamp()+interval '364 days' and clock_timestamp()+interval '366 days'
    and detail->>'status'='accepted' and detail->>'body'='Concurrent copy body') then
    raise exception 'origin deletion missed committed concurrent inquiry event';
  end if;
end $$;
