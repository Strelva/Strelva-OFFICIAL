\set ON_ERROR_STOP on
-- One real business, one real Live Bookings System, no tenant or website row.
begin;
create function pg_temp.nw_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'native workspace assertion failed: %',message; end if; end $$;
create function pg_temp.nw_expect(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
insert into public.users(id,email,verified_at) values
 ('e6000000-0000-4000-8000-000000000001','native-owner@example.test',now()),
 ('e6000000-0000-4000-8000-000000000002','native-member@example.test',now()),
 ('e6000000-0000-4000-8000-000000000003','native-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('e6000000-0000-4000-8000-000000000010','customer','Native Consultation','e6000000-0000-4000-8000-000000000001'),
 ('e6000000-0000-4000-8000-000000000011','customer','Other Business','e6000000-0000-4000-8000-000000000003'),
 ('e6000000-0000-4000-8000-000000000012','personal','Personal Fixture','e6000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000001','owner','e6000000-0000-4000-8000-000000000001'),
 ('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000002','member','e6000000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values
 ('e6000000-0000-4000-8000-000000000010','display_name','"Native Consultation"','owner','e6000000-0000-4000-8000-000000000001'),
 ('e6000000-0000-4000-8000-000000000010','owner_recipient','{"email":"native-owner@example.test","name":"Native Owner"}','owner','e6000000-0000-4000-8000-000000000001'),
 ('e6000000-0000-4000-8000-000000000010','hours','{"timezone":"UTC","weekly":[{"day":0,"opens":"09:00","closes":"17:00"},{"day":1,"opens":"09:00","closes":"17:00"},{"day":2,"opens":"09:00","closes":"17:00"},{"day":3,"opens":"09:00","closes":"17:00"},{"day":4,"opens":"09:00","closes":"17:00"},{"day":5,"opens":"09:00","closes":"17:00"},{"day":6,"opens":"09:00","closes":"17:00"}]}','owner','e6000000-0000-4000-8000-000000000001');
insert into public.business_services(id,workspace_id,name,duration_minutes,active,source,created_by,updated_by) values
 ('e6000000-0000-4000-8000-000000000030','e6000000-0000-4000-8000-000000000010','Consultation',30,true,'owner','e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001');
select pg_temp.nw_assert((public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000010')->>'paused')::boolean,'missing System closes new admission');
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('e6000000-0000-4000-8000-000000000020','e6000000-0000-4000-8000-000000000010','Bookings','booking','e6000000-0000-4000-8000-000000000040',repeat('a',64),'e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001');
select pg_temp.nw_assert((public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000010')->>'paused')::boolean,'Draft System closes new admission');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
 ('e6000000-0000-4000-8000-000000000021','e6000000-0000-4000-8000-000000000020','e6000000-0000-4000-8000-000000000010',1,'{"kind":"booking","ref":"native-bookings"}','e6000000-0000-4000-8000-000000000041',repeat('b',64),'e6000000-0000-4000-8000-000000000001');
update public.systems set lifecycle='live',current_revision_id='e6000000-0000-4000-8000-000000000021',current_revision_number=1 where id='e6000000-0000-4000-8000-000000000020';
select pg_temp.nw_assert(public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000010')->>'tenantStableId' is null and public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000010')->>'calendarKey'='e6000000-0000-4000-8000-000000000010','truthful native calendar identity');
select pg_temp.nw_assert(public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000099') is null and public.read_tenant_booking_context('workspace:e6000000-0000-4000-8000-000000000012') is null,'absent and personal are not native booking scopes');
select pg_temp.nw_assert(public.read_workspace_manual_booking_context('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000002','native-member@example.test')->>'systemId'='e6000000-0000-4000-8000-000000000020','member authorized without tenant');
select pg_temp.nw_expect($q$select public.read_workspace_manual_booking_context('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000003','native-outsider@example.test')$q$,'workspace_access_denied');
select pg_temp.nw_expect($q$select public.read_workspace_manual_booking_context('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000011','e6000000-0000-4000-8000-000000000002','native-member@example.test')$q$,'booking_not_found');
select pg_temp.nw_expect($q$select public.read_workspace_manual_booking_context('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000002','forged@example.test')$q$,'workspace_access_denied');
create function pg_temp.nw_config(p_rev int,p_mode text default 'request') returns jsonb language sql as $$
 select public.configure_booking_setup('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000001','native-owner@example.test',
 jsonb_build_object('expectedRevision',p_rev,'mode','request','bufferMinutes',15,'minNoticeMinutes',0,'maxAdvanceDays',60,'maxPerDay',null,'cancellationCutoffHours',24,
 'services',jsonb_build_array(jsonb_build_object('businessServiceId','e6000000-0000-4000-8000-000000000030','mode',p_mode,'bufferMinutes',7,'bookable',true,
 'intake',jsonb_build_array(jsonb_build_object('id','reason','label','Reason','type','textarea','required',true)))))) $$;
select pg_temp.nw_assert(pg_temp.nw_config(0)->>'revision'='1','native setup in same store');
select pg_temp.nw_assert((select tenant_stable_id is null and calendar_key=workspace_id from public.booking_service_policies where workspace_id='e6000000-0000-4000-8000-000000000010'),'native service policy keeps NULL tenant');
select pg_temp.nw_assert((select tenant_stable_id is null and calendar_key=workspace_id from public.booking_settings where workspace_id='e6000000-0000-4000-8000-000000000010'),'native settings keep NULL tenant');
create function pg_temp.nw_input(p_ref text default 'manual-native-0001',p_days int default 12) returns jsonb language sql as $$ select jsonb_build_object('legacyId',p_ref,'serviceRef','e6000000-0000-4000-8000-000000000030','start',date_trunc('day',now())+make_interval(days=>p_days,hours=>10),'end',date_trunc('day',now())+make_interval(days=>p_days,hours=>10,mins=>30),'requestFingerprint',repeat('c',64),'customer',jsonb_build_object('name','Native Customer','email','native-customer@example.test'),'intakeAnswers','{"reason":"Consultation"}'::jsonb) $$;
create function pg_temp.nw_create(p_input jsonb) returns jsonb language sql as $$ select public.create_workspace_manual_booking('e6000000-0000-4000-8000-000000000010','workspace:e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000002','native-member@example.test',p_input) $$;
select pg_temp.nw_assert(pg_temp.nw_create(pg_temp.nw_input())->>'status'='recorded','manual native request recorded');
select pg_temp.nw_assert((select tenant_stable_id is null and tenant_slug_at_booking is null and calendar_key=workspace_id and contact_id is not null and buffer_minutes=7 from public.business_bookings where legacy_id='manual-native-0001'),'same-store service/contact/buffer no fake tenant');
select pg_temp.nw_assert(pg_temp.nw_create(pg_temp.nw_input())->>'status'='unchanged','idempotent native manual request');
select pg_temp.nw_assert(pg_temp.nw_create(pg_temp.nw_input('manual-native-0002'))->>'status'='conflict','native requests share exclusion');
select pg_temp.nw_expect($q$select pg_temp.nw_create(pg_temp.nw_input('manual-native-0003',13)||'{"intakeAnswers":{}}')$q$,'booking_intake_required');
select pg_temp.nw_expect($q$select public.change_workspace_booking_status('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000002','native-member@example.test','workspace:e6000000-0000-4000-8000-000000000010','manual-native-0001','confirmed')$q$,'booking_not_found');
select public.decide_workspace_booking_request('e6000000-0000-4000-8000-000000000010',(select id from public.business_bookings where legacy_id='manual-native-0001'),'approve','owner');
select public.issue_booking_access('workspace:e6000000-0000-4000-8000-000000000010','manual-native-0001',jsonb_build_object('manageHash',repeat('a',64),'manageCiphertext','fixture-native-management'));
select pg_temp.nw_assert(public.read_native_booking_access(repeat('a',64),'manage')->>'tenantId' is null and public.read_native_booking_access(repeat('a',64),'manage')->>'siteName'='Native Consultation','native bearer access has business name without tenant');
select pg_temp.nw_assert(public.read_booking_business_details('workspace:e6000000-0000-4000-8000-000000000010')->>'name'='Native Consultation','business details read from record without website');
select pg_temp.nw_assert(public.resolve_business_owner_recipient('e6000000-0000-4000-8000-000000000010')->>'email'='native-owner@example.test','owner recipient from record without website');
select pg_temp.nw_assert(jsonb_array_length(public.read_tenant_bookings('workspace:e6000000-0000-4000-8000-000000000010',null,null))=1,'native list reads commitment');
select pg_temp.nw_assert(jsonb_array_length(public.read_tenant_booking_history('workspace:e6000000-0000-4000-8000-000000000010','manual-native-0001'))=2,'native immutable history retained');
select pg_temp.nw_assert(jsonb_array_length(public.read_workspace_booking_evidence('e6000000-0000-4000-8000-000000000010','e6000000-0000-4000-8000-000000000001','native-owner@example.test','workspace:e6000000-0000-4000-8000-000000000010',current_date+12,current_date+12)->'bookings')=1,'native owner evidence bounded and authorized');
select pg_temp.nw_config(1,'instant');
select pg_temp.nw_assert(public.read_booking_instant_policies('e6000000-0000-4000-8000-000000000010')#>>'{0,tenantId}'='workspace:e6000000-0000-4000-8000-000000000010','instant decision references explicit scope not fake tenant');
select public.decide_booking_instant_policy('e6000000-0000-4000-8000-000000000010',(select id from public.booking_instant_policies where workspace_id='e6000000-0000-4000-8000-000000000010' and status='proposed'),1,'approve','e6000000-0000-4000-8000-000000000001','native-owner@example.test',false);
select pg_temp.nw_assert((select mode='instant' from public.booking_service_policies where workspace_id='e6000000-0000-4000-8000-000000000010'),'owner standing approval configures native service');
update public.systems set lifecycle='paused' where id='e6000000-0000-4000-8000-000000000020';
select pg_temp.nw_assert(pg_temp.nw_create(pg_temp.nw_input())->>'status'='unchanged','kept receipt retry survives pause');
select pg_temp.nw_expect($q$select pg_temp.nw_create(pg_temp.nw_input('manual-native-0004',13))$q$,'booking_paused');
select pg_temp.nw_assert((public.change_native_booking(repeat('a',64),'{"action":"cancel"}')->>'status')='cancelled','customer cancellation survives pause');
update public.systems set lifecycle='live' where id='e6000000-0000-4000-8000-000000000020';
-- A new incident is not dependent on a website link.
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values('e6000000-0000-4000-8000-000000000010','google','native-calendar','Native calendar','UTC','error','e6000000-0000-4000-8000-000000000001');
select pg_temp.nw_assert(jsonb_array_length(public.sync_booking_calendar_health('e6000000-0000-4000-8000-000000000010')->'actions')=1,'native health action requires no website');
select pg_temp.nw_assert(public.read_native_booking_workspaces() @> '["e6000000-0000-4000-8000-000000000010"]','cron recovery discovers native business');
select pg_temp.nw_assert(not has_function_privilege('authenticated','public.change_workspace_booking_status(uuid,uuid,text,text,text,text)','EXECUTE') and not has_function_privilege('anon','public.read_native_booking_workspaces()','EXECUTE'),'native RPCs server-only');
select pg_temp.nw_assert(not exists(select 1 from public.tenants where stable_id='e6000000-0000-4000-8000-000000000010') and not exists(select 1 from public.tenant_workspace_links where workspace_id='e6000000-0000-4000-8000-000000000010'),'tenantless proof creates no tenant/link');
rollback;
