\set ON_ERROR_STOP on
-- One real business, one real Live Bookings System, no tenant or website row.
begin;
create function pg_temp.nw_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'native workspace assertion failed: %',message; end if; end $$;
create function pg_temp.nw_expect(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
insert into public.users(id,email,verified_at) values
 ('ea000000-0000-4000-8000-000000000001','agent-visible-owner@example.test',now()),
 ('ea000000-0000-4000-8000-000000000002','agent-visible-member@example.test',now()),
 ('ea000000-0000-4000-8000-000000000003','agent-visible-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ea000000-0000-4000-8000-000000000010','customer','Native Consultation','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000011','customer','Other Business','ea000000-0000-4000-8000-000000000003'),
 ('ea000000-0000-4000-8000-000000000012','personal','Personal Fixture','ea000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000001','owner','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000002','member','ea000000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values
 ('ea000000-0000-4000-8000-000000000010','display_name','"Native Consultation"','owner','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000010','owner_recipient','{"email":"agent-visible-owner@example.test","name":"Native Owner"}','owner','ea000000-0000-4000-8000-000000000001'),
 ('ea000000-0000-4000-8000-000000000010','hours','{"timezone":"UTC","weekly":[{"day":0,"opens":"09:00","closes":"17:00"},{"day":1,"opens":"09:00","closes":"17:00"},{"day":2,"opens":"09:00","closes":"17:00"},{"day":3,"opens":"09:00","closes":"17:00"},{"day":4,"opens":"09:00","closes":"17:00"},{"day":5,"opens":"09:00","closes":"17:00"},{"day":6,"opens":"09:00","closes":"17:00"}]}','owner','ea000000-0000-4000-8000-000000000001');
insert into public.business_services(id,workspace_id,name,duration_minutes,active,source,created_by,updated_by) values
 ('ea000000-0000-4000-8000-000000000030','ea000000-0000-4000-8000-000000000010','Consultation',30,true,'owner','ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001');
select pg_temp.nw_assert((public.read_tenant_booking_context('workspace:ea000000-0000-4000-8000-000000000010')->>'paused')::boolean,'missing System closes new admission');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values ('ea000000-0000-4000-8000-000000000050','ea000000-0000-4000-8000-000000000010','scheduling','schedule','Bookings','{}','ea000000-0000-4000-8000-000000000001');
insert into public.systems(id,business_workspace_id,name,kind,origin_kind,origin_ref,command_id,command_digest,created_by,updated_by) values
 (public.system_origin_id('ea000000-0000-4000-8000-000000000010','saved_work','ea000000-0000-4000-8000-000000000050'),'ea000000-0000-4000-8000-000000000010','Bookings','booking','saved_work','ea000000-0000-4000-8000-000000000050','ea000000-0000-4000-8000-000000000040',repeat('a',64),'ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001');
select pg_temp.nw_assert((public.read_tenant_booking_context('workspace:ea000000-0000-4000-8000-000000000010')->>'paused')::boolean,'Draft System closes new admission');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
 ('ea000000-0000-4000-8000-000000000021',public.system_origin_id('ea000000-0000-4000-8000-000000000010','saved_work','ea000000-0000-4000-8000-000000000050'),'ea000000-0000-4000-8000-000000000010',1,'{"kind":"booking","ref":"agent-visible-bookings"}','ea000000-0000-4000-8000-000000000041',repeat('b',64),'ea000000-0000-4000-8000-000000000001');
update public.systems set lifecycle='live',current_revision_id='ea000000-0000-4000-8000-000000000021',current_revision_number=1 where id=public.system_origin_id('ea000000-0000-4000-8000-000000000010','saved_work','ea000000-0000-4000-8000-000000000050');

-- Agency receives one Bookings System, never an implicit business-wide grant.
insert into public.workspaces(id,kind,name,created_by) values ('ea000000-0000-4000-8000-000000000060','agency','Agency Fixture','ea000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('ea000000-0000-4000-8000-000000000060','ea000000-0000-4000-8000-000000000003','owner','ea000000-0000-4000-8000-000000000003');
insert into public.workspace_delegations(customer_workspace_id,customer_work_id,agency_workspace_id,granted_by,accepted_by) values ('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000050','ea000000-0000-4000-8000-000000000060','ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000003');
select public.record_tenant_booking('workspace:ea000000-0000-4000-8000-000000000010',jsonb_build_object('legacyId','visible-agent','status','requested','origin','agent','serviceRef','ea000000-0000-4000-8000-000000000030','serviceName','Consultation','start',date_trunc('day',now())+interval '10 hours','end',date_trunc('day',now())+interval '10 hours 30 minutes','timeZone','UTC','bufferMinutes',0,'customer',jsonb_build_object('name','Agent Customer','email','customer@example.test')),'native');
select public.issue_booking_access('workspace:ea000000-0000-4000-8000-000000000010','visible-agent',jsonb_build_object('manageHash',repeat('a',64),'manageCiphertext','not-a-real-secret','agentName','Claude'));
create function pg_temp.av_read() returns jsonb language sql as $$ select public.read_provider_booking_evidence('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000003','agent-visible-outsider@example.test',current_date,'week') $$;
select pg_temp.nw_assert(pg_temp.av_read()#>>'{bookings,0,agentName}'='Claude','provider reads source from access record');
select pg_temp.nw_assert(public.read_workspace_booking_evidence('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000001','agent-visible-owner@example.test','workspace:ea000000-0000-4000-8000-000000000010',current_date,current_date)#>>'{bookings,0,booking,agentName}'='Claude','owner projection reads source');
select pg_temp.nw_assert(public.read_workspace_booking_requests('ea000000-0000-4000-8000-000000000010')#>>'{0,agentName}'='Claude','existing Needs-you adapter receives source without member');
select pg_temp.nw_assert(not (pg_temp.av_read()::text like '%ciphertext%' or pg_temp.av_read()::text like '%manageHash%' or pg_temp.av_read()::text like '%statusHash%'),'no bearer tokens exposed');
select pg_temp.nw_assert(public.read_agent_booking_proof('workspace:ea000000-0000-4000-8000-000000000010',now()-interval '1 day',clock_timestamp()+interval '1 day')=1,'counts real captured requests, not clicks');
select pg_temp.nw_expect($q$select public.read_provider_booking_evidence('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000003','forged@example.test',current_date,'week')$q$,'business_record_access_denied');
select pg_temp.nw_expect($q$select public.read_provider_booking_evidence('ea000000-0000-4000-8000-000000000011','ea000000-0000-4000-8000-000000000003','agent-visible-outsider@example.test',current_date,'week')$q$,'business_record_access_denied');
select pg_temp.nw_expect($q$select public.read_provider_booking_evidence('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000003','agent-visible-outsider@example.test',current_date,'month')$q$,'booking_invalid');
select pg_temp.nw_expect($q$select public.mark_workspace_booking_no_show('ea000000-0000-4000-8000-000000000010','ea000000-0000-4000-8000-000000000003','agent-visible-outsider@example.test','workspace:ea000000-0000-4000-8000-000000000010','visible-agent')$q$,'workspace_access_denied');
update public.workspace_delegations set status='revoked',revoked_at=now() where customer_work_id='ea000000-0000-4000-8000-000000000050';
select pg_temp.nw_expect('select pg_temp.av_read()','business_record_access_denied');
select pg_temp.nw_assert(not has_function_privilege('anon','public.read_provider_booking_evidence(uuid,uuid,text,date,text)','EXECUTE') and not has_function_privilege('authenticated','public.read_agent_booking_proof(text,timestamptz,timestamptz)','EXECUTE'),'server-only reads');
rollback;
