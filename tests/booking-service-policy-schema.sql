\set ON_ERROR_STOP on
-- Local fixture authority, bounds, evidence and no-show transition proof. Rolls back.
begin;
create or replace function pg_temp.sp_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking service policy assertion failed: %',message; end if; end $$;
create or replace function pg_temp.sp_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
end; raise exception 'expected %, succeeded: %',expected,statement; end $$;
create table if not exists public.bookings (
 id text primary key, tenant_id text not null references public.tenants(id), status text not null,
 service_id text not null, service_name text not null, date date not null, start_time text not null, end_time text not null,
 client_name text not null,client_email text not null,client_phone text not null,notes text,created_at timestamptz not null default now(),cancelled_at timestamptz
);
insert into public.users(id,email,verified_at) values
 ('cf000000-0000-4000-8000-000000000001','service-policy@example.test',now()),
 ('cf000000-0000-4000-8000-000000000002','outsider-evidence@example.test',now());
insert into public.super_admins(user_id,email) values('cf000000-0000-4000-8000-000000000001','service-policy@example.test');
insert into public.tenants(id,stable_id,site_name,active) values
 ('sp-site','cf000000-0000-4000-8000-000000000011','Owner Fixture',true),
 ('sp-other','cf000000-0000-4000-8000-000000000012','Other Fixture',true);
