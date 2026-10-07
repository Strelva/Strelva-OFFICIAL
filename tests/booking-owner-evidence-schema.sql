\set ON_ERROR_STOP on
-- Local fixture authority, bounds, evidence and no-show transition proof. Rolls back.
begin;
create or replace function pg_temp.oe_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking owner evidence assertion failed: %',message; end if; end $$;
create or replace function pg_temp.oe_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
create table if not exists public.bookings (
 id text primary key, tenant_id text not null references public.tenants(id), status text not null,
 service_id text not null, service_name text not null, date date not null, start_time text not null, end_time text not null,
 client_name text not null,client_email text not null,client_phone text not null,notes text,created_at timestamptz not null default now(),cancelled_at timestamptz
);
insert into public.users(id,email,verified_at) values
 ('ce000000-0000-4000-8000-000000000001','owner-evidence@example.test',now()),
 ('ce000000-0000-4000-8000-000000000002','outsider-evidence@example.test',now());
insert into public.super_admins(user_id,email) values('ce000000-0000-4000-8000-000000000001','owner-evidence@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
 ('oe-site','ce000000-0000-4000-8000-000000000011','Owner Fixture',true),
 ('oe-other','ce000000-0000-4000-8000-000000000012','Other Fixture',true);
create temporary table oe_workspace(id uuid) on commit drop;
insert into oe_workspace select (public.convert_tenant_to_business('owner-evidence@example.test','oe-site',
 '{"tenantId":"oe-site","tenantStableId":"ce000000-0000-4000-8000-000000000011","workspaceName":"Owner Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
 'ce000000-0000-4000-8000-000000000021',repeat('b',64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'ce000000-0000-4000-8000-000000000001','owner','ce000000-0000-4000-8000-000000000001' from oe_workspace on conflict do nothing;
create function pg_temp.oe_read() returns jsonb language sql as $$
 select public.read_workspace_booking_evidence((select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-site',(now() at time zone 'UTC')::date,(now() at time zone 'UTC')::date+1)
$$;
select public.record_tenant_booking('oe-site',jsonb_build_object('legacyId','oe-past','status','confirmed','origin','site','serviceName','Consultation',
 'start',date_trunc('day',now()),'end',date_trunc('day',now())+interval '1 minute','timeZone','UTC','bufferMinutes',0,'customer',jsonb_build_object('name','Past Customer')),'native');
select public.record_tenant_booking('oe-site',jsonb_build_object('legacyId','oe-future','status','confirmed','origin','site','serviceName','Consultation',
 'start',now()+interval '1 day','end',now()+interval '1 day 30 minutes','timeZone','UTC','bufferMinutes',0,'customer',jsonb_build_object('name','Future Customer')),'native');
select pg_temp.oe_assert(jsonb_array_length(pg_temp.oe_read()->'bookings')=2,'range reads real bookings');
select pg_temp.oe_assert(pg_temp.oe_read()->>'calendarHealth'='not_connected','optional calendar is truthful');
select pg_temp.oe_assert(jsonb_array_length(pg_temp.oe_read()#>'{bookings,0,history}')=1,'creation history included');
select pg_temp.oe_assert(not (pg_temp.oe_read()::text like '%ciphertext%' or pg_temp.oe_read()::text like '%manageHash%'),'no secret authority in owner projection');
select pg_temp.oe_expect(format('select public.read_workspace_booking_evidence(%L,%L,%L,%L,current_date,current_date)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000002','outsider-evidence@example.test','oe-site'),'workspace_access_denied');
select pg_temp.oe_expect(format('select public.read_workspace_booking_evidence(%L,%L,%L,%L,current_date,current_date)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','wrong@example.test','oe-site'),'workspace_access_denied');
select pg_temp.oe_expect(format('select public.read_workspace_booking_evidence(%L,%L,%L,%L,current_date,current_date)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-other'),'workspace_access_denied');
select pg_temp.oe_expect(format('select public.read_workspace_booking_evidence(%L,%L,%L,%L,current_date,current_date+7)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-site'),'booking_invalid');
insert into public.bookings(id,tenant_id,status,service_id,service_name,date,start_time,end_time,client_name,client_email,client_phone)
 values('oe-past','oe-site','confirmed','consult','Consultation',current_date,'00:00','00:01','Past Customer','','');
select pg_temp.oe_assert(public.mark_workspace_booking_no_show((select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-site','oe-past')->>'status'='no_show','past booking explicitly marked no-show');
select pg_temp.oe_assert(public.mark_workspace_booking_no_show((select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-site','oe-past')->>'status'='no_show','no-show retry idempotent');
select pg_temp.oe_assert((select count(*)=2 from public.business_booking_history h join public.business_bookings b on b.id=h.booking_id where b.legacy_id='oe-past'),'retry adds no history');
select pg_temp.oe_assert((select status='completed' from public.bookings where id='oe-past'),'legacy rollback receives compatible completed status');
select pg_temp.oe_expect(format('select public.mark_workspace_booking_no_show(%L,%L,%L,%L,%L)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000001','owner-evidence@example.test','oe-site','oe-future'),'booking_not_found');
select pg_temp.oe_expect(format('select public.mark_workspace_booking_no_show(%L,%L,%L,%L,%L)',(select id from oe_workspace),'ce000000-0000-4000-8000-000000000002','outsider-evidence@example.test','oe-site','oe-past'),'workspace_access_denied');
insert into public.business_booking_messages(booking_id,kind,status,finished_at)
 select id,'reminder_24h','suppressed',now() from public.business_bookings where legacy_id='oe-past';
select pg_temp.oe_assert((select count(*)=1 from jsonb_array_elements(pg_temp.oe_read()#>'{bookings,0,history}') h where h->>'kind'='reminder' and h->>'status'='suppressed'),'suppressed reminder remains suppressed evidence');
insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason,at)
 select b.id,'system','no_show','no_show','Fixture history',clock_timestamp()+make_interval(secs=>i) from public.business_bookings b cross join generate_series(1,55) i where b.legacy_id='oe-past';
select pg_temp.oe_assert(jsonb_array_length(pg_temp.oe_read()#>'{bookings,0,history}')=50 and (pg_temp.oe_read()#>>'{bookings,0,historyTruncated}')::boolean,'history bound is visible, not silently truncated');
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by)
 select id,'google','fixture-calendar','Fixture calendar','UTC','error','ce000000-0000-4000-8000-000000000001' from oe_workspace;
select pg_temp.oe_assert(pg_temp.oe_read()->>'calendarHealth'='reconnect','errored calendar requests reconnect without losing bookings');
select pg_temp.oe_assert(jsonb_array_length(pg_temp.oe_read()->'bookings')=2,'calendar error does not remove bookings');
select pg_temp.oe_assert(not has_function_privilege('anon','public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date)','EXECUTE')
 and not has_function_privilege('authenticated','public.mark_workspace_booking_no_show(uuid,uuid,text,text,text)','EXECUTE'),'browser roles have no direct RPC authority');
rollback;
