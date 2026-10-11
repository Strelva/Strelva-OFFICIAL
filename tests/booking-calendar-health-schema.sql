\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.ch_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking calendar health assertion failed: %',message; end if; end $$;
create or replace function pg_temp.ch_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
create table if not exists public.bookings (
 id text primary key, tenant_id text not null references public.tenants(id), status text not null,
 service_id text not null, service_name text not null, date date not null, start_time text not null, end_time text not null,
 client_name text not null,client_email text not null,client_phone text not null,notes text,created_at timestamptz not null default now(),cancelled_at timestamptz
);
insert into public.users(id,email,verified_at) values
 ('cf000000-0000-4000-8000-000000000001','calendar-health@example.test',now()),
 ('cf000000-0000-4000-8000-000000000002','calendar-outsider@example.test',now());
insert into public.super_admins(user_id,email) values('cf000000-0000-4000-8000-000000000001','calendar-health@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
 ('ch-site','cf000000-0000-4000-8000-000000000011','Owner Fixture',true),
 ('ch-other','cf000000-0000-4000-8000-000000000012','Other Fixture',true);
create temporary table ch_workspace(id uuid) on commit drop;
insert into ch_workspace select (public.convert_tenant_to_business('calendar-health@example.test','ch-site',
 '{"tenantId":"ch-site","tenantStableId":"cf000000-0000-4000-8000-000000000011","workspaceName":"Owner Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
 'cf000000-0000-4000-8000-000000000021',repeat('b',64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'cf000000-0000-4000-8000-000000000001','owner','cf000000-0000-4000-8000-000000000001' from ch_workspace on conflict do nothing;
create function pg_temp.ch_sync() returns jsonb language sql as $$ select public.sync_booking_calendar_health((select id from ch_workspace)) $$;
select pg_temp.ch_assert(jsonb_array_length(pg_temp.ch_sync()->'actions')=0,'no calendar is not unhealthy');
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by,access_token_ciphertext,refresh_token_ciphertext,last_error)
 select id,'google','fixture-calendar','Fixture calendar','UTC','connected','cf000000-0000-4000-8000-000000000001','PRIVATE-ACCESS','PRIVATE-REFRESH','PRIVATE-PROVIDER-ERROR' from ch_workspace;
select pg_temp.ch_assert(jsonb_array_length(pg_temp.ch_sync()->'actions')=0,'healthy connection creates no owner action');
update public.workspace_calendar_connections set status='error' where workspace_id=(select id from ch_workspace);
create temporary table ch_action as select pg_temp.ch_sync()#>'{actions,0}' item;
select pg_temp.ch_assert((select item->>'status'='error' and item->>'delivery'='not_sent' from ch_action),'bad connection creates unsent action');
select pg_temp.ch_assert(not (pg_temp.ch_sync()::text like '%PRIVATE%' or pg_temp.ch_sync()::text like '%ciphertext%'),'health projection has no provider secrets/errors');
select pg_temp.ch_assert((select pg_temp.ch_sync()#>>'{actions,0,id}'=item->>'id' from ch_action),'same current bad state deduped');
select pg_temp.ch_assert(not public.claim_booking_calendar_health(gen_random_uuid(),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date),'claim scoped to business');
select pg_temp.ch_assert(not public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),'changed',current_date),'stale revision cannot send');
select pg_temp.ch_assert(public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date),'current owner action claims');
select pg_temp.ch_assert(not public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date+1),'claimed action never auto-replays after lost delivery receipt');
select public.finish_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),'suppressed',null,'email_gates');
select pg_temp.ch_assert(pg_temp.ch_sync()#>>'{actions,0,delivery}'='suppressed','owner not told remains explicit');
select pg_temp.ch_assert(not public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date),'suppressed at most once each morning');
select pg_temp.ch_assert(public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date+1),'suppressed action can retry next morning');
select public.finish_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),'sent','fixture-provider-id',null);
select pg_temp.ch_assert(not public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_action),(select item->>'revision' from ch_action),current_date+2),'accepted notice never replayed');
update public.workspace_calendar_connections set status='connected' where workspace_id=(select id from ch_workspace);
select pg_temp.ch_assert(jsonb_array_length(pg_temp.ch_sync()->'actions')=0,'successful recovery clears current action');
select pg_temp.ch_assert((select state='resolved' and delivery_status='sent' and provider_message_id='fixture-provider-id' from public.booking_calendar_health_actions where id=(select (item->>'id')::uuid from ch_action)),'resolved delivery audit retained');
update public.workspace_calendar_connections set status='revoked' where workspace_id=(select id from ch_workspace);
select pg_temp.ch_assert(pg_temp.ch_sync()#>>'{actions,0,id}'<>(select item->>'id' from ch_action),'later disconnect opens distinct incident');
create temporary table ch_revoked as select pg_temp.ch_sync()#>'{actions,0}' item;
update public.workspace_calendar_connections set status='connected' where workspace_id=(select id from ch_workspace);
select pg_temp.ch_assert(not public.claim_booking_calendar_health((select id from ch_workspace),(select (item->>'id')::uuid from ch_revoked),(select item->>'revision' from ch_revoked),current_date),'recovery between read and claim refuses send');
select pg_temp.ch_assert(not has_function_privilege('anon','public.sync_booking_calendar_health(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.claim_booking_calendar_health(uuid,uuid,text,date)','EXECUTE'),'browser roles cannot sync or claim health');
select pg_temp.ch_assert((select count(*)=0 from public.owner_decisions where workspace_id=(select id from ch_workspace)),'health never fabricates approval decision');
rollback;
