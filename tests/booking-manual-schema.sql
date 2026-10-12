\set ON_ERROR_STOP on
-- Staff cannot approve; every manual appointment is in the same guarded store.
begin;
create function pg_temp.mb_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'manual booking assertion failed: %',message; end if; end $$;
create function pg_temp.mb_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
 if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
insert into public.users(id,email,verified_at) values
 ('cf000000-0000-4000-8000-000000000001','manual-owner@example.test',now()),
 ('cf000000-0000-4000-8000-000000000002','manual-member@example.test',now()),
 ('cf000000-0000-4000-8000-000000000003','manual-outsider@example.test',now());
insert into public.super_admins(user_id,email) values('cf000000-0000-4000-8000-000000000001','manual-owner@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
 ('mb-site','cf000000-0000-4000-8000-000000000011','Manual Fixture',true),
 ('mb-other','cf000000-0000-4000-8000-000000000012','Other Manual Fixture',true);
create temporary table mb_workspace(id uuid) on commit drop;
insert into mb_workspace select (public.convert_tenant_to_business('manual-owner@example.test','mb-site',
 '{"tenantId":"mb-site","tenantStableId":"cf000000-0000-4000-8000-000000000011","workspaceName":"Manual Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
 'cf000000-0000-4000-8000-000000000021',repeat('b',64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'cf000000-0000-4000-8000-000000000001','owner','cf000000-0000-4000-8000-000000000001' from mb_workspace on conflict do nothing;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'cf000000-0000-4000-8000-000000000002','member','cf000000-0000-4000-8000-000000000001' from mb_workspace;
insert into public.business_services(id,workspace_id,name,duration_minutes,active,external_ref,source,created_by,updated_by)
 select 'cf000000-0000-4000-8000-000000000031',id,'Consultation',30,true,'consult','operator','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001' from mb_workspace;
insert into public.booking_settings(calendar_key,tenant_stable_id,workspace_id,mode,buffer_minutes,min_notice_minutes,recorded_via)
 select 'cf000000-0000-4000-8000-000000000011','cf000000-0000-4000-8000-000000000011',id,'request',15,0,'native' from mb_workspace;
create function pg_temp.mb_input(p_ref text default 'manual-request-0001') returns jsonb language sql as $$
 select jsonb_build_object('legacyId',p_ref,'serviceRef','consult','start',now()+interval '12 days','end',now()+interval '12 days 30 minutes',
  'requestFingerprint',repeat('a',64),'customer',jsonb_build_object('name','Dana','email','dana@example.test'))
$$;
create function pg_temp.mb_create(p_input jsonb) returns jsonb language sql as $$
 select public.create_workspace_manual_booking((select id from mb_workspace),'mb-site','cf000000-0000-4000-8000-000000000002','manual-member@example.test',p_input)
$$;
select pg_temp.mb_assert(public.read_workspace_manual_booking_context((select id from mb_workspace),'mb-site','cf000000-0000-4000-8000-000000000002','manual-member@example.test')->>'workspaceId'=(select id::text from mb_workspace),'member reads only own booking context');
select pg_temp.mb_expect(format('select public.read_workspace_manual_booking_context(%L,%L,%L,%L)',(select id from mb_workspace),'mb-site','cf000000-0000-4000-8000-000000000003','manual-outsider@example.test'),'workspace_access_denied');
select pg_temp.mb_expect(format('select public.read_workspace_manual_booking_context(%L,%L,%L,%L)',(select id from mb_workspace),'mb-site','cf000000-0000-4000-8000-000000000002','forged@example.test'),'workspace_access_denied');
select pg_temp.mb_expect(format('select public.read_workspace_manual_booking_context(%L,%L,%L,%L)',(select id from mb_workspace),'mb-other','cf000000-0000-4000-8000-000000000002','manual-member@example.test'),'booking_not_found');
select pg_temp.mb_assert(pg_temp.mb_create(pg_temp.mb_input())->>'status'='recorded','manual request kept');
select pg_temp.mb_assert((select origin='owner' and status='requested' and business_service_id='cf000000-0000-4000-8000-000000000031' and contact_id is not null from public.business_bookings where legacy_id='manual-request-0001'),'one store preserves record service and shared contact');
select pg_temp.mb_assert(pg_temp.mb_create(pg_temp.mb_input())->>'status'='unchanged','identical retry reopens receipt');
select pg_temp.mb_assert((select count(*) from public.business_booking_history h join public.business_bookings b on b.id=h.booking_id where b.legacy_id='manual-request-0001')=1,'retry adds no history');
select pg_temp.mb_expect($q$select pg_temp.mb_create(pg_temp.mb_input()||jsonb_build_object('requestFingerprint',repeat('b',64)))$q$,'booking_request_conflict');
select pg_temp.mb_assert(pg_temp.mb_create(pg_temp.mb_input('manual-request-0002'))->>'status'='conflict','manual and visitor time share the exclusion guard');
select public.record_tenant_booking('mb-site',jsonb_build_object('legacyId','widget-overlap','status','confirmed','origin','site','serviceRef','consult','serviceName','Consultation',
 'start',now()+interval '12 days 35 minutes','end',now()+interval '12 days 65 minutes','timeZone','UTC','bufferMinutes',0,'customer',jsonb_build_object('name','Visitor')),'native');
select pg_temp.mb_assert(not exists(select 1 from public.business_bookings where legacy_id='widget-overlap'),'manual buffer protects against a widget booking');
select pg_temp.mb_expect($q$select pg_temp.mb_create(pg_temp.mb_input('manual-request-0003')||jsonb_build_object('serviceRef','missing','start',now()+interval '13 days','end',now()+interval '13 days 30 minutes'))$q$,'booking_invalid');
update public.business_services set active=false where id='cf000000-0000-4000-8000-000000000031';
select pg_temp.mb_assert(pg_temp.mb_create(pg_temp.mb_input())->>'status'='unchanged','old receipt survives service removal');
select pg_temp.mb_expect($q$select pg_temp.mb_create(pg_temp.mb_input('manual-request-0004')||jsonb_build_object('start',now()+interval '13 days','end',now()+interval '13 days 30 minutes'))$q$,'booking_invalid');
delete from public.workspace_memberships where user_id='cf000000-0000-4000-8000-000000000002' and workspace_id=(select id from mb_workspace);
select pg_temp.mb_expect($q$select pg_temp.mb_create(pg_temp.mb_input())$q$,'workspace_access_denied');
select pg_temp.mb_assert(not has_function_privilege('anon','public.create_workspace_manual_booking(uuid,text,uuid,text,jsonb)','execute')
 and not has_function_privilege('authenticated','public.read_workspace_manual_booking_context(uuid,text,uuid,text)','execute'),'no browser service-role bypass');
-- Public-receipt cancellation uses set_tenant_booking_status, unlike native
-- manage tokens. It is allowed inside the cutoff and records that fact once.
select public.record_tenant_booking('mb-site',jsonb_build_object('legacyId','late-public','origin','site','status','confirmed',
 'serviceName','Consultation','start',now()+interval '2 hours','end',now()+interval '150 minutes','bufferMinutes',0,
 'timeZone','UTC','customer',jsonb_build_object('name','Visitor')),'native');
select pg_temp.mb_assert(public.set_tenant_booking_status('mb-site','late-public','cancelled','visitor','Customer cancelled')->>'status'='updated','late visitor cancellation allowed');
select public.set_tenant_booking_status('mb-site','late-public','cancelled','visitor','Customer cancelled');
select pg_temp.mb_assert((select count(*) from public.business_booking_history h join public.business_bookings b on h.booking_id=b.id where b.legacy_id='late-public' and h.reason='Customer cancelled after the cancellation cutoff')=1,'late visitor cancellation has one immutable receipt');
select pg_temp.mb_assert(not has_function_privilege('service_role','public.set_tenant_booking_status_before_cutoff(text,text,text,text,text)','execute'),'cutoff cannot be bypassed through old RPC');
insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at)
 select id,'cf000000-0000-4000-8000-000000000001','fixture-exit',repeat('a',64),'pause','keep','stop','{"status":"completed"}',now() from mb_workspace;
select pg_temp.mb_assert((public.read_tenant_booking_context('mb-site')->>'paused')::boolean
 and (public.read_tenant_booking_policy('mb-site')->>'paused')::boolean,'exit closes ordinary and cached-record admission');
select pg_temp.mb_expect($q$select public.create_workspace_manual_booking((select id from mb_workspace),'mb-site','cf000000-0000-4000-8000-000000000001','manual-owner@example.test',pg_temp.mb_input('manual-exit-0001'))$q$,'booking_paused');
select pg_temp.mb_expect($q$select public.hold_agent_booking('mb-site',pg_temp.mb_input('agent-exit-0001')||jsonb_build_object('origin','agent','status','held'),'{}')$q$,'booking_paused');
select public.decide_workspace_booking_request((select id from mb_workspace),(select id from public.business_bookings where legacy_id='manual-request-0001'),'approve','owner');
select pg_temp.mb_assert((select status='confirmed' from public.business_bookings where legacy_id='manual-request-0001'),'owner can still confirm a kept request after exit');
select public.claim_booking_messages(now()+interval '11 days 5 seconds',100);
select pg_temp.mb_assert(exists(select 1 from public.business_booking_messages m join public.business_bookings b on b.id=m.booking_id where b.legacy_id='manual-request-0001' and m.kind='reminder_24h'),'kept booking keeps its reminder after exit');
select pg_temp.mb_assert(public.set_tenant_booking_status('mb-site','manual-request-0001','cancelled','visitor','Customer cancelled')->>'status'='updated','customer can cancel after exit');
rollback;
