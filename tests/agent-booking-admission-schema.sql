\set ON_ERROR_STOP on
-- #547 review: agent holds from the public MCP share #529's admission, the
-- agent cap counts only live holds, and email caps count the mailbox.
-- Each probe runs in its own rolled-back block and every failure is listed,
-- so check-workspace-sql.sh can prove all of them fail on #529's functions
-- (before 20261013210000). Fictional data; the whole file rolls back.
begin;
create temporary table aa_failed(probe text primary key, error text) on commit drop;
create function pg_temp.aa_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'agent admission assertion: %',message; end if; end $$;
create function pg_temp.aa_expect(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
   if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return;
 end; raise exception 'expected refusal: %',expected;
end $$;
-- Runs one probe and always undoes it; a failure is recorded, not raised.
create function pg_temp.aa_probe(name text,body text) returns void language plpgsql as $$
begin
 begin execute body; raise exception 'aa_probe_passed';
 exception when others then
   if sqlerrm<>'aa_probe_passed' then insert into aa_failed values(name,sqlerrm); end if;
 end;
end $$;

insert into public.users(id,email,verified_at) values('d5470000-0000-4000-8000-000000000001','aa-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('d5470000-0000-4000-8000-000000000010','customer','Agent admission fixture','d5470000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values('d5470000-0000-4000-8000-000000000010','d5470000-0000-4000-8000-000000000001','d5470000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('d5470000-0000-4000-8000-000000000010','d5470000-0000-4000-8000-000000000001','owner','d5470000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values('aa-site','d5470000-0000-4000-8000-000000000020','Agent admission fixture',true);
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
values('d5470000-0000-4000-8000-000000000010','d5470000-0000-4000-8000-000000000020','aa-site','Agent admission fixture','aa-binding',repeat('a',64),'d5470000-0000-4000-8000-000000000001','d5470000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
values('d5470000-0000-4000-8000-000000000040','d5470000-0000-4000-8000-000000000010','scheduling','schedule','Consultation','{}','d5470000-0000-4000-8000-000000000001');
insert into public.public_website_booking_grants(tenant_stable_id,business_workspace_id,work_id,capability_id,capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by)
values('d5470000-0000-4000-8000-000000000020','d5470000-0000-4000-8000-000000000010','d5470000-0000-4000-8000-000000000040','consult',1,'inquiries',1,'google','Consultation','UTC','d5470000-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
values('d5470000-0000-4000-8000-000000000020','aa-site','d5470000-0000-4000-8000-000000000010','d5470000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('b',64),'{}');

create function pg_temp.aa_request(n integer,email text default null) returns jsonb language sql as $$
 select jsonb_build_object('workspaceId','d5470000-0000-4000-8000-000000000010',
 'requestId','public-request-'||lpad(n::text,32,'0'),'fingerprint',lpad(to_hex(n),64,'0'),
 'visitor',jsonb_build_object('name','Dana','email',coalesce(email,'dana-'||n||'@example.test')),
 'start',now()+make_interval(days=>n),'end',now()+make_interval(days=>n,mins=>30),
 'tokenHash',lpad(to_hex(n),64,'0'),'tokenCiphertext','enc:v1:fixture')
$$;
create function pg_temp.aa_hold(n integer,email text default null) returns jsonb language sql as $$
 select public.hold_agent_booking('aa-site',jsonb_build_object('legacyId','agent-aa-'||n,'status','held','origin','agent','serviceName','Consultation',
   'start',now()+make_interval(days=>100+n),'end',now()+make_interval(days=>100+n,mins=>30),'bufferMinutes',0,'timeZone','UTC',
   'requestFingerprint',lpad(to_hex(n+5000),64,'0'),'customer',jsonb_build_object('name','Dana','email',coalesce(email,'agent-'||n||'@example.test'))),
   jsonb_build_object('manageHash',lpad(to_hex(n*3+90000),64,'0'),'manageCiphertext','enc:v1:manage','confirmHash',lpad(to_hex(n*3+90001),64,'0'),
   'confirmCiphertext','enc:v1:confirm','statusHash',lpad(to_hex(n*3+90002),64,'0'),'statusCiphertext','enc:v1:status','agentName','Fixture assistant'))
$$;

-- M2: ten dead agent holds (expired or cancelled) must not block the next one.
select pg_temp.aa_probe('dead_holds',$probe$
 do $$ begin for n in 1..10 loop perform pg_temp.aa_hold(n); end loop; end $$;
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(11)$q$,'booking_agent_limit');
 update public.business_bookings set created_at=now()-interval '16 minutes' where legacy_id in ('agent-aa-1','agent-aa-2','agent-aa-3','agent-aa-4','agent-aa-5');
 update public.business_bookings set status='cancelled',cancelled_at=now() where legacy_id in ('agent-aa-6','agent-aa-7','agent-aa-8','agent-aa-9','agent-aa-10');
 select pg_temp.aa_assert(pg_temp.aa_hold(11)->>'status'='recorded','dead agent holds free the agent cap');
 select pg_temp.aa_assert((select count(*)=5 from public.business_booking_history h join public.business_bookings b on b.id=h.booking_id
   where b.legacy_id like 'agent-aa-%' and h.reason like 'Hold expired%'),'expired agent holds released at admission without cron');
$probe$);

-- #552: website requests fill the shared business budget; agents are refused.
select pg_temp.aa_probe('shared_budget',$probe$
 do $$ begin for n in 1..20 loop perform public.claim_public_booking_request('aa-site',pg_temp.aa_request(n)); end loop; end $$;
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(1)$q$,'booking_public_limit_business');
 select pg_temp.aa_assert((select count(*)=0 from public.business_bookings where calendar_key='d5470000-0000-4000-8000-000000000020' and origin='agent'),'no agent hold admitted past this business budget');
$probe$);

-- One live request per mailbox across channels, aliases included, and
-- placement only through the customer's emailed confirmation.
select pg_temp.aa_probe('one_email',$probe$
 select public.claim_public_booking_request('aa-site',pg_temp.aa_request(1,'Dana.Reed@gmail.com'));
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(1,'dana.reed@gmail.com')$q$,'booking_public_limit_email');
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(2,'danareed+mcp@googlemail.com')$q$,'booking_public_limit_email');
 select pg_temp.aa_assert(pg_temp.aa_hold(3,'other@example.test')->>'status'='recorded','a different mailbox is admitted');
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(4,'other+2@example.test')$q$,'booking_public_limit_email');
 select pg_temp.aa_expect($q$select public.claim_public_booking_request('aa-site',pg_temp.aa_request(5,'OTHER+web@example.test'))$q$,'booking_public_limit_email');
 select pg_temp.aa_assert((select customer_email='other@example.test' from public.business_bookings where legacy_id='agent-aa-3'),'stored address is unchanged');
 select pg_temp.aa_expect($q$select public.set_tenant_booking_status('aa-site','agent-aa-3','confirmed','visitor','bypass')$q$,'booking_email_confirmation_required');
 select public.confirm_agent_booking(lpad(to_hex(3*3+90001),64,'0'),false);
 select pg_temp.aa_assert((select status in ('requested','confirmed') from public.business_bookings where legacy_id='agent-aa-3'),'email confirmation places the agent request');
$probe$);

-- Mailbox identity (caps only) and the service-role-only directory listing.
select pg_temp.aa_probe('mailbox_identity',$probe$
 select pg_temp.aa_assert(public.booking_email_identity(' Dana.Reed+mcp@GoogleMail.com ')='danareed@gmail.com','gmail dots, plus tag and googlemail fold');
 select pg_temp.aa_assert(public.booking_email_identity('dana+0@example.test')='dana@example.test','plus tag stripped for every provider');
 select pg_temp.aa_assert(public.booking_email_identity('dana.reed@example.test')='dana.reed@example.test','dots kept outside gmail');
 select pg_temp.aa_assert(public.booking_email_identity('not-an-address')='not-an-address','non-address unchanged');
$probe$);
select pg_temp.aa_probe('directory',$probe$
 select pg_temp.aa_assert(not has_function_privilege('anon','public.list_published_business_pages()','EXECUTE')
   and not has_function_privilege('authenticated','public.list_published_business_pages()','EXECUTE')
   and has_function_privilege('service_role','public.list_published_business_pages()','EXECUTE'),'directory listing is service-role only');
 insert into public.business_pages(workspace_id,handle,published,published_at,updated_by)
 values('d5470000-0000-4000-8000-000000000010','aa-native',true,now(),'d5470000-0000-4000-8000-000000000001');
 select pg_temp.aa_assert((select count(*)=1 from jsonb_array_elements(public.list_published_business_pages()) e
   where e->>'handle'='aa-native' and e->>'workspaceId'='d5470000-0000-4000-8000-000000000010'),'published page listed');
 update public.business_pages set published=false where workspace_id='d5470000-0000-4000-8000-000000000010';
 select pg_temp.aa_assert(not exists(select 1 from jsonb_array_elements(public.list_published_business_pages()) e where e->>'handle'='aa-native'),'unpublished page hidden');
$probe$);

do $$
declare v_failed text := (select string_agg(probe||': '||error, '; ' order by probe) from aa_failed);
begin
 if v_failed is not null then raise exception 'agent booking admission probes failed: %', v_failed; end if;
end $$;
select 'agent booking admission checks passed' as result;
rollback;
