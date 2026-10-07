\set ON_ERROR_STOP on
begin;
create function pg_temp.ab_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'booking admission assertion: %',message; end if; end $$;
create function pg_temp.ab_expect(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return;
 end; raise exception 'expected refusal: %',expected;
end $$;
insert into public.users(id,email,verified_at) values('d5290000-0000-4000-8000-000000000001','ab-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('d5290000-0000-4000-8000-000000000010','customer','Abuse fixture','d5290000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('d5290000-0000-4000-8000-000000000010','d5290000-0000-4000-8000-000000000001','owner','d5290000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values('ab-site','d5290000-0000-4000-8000-000000000020','Abuse fixture',true);
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
values('d5290000-0000-4000-8000-000000000010','d5290000-0000-4000-8000-000000000020','ab-site','Abuse fixture','ab-binding',repeat('a',64),'d5290000-0000-4000-8000-000000000001','d5290000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
values('d5290000-0000-4000-8000-000000000040','d5290000-0000-4000-8000-000000000010','scheduling','schedule','Consultation','{}','d5290000-0000-4000-8000-000000000001');
insert into public.public_website_booking_grants(tenant_stable_id,business_workspace_id,work_id,capability_id,capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by)
values('d5290000-0000-4000-8000-000000000020','d5290000-0000-4000-8000-000000000010','d5290000-0000-4000-8000-000000000040','consult',1,'inquiries',1,'google','Consultation','UTC','d5290000-0000-4000-8000-000000000001');
create function pg_temp.ab_request(n integer,email text default null,day integer default null) returns jsonb language sql as $$
 select jsonb_build_object('workspaceId','d5290000-0000-4000-8000-000000000010',
 'requestId','public-request-'||lpad(n::text,32,'0'),'fingerprint',lpad(to_hex(n),64,'0'),
 'visitor',jsonb_build_object('name','Dana','email',coalesce(email,'dana-'||n||'@example.test')),
 'start',now()+make_interval(days=>coalesce(day,n)),'end',now()+make_interval(days=>coalesce(day,n),mins=>30),
 'tokenHash',lpad(to_hex(n),64,'0'),'tokenCiphertext','enc:v1:fixture')
$$;
select pg_temp.ab_assert(not has_table_privilege('service_role','public.public_booking_requests','SELECT,INSERT,UPDATE,DELETE'),'no direct table access');
select pg_temp.ab_assert(not has_function_privilege('anon','public.claim_public_booking_request(text,jsonb)','EXECUTE'),'no anonymous RPC access');
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(1));
select pg_temp.ab_assert((select state='held' and expires_at<=created_at+interval '15 minutes'+interval '1 second' from public.public_booking_requests),'15 minute unconfirmed hold');
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(1));
select pg_temp.ab_assert((select count(*)=1 from public.public_booking_requests),'idempotent retry');
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(2,'DANA-1@example.test'))$q$,'booking_public_limit_email');
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(2,null,1))$q$,'booking_slot_taken');
-- Same fingerprint with a NEW request id cannot bypass the email/slot cap.
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(2,'dana-1@example.test')||jsonb_build_object('fingerprint',lpad(to_hex(1),64,'0')))$q$,'booking_public_limit_email');
select pg_temp.ab_expect($q$select public.consume_public_booking_request(repeat('f',64))$q$,'booking_hold_expired');
select public.consume_public_booking_request(lpad(to_hex(1),64,'0'));
select pg_temp.ab_expect($q$select public.consume_public_booking_request(lpad(to_hex(1),64,'0'))$q$,'booking_hold_expired');
select public.finish_public_booking_request('ab-site','public-request-'||lpad('1',32,'0'));
select pg_temp.ab_assert((select state='placed' from public.public_booking_requests),'confirmation consumed once then placement recorded');
-- Expiry frees capacity without cron and never reopens the same request.
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(2));
update public.public_booking_requests set expires_at=now()-interval '1 second' where request_id='public-request-'||lpad('2',32,'0');
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(2))$q$,'booking_hold_expired');
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(3,'dana-2@example.test',2));
select public.cancel_public_booking_request('ab-site','public-request-'||lpad('3',32,'0'));
select pg_temp.ab_expect($q$select public.consume_public_booking_request(lpad(to_hex(3),64,'0'))$q$,'booking_hold_expired');
do $$ begin for n in 10..29 loop perform public.claim_public_booking_request('ab-site',pg_temp.ab_request(n)); end loop; end $$;
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(30))$q$,'booking_public_limit_business');
update public.public_booking_requests set expires_at=now()-interval '1 second' where state='held';
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(30));
-- Store-side inquiry requests participate in the very same caps.
insert into public.tenant_workspace_links(tenant_stable_id,workspace_id,linked_by) values('d5290000-0000-4000-8000-000000000020','d5290000-0000-4000-8000-000000000010','d5290000-0000-4000-8000-000000000001');
create function pg_temp.ab_booking(n integer,email text,status text default 'held') returns jsonb language sql as $$
 select jsonb_build_object('legacyId','ab-booking-'||n,'origin','inquiry','status',status,'serviceName','Consultation',
 'start',now()+make_interval(days=>n),'end',now()+make_interval(days=>n,mins=>30),'timeZone','UTC','bufferMinutes',0,
 'customer',jsonb_build_object('name','Dana','email',email),'requestFingerprint',lpad(to_hex(n+1000),64,'0'))
$$;
select pg_temp.ab_expect($q$select public.record_tenant_booking('ab-site',pg_temp.ab_booking(31,'dana-30@example.test'),'native')$q$,'booking_public_limit_email');
select public.record_tenant_booking('ab-site',pg_temp.ab_booking(32,'other@example.test'),'native');
select pg_temp.ab_expect($q$select public.claim_public_booking_request('ab-site',pg_temp.ab_request(33,'OTHER@example.test'))$q$,'booking_public_limit_email');
update public.business_bookings set created_at=now()-interval '16 minutes' where legacy_id='ab-booking-32';
select public.claim_public_booking_request('ab-site',pg_temp.ab_request(33,'OTHER@example.test',32));
select pg_temp.ab_assert((select status='cancelled' from public.business_bookings where legacy_id='ab-booking-32'),'expired store hold releases exclusion without cron');
select 'public booking admission caps and confirmation checks passed' as result;
rollback;
