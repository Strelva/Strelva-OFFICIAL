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


-- Durable per-name/mailbox admission survives cancellation and rotating IPs.
select pg_temp.aa_probe('agent_name_hourly',$probe$
 do $$ begin for n in 1..20 loop
  perform pg_temp.aa_hold(n);
  update public.business_bookings set status='cancelled',cancelled_at=now() where legacy_id='agent-aa-'||n;
 end loop; end $$;
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(21)$q$,'booking_agent_limit');
 select pg_temp.aa_assert(pg_temp.aa_hold(1)->>'status'='unchanged','replay survives name cap');
$probe$);
select pg_temp.aa_probe('mailbox_hourly',$probe$
 do $$ begin for n in 1..5 loop
  perform pg_temp.aa_hold(n,'dana+'||n||'@example.test');
  update public.business_bookings set status='cancelled',cancelled_at=now() where legacy_id='agent-aa-'||n;
 end loop; end $$;
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(6,'DANA+6@example.test')$q$,'booking_agent_limit');
$probe$);
select pg_temp.aa_probe('alarm_and_kill',$probe$
 insert into public.super_admins(user_id,email) values('d5470000-0000-4000-8000-000000000001','aa-owner@example.test');
 do $$ begin for n in 1..10 loop perform pg_temp.aa_hold(n); end loop; end $$;
 select pg_temp.aa_assert(public.read_agent_channel_health('d5470000-0000-4000-8000-000000000001','aa-owner@example.test','d5470000-0000-4000-8000-000000000010')->>'alarm'='true','scoped low confirmation alarm');
 select pg_temp.aa_assert(jsonb_array_length(public.read_agent_channel_alarms('d5470000-0000-4000-8000-000000000001','aa-owner@example.test'))=1,'operator receives one scoped alarm');
 insert into public.workspace_release_flags(workspace_id,flag,state,changed_by) values('d5470000-0000-4000-8000-000000000010','agent_channel','off','d5470000-0000-4000-8000-000000000001');
 select pg_temp.aa_expect($q$select pg_temp.aa_hold(11)$q$,'booking_agent_disabled');
 select pg_temp.aa_assert(public.read_native_booking_access(lpad(to_hex(90005),64,'0'),'status') is not null,'kill keeps existing status capability');
$probe$);
do $$ declare failed text:=(select string_agg(probe||': '||error,'; ' order by probe) from aa_failed);
begin if failed is not null then raise exception 'agent abuse probes failed: %',failed;end if;end $$;
select 'agent abuse checks passed' as result;
rollback;