create temporary table sp_workspace(id uuid) on commit drop;
insert into sp_workspace select (public.convert_tenant_to_business('service-policy@example.test','sp-site',
 '{"tenantId":"sp-site","tenantStableId":"cf000000-0000-4000-8000-000000000011","workspaceName":"Owner Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
 'cf000000-0000-4000-8000-000000000021',repeat('b',64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'cf000000-0000-4000-8000-000000000001','owner','cf000000-0000-4000-8000-000000000001' from sp_workspace on conflict do nothing;

insert into public.business_services(id,workspace_id,name,duration_minutes,active,source,verified,external_ref,created_by,updated_by)
 select 'cf000000-0000-4000-8000-000000000030',id,'Consultation',30,true,'operator',true,'consult','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001' from sp_workspace;
insert into public.business_services(id,workspace_id,name,duration_minutes,active,source,verified,external_ref,created_by,updated_by)
 select 'cf000000-0000-4000-8000-000000000031',id,'Follow-up',15,true,'operator',true,'follow','cf000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001' from sp_workspace;
create function pg_temp.sp_config(p_revision integer,p_mode text default 'instant',p_bookable boolean default true,p_buffer integer default 7) returns jsonb language sql as $$
 select public.configure_booking_setup((select id from sp_workspace),'sp-site','cf000000-0000-4000-8000-000000000001','service-policy@example.test',
 jsonb_build_object('expectedRevision',p_revision,'mode','request','bufferMinutes',15,'minNoticeMinutes',240,'maxAdvanceDays',60,'maxPerDay',null,'cancellationCutoffHours',24,
 'services',jsonb_build_array(jsonb_build_object('businessServiceId','cf000000-0000-4000-8000-000000000030','mode',p_mode,'bufferMinutes',p_buffer,'bookable',p_bookable,
 'intake',jsonb_build_array(jsonb_build_object('id','reason','label','What brings you in?','type','textarea','required',true))),
 jsonb_build_object('businessServiceId','cf000000-0000-4000-8000-000000000031','mode','request','bufferMinutes',0,'bookable',false,'intake','[]'::jsonb))))
$$;
select pg_temp.sp_assert(pg_temp.sp_config(0)->>'approvalRequired'='true','service instant requires standing owner approval');
select pg_temp.sp_assert((public.read_tenant_booking_context('sp-site')#>>'{settings,defaultLengthMinutes}')::int=30,'new native configuration uses30 minute default');
select pg_temp.sp_assert((public.read_tenant_booking_context('sp-site')#>>'{servicePolicies,0,mode}')='request','instant not enabled before owner decides');
select pg_temp.sp_expect(format('select public.decide_booking_instant_policy(%L,%L,1,%L,%L,%L,false)',(select id from sp_workspace),(select id from public.booking_instant_policies where tenant_stable_id='cf000000-0000-4000-8000-000000000011' and status='proposed'),'approve','cf000000-0000-4000-8000-000000000001','service-policy@example.test'),'booking_settings_denied');
update public.workspace_memberships set role='owner' where workspace_id=(select id from sp_workspace) and user_id='cf000000-0000-4000-8000-000000000001';
create temporary table sp_policy(id uuid, revision integer);
insert into sp_policy select id,revision from public.booking_instant_policies where tenant_stable_id='cf000000-0000-4000-8000-000000000011' and status='proposed';
select pg_temp.sp_expect(format('select public.configure_booking_setup(%L,%L,%L,%L,%L::jsonb)',(select id from sp_workspace),'sp-other','cf000000-0000-4000-8000-000000000001','service-policy@example.test','{}'),'booking_not_found');
select pg_temp.sp_expect('select pg_temp.sp_config(0)','booking_settings_stale');
select public.decide_booking_instant_policy((select id from sp_workspace),(select id from sp_policy),1,'approve','cf000000-0000-4000-8000-000000000001','service-policy@example.test',false);
select pg_temp.sp_assert((select mode='instant' from public.booking_service_policies where business_service_id='cf000000-0000-4000-8000-000000000030'),'owner approves exact service policy');
select pg_temp.sp_assert((select mode='request' from public.booking_settings where tenant_stable_id='cf000000-0000-4000-8000-000000000011'),'approval does not enable every service');
select pg_temp.sp_assert((public.read_booking_instant_policies((select id from sp_workspace))#>>'{0,serviceName}')='Consultation','Running names the current record service');
create function pg_temp.sp_book(p_id text,p_ref text default 'consult',p_answers jsonb default '{"reason":"Consultation needed"}'::jsonb) returns jsonb language sql as $$
 select public.record_tenant_booking('sp-site',jsonb_build_object('legacyId',p_id,'origin','site','serviceRef',p_ref,'serviceName','Consultation','status','confirmed',
 'start',now()+interval '10 days','end',now()+interval '10 days 30 minutes','bufferMinutes',99,'timeZone','UTC','customer',jsonb_build_object('name','Visitor'),'intakeAnswers',p_answers),'native')
$$;
select pg_temp.sp_expect($$select pg_temp.sp_book('missing','consult','{}')$$,'booking_intake_required');
select pg_temp.sp_expect($$select pg_temp.sp_book('closed','follow','{}')$$,'booking_service_unavailable');
select pg_temp.sp_assert(pg_temp.sp_book('accepted')#>>'{booking,status}'='confirmed','approved instant service confirms');
select pg_temp.sp_assert((select buffer_minutes=7 and block_end_at=end_at+interval '7 minutes' from public.business_bookings where legacy_id='accepted'),'store enforces service buffer');
select pg_temp.sp_config(1,'request',false,9);
select pg_temp.sp_assert((select status='confirmed' from public.business_bookings where legacy_id='accepted'),'policy edit preserves commitment');
select pg_temp.sp_assert(public.set_tenant_booking_status('sp-site','accepted','cancelled','visitor','Cancelled')->>'status'='updated','closed service remains cancellable');
select pg_temp.sp_expect($$select pg_temp.sp_book('now-closed')$$,'booking_service_unavailable');
select pg_temp.sp_config(2,'request',true,2);
select pg_temp.sp_assert(pg_temp.sp_book('request')#>>'{booking,status}'='requested','request service never instant confirms');
select pg_temp.sp_assert(public.set_tenant_booking_status('sp-site','request','confirmed','owner','Owner confirmed')#>>'{booking,status}'='confirmed','owner can confirm request');
select pg_temp.sp_assert(not has_function_privilege('authenticated','public.configure_booking_setup(uuid,text,uuid,text,jsonb)','EXECUTE')
 and not has_table_privilege('service_role','public.booking_service_policies','INSERT'),'direct roles denied');
rollback;
