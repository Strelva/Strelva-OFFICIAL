\set ON_ERROR_STOP on
-- Real PostgreSQL proof for native manage links, agent holds and lifecycle
-- message claims. Fictional tenants only; all fixtures roll back. No sends.
begin;
-- The isolated workspace cluster does not load the pre-workspace tenant
-- schema. Match its legacy booking table for rollback-management proof.
create table if not exists public.bookings (
 id text primary key, tenant_id text not null references public.tenants(id) on delete cascade,
 service_id text not null, service_name text not null, date date not null, start_time text not null, end_time text not null,
 client_name text not null, client_email text not null, client_phone text not null, notes text,
 status text not null, created_at timestamptz not null default now(), cancelled_at timestamptz
);
create or replace function pg_temp.ba_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking agent assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ba_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ba_booking(p_ref text, p_offset integer, p_patch jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('legacyId', p_ref, 'status', 'held', 'origin', 'agent', 'serviceName', 'Consultation',
    'start', now() + make_interval(days => p_offset), 'end', now() + make_interval(days => p_offset, mins => 30),
    'bufferMinutes', 15, 'timeZone', 'America/New_York', 'requestFingerprint', repeat('a', 64),
    'customer', jsonb_build_object('name', 'Dana Reed', 'email', 'dana@example.test')) || p_patch
$$;
create or replace function pg_temp.ba_access(p_seed integer) returns jsonb language sql as $$
  select jsonb_build_object('manageHash', lpad(to_hex(p_seed * 3), 64, '0'), 'manageCiphertext', 'encrypted-manage-fixture',
    'confirmHash', lpad(to_hex(p_seed * 3 + 1), 64, '0'), 'confirmCiphertext', 'encrypted-confirm-fixture',
    'statusHash', lpad(to_hex(p_seed * 3 + 2), 64, '0'), 'statusCiphertext', 'encrypted-status-fixture', 'agentName', 'Fixture assistant')
$$;
create or replace function pg_temp.ba_id(p_ref text) returns uuid language sql as $$
  select id from public.business_bookings where legacy_id = p_ref and tenant_slug_at_booking = 'ba-site'
$$;

insert into public.users(id, email, verified_at) values
  ('ca000000-0000-4000-8000-0000000000e1', 'ba-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('ca000000-0000-4000-8000-0000000000e1', 'ba-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ba-site', 'ca000000-0000-4000-8000-0000000000b1', 'Agent Fixture Firm', true),
  ('ba-other', 'ca000000-0000-4000-8000-0000000000b2', 'Other Agent Fixture', true);
create temporary table ba_ws(name text primary key, id uuid) on commit drop;
insert into ba_ws select 'site', (public.convert_tenant_to_business('ba-operator@strelva.example.test', 'ba-site',
  '{"tenantId":"ba-site","tenantStableId":"ca000000-0000-4000-8000-0000000000b1","workspaceName":"Agent Fixture Firm","billing":null,"account":null,"patch":{},"contacts":[]}',
  'ca000000-0000-4000-8000-0000000000c1', repeat('e', 64))->>'workspaceId')::uuid;
insert into ba_ws select 'other', (public.convert_tenant_to_business('ba-operator@strelva.example.test', 'ba-other',
  '{"tenantId":"ba-other","tenantStableId":"ca000000-0000-4000-8000-0000000000b2","workspaceName":"Other Agent Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'ca000000-0000-4000-8000-0000000000c2', repeat('f', 64))->>'workspaceId')::uuid;
insert into public.booking_settings(calendar_key, tenant_stable_id, workspace_id, mode, recorded_via)
  values ('ca000000-0000-4000-8000-0000000000b1', 'ca000000-0000-4000-8000-0000000000b1', (select id from ba_ws where name = 'site'), 'instant', 'native');

-- Tables have no bypass grants, and only the service role can invoke RPCs.
select pg_temp.ba_assert((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.business_booking_access'::regclass, 'public.business_booking_updates'::regclass,
  'public.business_booking_update_epoch'::regclass)), 'new tables use RLS');
do $$
declare v_table text; v_role text; v_function text;
begin
  foreach v_table in array array['business_booking_access','business_booking_updates','business_booking_update_epoch'] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      perform pg_temp.ba_assert(not has_table_privilege(v_role, 'public.' || v_table, 'SELECT,INSERT,UPDATE,DELETE'),
        v_role || ' has no direct access to ' || v_table);
    end loop;
  end loop;
  foreach v_function in array array['issue_booking_access(text,text,jsonb)','hold_agent_booking(text,jsonb,jsonb)',
    'read_native_booking_access(text,text)','confirm_agent_booking(text,boolean)','change_native_booking(text,jsonb)',
    'claim_booking_updates(uuid,boolean,boolean,integer)','finish_booking_update(uuid,text,text,text)'] loop
    perform pg_temp.ba_assert(not has_function_privilege('anon', 'public.' || v_function, 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.' || v_function, 'EXECUTE')
      and has_function_privilege('service_role', 'public.' || v_function, 'EXECUTE'), 'restricted RPC ' || v_function);
  end loop;
end $$;
set local role authenticated;
select pg_temp.ba_expect('select * from public.business_booking_access', 'permission denied for table business_booking_access');
select pg_temp.ba_expect($$select public.read_native_booking_access(repeat('0',64), 'manage')$$,
  'permission denied for function read_native_booking_access');
reset role;

-- One durable hold, stable idempotency and original tokens on retry.
select pg_temp.ba_assert(public.hold_agent_booking('ba-site', pg_temp.ba_booking('ba_main', 2), pg_temp.ba_access(1))->>'status' = 'recorded', 'hold created');
select pg_temp.ba_assert((select status = 'held' and origin = 'agent' and buffer_minutes = 15
  from public.business_bookings where id = pg_temp.ba_id('ba_main')), 'held in the one booking store');
select pg_temp.ba_assert((select r->>'status' = 'unchanged' and r#>>'{access,manage_hash}' = pg_temp.ba_access(1)->>'manageHash'
  from (select public.hold_agent_booking('ba-site', pg_temp.ba_booking('ba_main', 2), pg_temp.ba_access(2)) r) x), 'retry retains original access');
select pg_temp.ba_assert((select count(*) from public.business_booking_history where booking_id = pg_temp.ba_id('ba_main')) = 1, 'retry adds no history');
select pg_temp.ba_expect($$select public.hold_agent_booking('ba-site', pg_temp.ba_booking('ba_main',2,
  jsonb_build_object('requestFingerprint',repeat('b',64))), pg_temp.ba_access(2))$$, 'booking_request_conflict');
select pg_temp.ba_assert(public.hold_agent_booking('ba-site', pg_temp.ba_booking('ba_overlap', 2,
  jsonb_build_object('start', now() + interval '2 days 35 minutes', 'end', now() + interval '2 days 65 minutes')), pg_temp.ba_access(2))->>'status' = 'conflict', 'buffer excludes another hold');
select pg_temp.ba_assert(not exists(select 1 from public.business_bookings where legacy_id = 'ba_overlap')
  and (select count(*) from public.business_booking_access) = 1, 'conflict leaves no hold or access');
select pg_temp.ba_expect($$select public.hold_agent_booking('missing-fixture',pg_temp.ba_booking('missing',3),pg_temp.ba_access(2))$$, 'booking_unknown_tenant');
select pg_temp.ba_expect($$select public.hold_agent_booking('ba-site',pg_temp.ba_booking('invalid',3,'{"status":"confirmed"}'),pg_temp.ba_access(2))$$, 'booking_invalid');

-- GET/read lookup is side-effect free. Tokens cannot substitute for each other
-- and neither hashes nor encrypted credentials are returned by public reads.
create temporary table ba_snapshot on commit drop as select
  (select jsonb_agg(to_jsonb(b) order by b.id) from public.business_bookings b) as bookings,
  (select jsonb_agg(to_jsonb(a) order by a.booking_id) from public.business_booking_access a) as access,
  (select jsonb_agg(to_jsonb(h) order by h.id) from public.business_booking_history h) as history;
select pg_temp.ba_assert((select r->>'status' = 'held' and (r->>'confirmationRequired')::boolean
  and r->>'agentName' = 'Fixture assistant' and not (r ?| array['manageHash','manageCiphertext','confirmHash','confirmCiphertext','statusHash','statusCiphertext'])
  from (select public.read_native_booking_access(pg_temp.ba_access(1)->>'confirmHash','confirm') r) x), 'GET previews confirmation without secrets');
select pg_temp.ba_assert(public.read_native_booking_access(pg_temp.ba_access(1)->>'manageHash','manage')->>'status' = 'held', 'manage read');
select pg_temp.ba_assert(public.read_native_booking_access(pg_temp.ba_access(1)->>'statusHash','status')->>'status' = 'held', 'status read');
select pg_temp.ba_assert(public.read_native_booking_access(pg_temp.ba_access(1)->>'statusHash','manage') is null
  and public.read_native_booking_access(pg_temp.ba_access(1)->>'confirmHash','manage') is null
  and public.read_native_booking_access(pg_temp.ba_access(1)->>'manageHash','confirm') is null
  and public.read_native_booking_access('malformed','confirm') is null
  and public.read_native_booking_access(null,'confirm') is null, 'read token purposes separated');
select pg_temp.ba_expect($$select public.confirm_agent_booking(pg_temp.ba_access(1)->>'manageHash',false)$$,'booking_not_found');
select pg_temp.ba_expect($$select public.confirm_agent_booking(pg_temp.ba_access(1)->>'statusHash',false)$$,'booking_not_found');
select pg_temp.ba_expect($$select public.change_native_booking(pg_temp.ba_access(1)->>'confirmHash','{"action":"cancel"}')$$,'booking_not_found');
select pg_temp.ba_expect($$select public.change_native_booking(pg_temp.ba_access(1)->>'statusHash','{"action":"cancel"}')$$,'booking_not_found');
select pg_temp.ba_assert((select bookings = (select jsonb_agg(to_jsonb(b) order by b.id) from public.business_bookings b)
  and access = (select jsonb_agg(to_jsonb(a) order by a.booking_id) from public.business_booking_access a)
  and history = (select jsonb_agg(to_jsonb(h) order by h.id) from public.business_booking_history h) from ba_snapshot), 'reads and rejected credentials wrote nothing');

-- POST confirmation consumes once. Force-request keeps agent confirmation from
-- silently bypassing an owner decision even with instant tenant settings.
select pg_temp.ba_assert(public.confirm_agent_booking(pg_temp.ba_access(1)->>'confirmHash',false)#>>'{booking,status}' = 'confirmed', 'POST confirms');
select pg_temp.ba_assert(public.confirm_agent_booking(pg_temp.ba_access(1)->>'confirmHash',false)->>'status' = 'unchanged', 'POST retry unchanged');
select pg_temp.ba_assert((select count(*) from public.business_booking_history where booking_id = pg_temp.ba_id('ba_main')
  and from_status = 'held' and to_status = 'confirmed' and actor = 'visitor') = 1, 'confirmation history once');
select pg_temp.ba_assert((select confirmed_at is not null from public.business_booking_access where booking_id = pg_temp.ba_id('ba_main')), 'confirmation consumed');
select public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_request',3),pg_temp.ba_access(2));
select pg_temp.ba_assert(public.confirm_agent_booking(pg_temp.ba_access(2)->>'confirmHash',true)#>>'{booking,status}' = 'requested','forced owner request');
update public.booking_settings set mode = 'request' where calendar_key = 'ca000000-0000-4000-8000-0000000000b1';
select public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_mode',4),pg_temp.ba_access(3));
select pg_temp.ba_assert(public.confirm_agent_booking(pg_temp.ba_access(3)->>'confirmHash',false)#>>'{booking,status}' = 'requested','tenant request mode');
update public.booking_settings set mode = 'instant' where calendar_key = 'ca000000-0000-4000-8000-0000000000b1';

-- Expired holds cannot confirm, and retrying the request never reopens them.
select public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_expired',5,jsonb_build_object('createdAt',now()-interval '16 minutes')),pg_temp.ba_access(4));
select pg_temp.ba_expect($$select public.confirm_agent_booking(pg_temp.ba_access(4)->>'confirmHash',false)$$,'booking_hold_expired');
select pg_temp.ba_assert((public.expire_booking_holds(clock_timestamp())->>'expired')::integer = 1,'expired hold released');
select pg_temp.ba_assert(public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_expired',5),pg_temp.ba_access(40))#>>'{booking,status}' = 'cancelled','retry cannot resurrect expired hold');
select pg_temp.ba_expect($$select public.confirm_agent_booking(pg_temp.ba_access(4)->>'confirmHash',false)$$,'booking_hold_expired');
select pg_temp.ba_assert(public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_retake',5),pg_temp.ba_access(5))->>'status' = 'recorded','expired slot reusable');

-- Pause blocks new work and reschedules while preserving confirmation and
-- cancellation for commitments already made.
do $$
declare v_ws uuid := (select id from ba_ws where name='site'); v_sys uuid := gen_random_uuid(); v_rev uuid := gen_random_uuid();
begin
  insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
    values(v_sys,v_ws,'Bookings','booking',gen_random_uuid(),repeat('c',64),'ca000000-0000-4000-8000-0000000000e1','ca000000-0000-4000-8000-0000000000e1');
  insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
    values(v_rev,v_sys,v_ws,1,'{"kind":"schedule","ref":"work:fixture"}',gen_random_uuid(),repeat('d',64),'ca000000-0000-4000-8000-0000000000e1');
  update public.systems set current_revision_id=v_rev,current_revision_number=1,lifecycle='live' where id=v_sys;
  update public.systems set lifecycle='paused' where id=v_sys;
end $$;
select pg_temp.ba_expect($$select public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_paused',6),pg_temp.ba_access(6))$$,'booking_paused');
select pg_temp.ba_assert(public.confirm_agent_booking(pg_temp.ba_access(5)->>'confirmHash',false)#>>'{booking,status}' = 'confirmed','existing hold confirms while paused');
select pg_temp.ba_expect($$select public.change_native_booking(pg_temp.ba_access(5)->>'manageHash',jsonb_build_object('action','reschedule',
  'start',now()+interval '6 days','end',now()+interval '6 days 30 minutes','forceRequest',false))$$,'booking_paused');
select pg_temp.ba_assert(public.change_native_booking(pg_temp.ba_access(5)->>'manageHash','{"action":"cancel"}')->>'status' = 'cancelled','existing booking cancels while paused');
select public.change_native_booking(pg_temp.ba_access(5)->>'manageHash','{"action":"cancel"}');
select pg_temp.ba_assert((select count(*) from public.business_booking_history where booking_id=pg_temp.ba_id('ba_retake') and to_status='cancelled') = 1,'cancel retry history once');
update public.systems set lifecycle='live' where business_workspace_id=(select id from ba_ws where name='site') and kind='booking';
select pg_temp.ba_expect($$select public.change_native_booking(pg_temp.ba_access(1)->>'manageHash',jsonb_build_object('action','reschedule',
  'start',now()+interval '3 days','end',now()+interval '3 days 30 minutes','forceRequest',false))$$,'booking_slot_taken');
select pg_temp.ba_assert((select start_at = now()+interval '2 days' and end_at = now()+interval '2 days 30 minutes'
  and status = 'confirmed' from public.business_bookings where id=pg_temp.ba_id('ba_main')),'failed reschedule retains original slot');

-- Ten holds per tenant per hour, including cancelled/expired attempts. A
-- different tenant can use the same id/slot and its own hourly allowance.
do $$
declare v_count integer := (select count(*) from public.business_bookings where calendar_key='ca000000-0000-4000-8000-0000000000b1' and origin='agent'); v_i integer;
begin
  for v_i in v_count+1..10 loop
    perform pg_temp.ba_assert(public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_cap_'||v_i,10+v_i),pg_temp.ba_access(10+v_i))->>'status'='recorded','allow holds up to tenant cap');
  end loop;
end $$;
select pg_temp.ba_expect($$select public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_cap_11',30),pg_temp.ba_access(30))$$,'booking_agent_limit');
select pg_temp.ba_assert(public.hold_agent_booking('ba-site',pg_temp.ba_booking('ba_main',2),pg_temp.ba_access(31))->>'status'='unchanged','retry still works at cap');
select pg_temp.ba_assert(public.hold_agent_booking('ba-other',pg_temp.ba_booking('ba_main',2),pg_temp.ba_access(32))->>'status'='recorded','other tenant has independent cap and calendar');
select pg_temp.ba_assert(public.read_workspace_booking((select id from ba_ws where name='other'),pg_temp.ba_id('ba_main')) is null,'cross-workspace read refused');

-- Lifecycle claims are one attempt per event/audience; owner and agent flags
-- gate eligibility, and failed/suppressed delivery never becomes retryable.
create temporary table ba_claim on commit drop as select value as c from jsonb_array_elements(
  public.claim_booking_updates(pg_temp.ba_id('ba_main'),false,false,50));
select pg_temp.ba_assert((select count(*) from ba_claim)=1 and (select c->>'audience' from ba_claim)='customer','customer confirmation claimed');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_main'),false,false,50)='[]'::jsonb,'customer event claimed once');
select public.finish_booking_update((select (c->>'messageId')::uuid from ba_claim),'suppressed',null,'email gate off');
select public.finish_booking_update((select (c->>'messageId')::uuid from ba_claim),'sent','should-not-overwrite',null);
select pg_temp.ba_assert((select status='suppressed' and provider_message_id is null from public.business_booking_updates
  where id=(select (c->>'messageId')::uuid from ba_claim)),'terminal delivery result retained');
select pg_temp.ba_assert(jsonb_array_length(public.claim_booking_updates(pg_temp.ba_id('ba_main'),true,false,50))=1,'owner confirmation only with flag');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_main'),true,true,50)='[]'::jsonb,'owner and customer claimed once; old held status skipped');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_cap_10'),true,false,50)='[]'::jsonb,'agent held notification disabled');
select pg_temp.ba_assert(jsonb_array_length(public.claim_booking_updates(pg_temp.ba_id('ba_cap_10'),false,true,50))=1,'agent held confirmation enabled');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_cap_10'),true,true,50)='[]'::jsonb,'held never notifies owner and customer claimed once');
select pg_temp.ba_assert(jsonb_array_length(public.claim_booking_updates(pg_temp.ba_id('ba_retake'),true,true,50))=2,'cancellation current event to customer and owner');
select pg_temp.ba_expect($$select public.claim_booking_updates(null,true,true,0)$$,'booking_invalid');
select pg_temp.ba_expect($$select public.claim_booking_updates(null,true,true,201)$$,'booking_invalid');
select pg_temp.ba_expect($$select public.finish_booking_update(gen_random_uuid(),'claimed',null,null)$$,'booking_invalid');

-- Historical events, backfills, imports, elapsed appointments and automatic
-- request lapse never turn into new lifecycle mail after migration.
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_history',40,'{"status":"confirmed","origin":"site"}'),'native');
delete from public.business_booking_history where booking_id=pg_temp.ba_id('ba_history');
insert into public.business_booking_history(booking_id,actor,to_status,at)
  values(pg_temp.ba_id('ba_history'),'visitor','confirmed',(select starts_at-interval '1 second' from public.business_booking_update_epoch));
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_history'),true,true,50)='[]'::jsonb,'pre-migration history excluded');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_backfill',41,'{"status":"confirmed","origin":"site"}'),'backfill');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_backfill'),true,true,50)='[]'::jsonb,'backfill excluded');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_import',42,'{"status":"confirmed","origin":"import","externalSource":"calendly","externalRef":"https://api.calendly.com/invitees/fixture"}'),'import');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_import'),true,true,50)='[]'::jsonb,'import excluded');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_past',-1,'{"status":"confirmed","origin":"site"}'),'native');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_past'),true,true,50)='[]'::jsonb,'past booking excluded');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_lapse',43,'{"status":"declined","origin":"site","reason":"Expired without owner response"}'),'native');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_lapse'),true,true,50)='[]'::jsonb,'request expiry lifecycle mail excluded');

-- Booking setup is tenant-bound, optimistic and owner-approved before instant.
insert into public.users(id,email,verified_at) values('ca000000-0000-4000-8000-0000000000e2','ba-owner@example.test',now());
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values((select id from ba_ws where name='site'),'ca000000-0000-4000-8000-0000000000e2','owner','ca000000-0000-4000-8000-0000000000e1');
select pg_temp.ba_expect($q$select public.read_booking_setup((select id from ba_ws where name='other'),'ba-site','ca000000-0000-4000-8000-0000000000e2','ba-owner@example.test')$q$,'booking_not_found');
select pg_temp.ba_expect($q$select public.read_booking_setup((select id from ba_ws where name='site'),'ba-site','ca000000-0000-4000-8000-0000000000e2','wrong@example.test')$q$,'booking_settings_denied');
create temporary table ba_setup on commit drop as select public.configure_booking_setup((select id from ba_ws where name='site'),'ba-site',
 'ca000000-0000-4000-8000-0000000000e2','ba-owner@example.test',jsonb_build_object('mode','instant','expectedRevision',
 (select revision from public.booking_settings where calendar_key='ca000000-0000-4000-8000-0000000000b1'),
 'bufferMinutes',20,'minNoticeMinutes',120,'maxAdvanceDays',40,'maxPerDay',5,'cancellationCutoffHours',12)) as r;
select pg_temp.ba_assert((select (r->>'approvalRequired')::boolean from ba_setup) and (select mode='request' and buffer_minutes=20 from public.booking_settings where calendar_key='ca000000-0000-4000-8000-0000000000b1'),'instant setup stays request pending owner');
select pg_temp.ba_expect($q$select public.configure_booking_setup((select id from ba_ws where name='site'),'ba-site','ca000000-0000-4000-8000-0000000000e2','ba-owner@example.test','{"expectedRevision":0,"mode":"request"}')$q$,'booking_settings_stale');
select public.decide_booking_instant_policy((select id from ba_ws where name='site'),(select (r->>'policyId')::uuid from ba_setup),1,'approve','ca000000-0000-4000-8000-0000000000e2','ba-owner@example.test',false);
select pg_temp.ba_assert((select mode='instant' from public.booking_settings where calendar_key='ca000000-0000-4000-8000-0000000000b1'),'owner standing approval switches to instant');
select public.upsert_tenant_booking_settings('ba-site','{"mode":"instant","bufferMinutes":0,"minNoticeMinutes":0,"maxAdvanceDays":60}','dual_write');
select pg_temp.ba_assert((select mode='instant' and buffer_minutes=20 and min_notice_minutes=120 and max_advance_days=40 and max_per_day=5 from public.booking_settings where calendar_key='ca000000-0000-4000-8000-0000000000b1'),'legacy mirrors preserve native policy controls');
select pg_temp.ba_assert(not has_function_privilege('authenticated','public.configure_booking_setup(uuid,text,uuid,text,jsonb)','execute') and not has_table_privilege('service_role','public.booking_instant_policies','SELECT'),'setup authorization is only via scoped RPC');

-- Calendar projection resolves verified owner authority; takes one lease and
-- keeps provider work separate from authoritative booking data.
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by)
 values((select id from ba_ws where name='site'),'google','fixture-calendar','Fixture calendar','America/New_York','connected','ca000000-0000-4000-8000-0000000000e2');
create temporary table ba_mirror on commit drop as select public.prepare_booking_calendar_mirror(pg_temp.ba_id('ba_main'),'ca000000-0000-4000-8000-0000000000a1') as r;
select pg_temp.ba_assert((select r->>'provider'='google' and r->>'userId'='ca000000-0000-4000-8000-0000000000e2' from ba_mirror),'projection uses verified owner');
select pg_temp.ba_assert(public.prepare_booking_calendar_mirror(pg_temp.ba_id('ba_main'),'ca000000-0000-4000-8000-0000000000a2') is null,'second mirror claimant refused');
select pg_temp.ba_expect($q$select public.finish_booking_calendar_mirror(pg_temp.ba_id('ba_main'),'ca000000-0000-4000-8000-0000000000a2','verified','wrong-event',null)$q$,'booking_calendar_claim_lost');
select pg_temp.ba_assert((select external_event_id is null from public.business_booking_calendar_mirrors where booking_id=pg_temp.ba_id('ba_main')),'wrong lease cannot finish');
select public.finish_booking_calendar_mirror(pg_temp.ba_id('ba_main'),'ca000000-0000-4000-8000-0000000000a1','verified','fixture-event',null);
select pg_temp.ba_assert((select status='confirmed' from public.business_bookings where id=pg_temp.ba_id('ba_main')),'calendar evidence never changes booking authority');
select pg_temp.ba_assert(not has_function_privilege('authenticated','public.prepare_booking_calendar_mirror(uuid,uuid)','execute'),'mirror RPC not public');

-- Inquiry offers: GET does not reserve, tokens cross no tenant identity,
-- chosen times request owner approval, retry is stable and expiry fails closed.
-- An offer must name a current business-record service, never a copied label.
insert into public.business_services(workspace_id,name,external_ref,duration_minutes,active,source,created_by,updated_by)
 select id,'Consultation','consultation',30,true,'owner','ca000000-0000-4000-8000-0000000000e2','ca000000-0000-4000-8000-0000000000e2' from ba_ws where name='site';
create temporary table ba_offer on commit drop as select public.issue_inquiry_booking_offer('ba-site',jsonb_build_object('inquiryId','fixture-inquiry','key','receipt',
 'customer',jsonb_build_object('name','Dana','email','dana@example.test'),'serviceId','consultation','serviceName','Consultation','timeZone','America/New_York',
 'bufferMinutes',15,'slots',jsonb_build_array(jsonb_build_object('start',now()+interval '50 days','end',now()+interval '50 days 30 minutes')),
 'tokenHash',repeat('c',64),'tokenCiphertext','enc:v1:fixture','expiresAt',now()+interval '72 hours')) as r;
select pg_temp.ba_assert(public.read_inquiry_booking_receipt('ba-other','fixture-inquiry') is null,'other tenant cannot read receipt offer');
select pg_temp.ba_assert(public.read_inquiry_booking_offer(repeat('d',64)) is null and public.read_inquiry_booking_offer(repeat('c',64))->>'booking_id' is null,'offer read reserves nothing');
select pg_temp.ba_assert(public.choose_inquiry_booking_offer(repeat('c',64),now()+interval '50 days',pg_temp.ba_access(50))#>>'{booking,status}'='requested','choice makes an owner request');
select pg_temp.ba_assert(public.choose_inquiry_booking_offer(repeat('c',64),now()+interval '50 days',pg_temp.ba_access(51))->>'status'='unchanged','choice retry stable');
select pg_temp.ba_expect($q$select public.choose_inquiry_booking_offer(repeat('c',64),now()+interval '51 days',pg_temp.ba_access(51))$q$,'booking_request_conflict');
update public.booking_inquiry_offers set expires_at=clock_timestamp()-interval '1 second' where token_hash=repeat('c',64);
select pg_temp.ba_assert(public.read_inquiry_booking_offer(repeat('c',64)) is null,'expired offer cannot be opened');
select pg_temp.ba_expect($q$select public.choose_inquiry_booking_offer(repeat('c',64),now()+interval '50 days',pg_temp.ba_access(51))$q$,'booking_not_found');
select pg_temp.ba_assert(not has_function_privilege('anon','public.choose_inquiry_booking_offer(text,timestamptz,jsonb)','execute'),'inquiry choice service-role only');

-- Same-status receipt reschedules write one history event and both update audiences.
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_receipt_move',55,'{"status":"confirmed","origin":"site"}'),'native');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_receipt_move',56,'{"status":"confirmed","origin":"site"}'),'native');
select pg_temp.ba_assert((select count(*) from public.business_booking_history where booking_id=pg_temp.ba_id('ba_receipt_move') and reason='Customer rescheduled')=1,'reschedule history recorded');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_receipt_move',56,'{"status":"confirmed","origin":"site"}'),'native');
select pg_temp.ba_assert((select count(*) from public.business_booking_history where booking_id=pg_temp.ba_id('ba_receipt_move') and reason='Customer rescheduled')=1,'reschedule retry does not duplicate history');
select pg_temp.ba_assert(public.read_booking_business_details('ba-site')->>'name'='Agent Fixture Firm','confirmation business name');
select pg_temp.ba_assert(not has_function_privilege('service_role','public.record_tenant_booking_before_w6(text,jsonb,text)','execute') and not has_function_privilege('anon','public.read_booking_business_details(text)','execute'),'wrapper and facts grants');

-- Native widget management mirrors its rollback row and restarts a request clock.
insert into public.bookings(id,tenant_id,service_id,service_name,date,start_time,end_time,client_name,client_email,client_phone,status)
 values('ba_widget_move','ba-site','consultation','Consultation',current_date+57,'09:00','09:30','Dana Reed','dana@example.test','','confirmed');
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_widget_move',57,'{"status":"confirmed","origin":"site"}'),'native');
select public.issue_booking_access('ba-site','ba_widget_move',pg_temp.ba_access(60));
update public.booking_settings set mode='request' where calendar_key='ca000000-0000-4000-8000-0000000000b1';
update public.business_bookings set created_at=clock_timestamp()-interval '4 days' where id=pg_temp.ba_id('ba_widget_move');
update public.booking_settings set buffer_minutes=20 where tenant_stable_id='ca000000-0000-4000-8000-0000000000b1';
select public.change_native_booking(lpad(to_hex(180),64,'0'),jsonb_build_object('action','reschedule','start',now()+interval '58 days','end',now()+interval '58 days 30 minutes','forceRequest',false));
select pg_temp.ba_assert((select buffer_minutes=20 and block_end_at=end_at+interval '20 minutes' from public.business_bookings where id=pg_temp.ba_id('ba_widget_move')),'reschedule uses current buffer policy');
select pg_temp.ba_assert((select requested_at>clock_timestamp()-interval '1 minute' from public.business_bookings where id=pg_temp.ba_id('ba_widget_move')),'reschedule starts fresh request clock');
select pg_temp.ba_assert((select date=((now()+interval '58 days') at time zone 'America/New_York')::date and status='requested' from public.bookings where id='ba_widget_move'),'legacy management row matches native');
select public.lapse_booking_requests(clock_timestamp(),500);
select pg_temp.ba_assert((select status='requested' from public.business_bookings where id=pg_temp.ba_id('ba_widget_move')),'old creation does not immediately lapse new request');
select public.claim_booking_messages(clock_timestamp(),500);
select pg_temp.ba_assert(not exists(select 1 from public.business_booking_messages where booking_id=pg_temp.ba_id('ba_widget_move') and kind='request_owner_reminder'),'new request does not inherit overdue chase');
select public.change_native_booking(lpad(to_hex(180),64,'0'),jsonb_build_object('action','reschedule','start',now()+interval '1 hour','end',now()+interval '90 minutes','forceRequest',false));
select public.change_native_booking(lpad(to_hex(180),64,'0'),'{"action":"cancel"}');
select pg_temp.ba_assert((select status='cancelled' and cancelled_at is not null from public.bookings where id='ba_widget_move'),'cancel mirrors legacy rollback row');
select pg_temp.ba_assert(exists(select 1 from public.business_booking_history where booking_id=pg_temp.ba_id('ba_widget_move') and reason='Customer cancelled after the cancellation cutoff'),'late cancellation recorded without blocking');
select pg_temp.ba_assert(not has_function_privilege('service_role','public.change_native_booking_before_w6(text,jsonb)','execute'),'native wrapper cannot be bypassed');

-- Native public receipts retain bearer management while owner decisions and
-- clock expiry follow the authoritative store, never provider read-back.
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,
 site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
select id,'ca000000-0000-4000-8000-0000000000b1','ba-site','Agent Fixture Firm','ba-native-public',repeat('1',64),
 'ca000000-0000-4000-8000-0000000000e2','ca000000-0000-4000-8000-0000000000e2' from ba_ws where name='site'
 and not exists(select 1 from public.offering_website_bindings where tenant_stable_id='ca000000-0000-4000-8000-0000000000b1' and status='active');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
select 'ca000000-0000-4000-8000-0000000000f1',id,'scheduling','schedule','Public Consultation',
 jsonb_build_object('version',1,'revision',0,'title','Public Consultation','createdBy','ca000000-0000-4000-8000-0000000000e2',
 'createdAt',now(),'history','[]'::jsonb,'availability','[]'::jsonb,'reservations','[]'::jsonb),
 'ca000000-0000-4000-8000-0000000000e2' from ba_ws where name='site';
insert into public.public_website_booking_grants(id,tenant_stable_id,business_workspace_id,work_id,capability_id,
 capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by)
select 'ca000000-0000-4000-8000-0000000000f2','ca000000-0000-4000-8000-0000000000b1',id,'ca000000-0000-4000-8000-0000000000f1',
 'consultation',1,'inquiries',1,'google','Consultation','America/New_York','ca000000-0000-4000-8000-0000000000e2' from ba_ws where name='site';
select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_native_public',59,jsonb_build_object(
 'publicReservationId','ca000000-0000-4000-8000-0000000000f3','serviceRef','consultation','status','requested','origin','site')),'native');
insert into public.public_website_bookings(id,grant_id,tenant_stable_id,tenant_id_at_reservation,business_workspace_id,work_id,
 capability_id,capability_version,provider,inquiry_id,request_id_hash,request_fingerprint,slot_id,slot_start_at,slot_end_at,
 calendar_request_id,management_token_hash,management_token_ciphertext,expected_revision,title,start_at,end_at,time_zone,status)
select 'ca000000-0000-4000-8000-0000000000f3','ca000000-0000-4000-8000-0000000000f2','ca000000-0000-4000-8000-0000000000b1','ba-site',id,
 'ca000000-0000-4000-8000-0000000000f1','consultation',1,'google','fixture-public-inquiry',repeat('e',64),repeat('f',64),'fixture-native-slot',
 now()+interval '59 days',now()+interval '59 days 30 minutes','fixture-native-request',repeat('2',64),'encrypted-native-public-manage',0,
 'Consultation',now()+interval '59 days',now()+interval '59 days 30 minutes','America/New_York','pending' from ba_ws where name='site';
select pg_temp.ba_assert((select booking_id=pg_temp.ba_id('ba_native_public') from public.public_website_bookings
 where id='ca000000-0000-4000-8000-0000000000f3'),'first receipt links prior store claim');
select pg_temp.ba_expect($q$select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_native_public',59,jsonb_build_object(
 'publicReservationId','ca000000-0000-4000-8000-0000000000f3','serviceRef','consultation','status','requested','origin','site','requestFingerprint',repeat('b',64))),'native')$q$,'booking_request_conflict');
select pg_temp.ba_assert(not (public.release_public_record_booking_claim('ba-site','ca000000-0000-4000-8000-0000000000f3')->>'released')::boolean,'durable receipt cannot release a placed request');
select public.decide_workspace_booking_request((select id from ba_ws where name='site'),pg_temp.ba_id('ba_native_public'),'approve','owner');
select pg_temp.ba_assert((select status='confirmed' from public.public_website_bookings where id='ca000000-0000-4000-8000-0000000000f3'),'owner confirmation syncs receipt');
update public.public_website_bookings set status='pending' where id='ca000000-0000-4000-8000-0000000000f3';
select pg_temp.ba_assert((select status='confirmed' from public.public_website_bookings where id='ca000000-0000-4000-8000-0000000000f3'),'stale receipt cannot undo confirmation');
update public.business_bookings set status='requested' where id=pg_temp.ba_id('ba_native_public');
select pg_temp.ba_assert((select requested_at>now()-interval '1 minute' from public.business_bookings where id=pg_temp.ba_id('ba_native_public')),'new request has fresh clock');
update public.business_bookings set requested_at=now()-interval '25 hours' where id=pg_temp.ba_id('ba_native_public');
select public.claim_booking_messages(clock_timestamp(),500);
select pg_temp.ba_assert(exists(select 1 from public.business_booking_messages where booking_id=pg_temp.ba_id('ba_native_public') and kind='request_owner_reminder'),'public request owner chase');
select public.lapse_booking_requests(now()+interval '48 hours',500);
select pg_temp.ba_assert((select status='declined' from public.business_bookings where id=pg_temp.ba_id('ba_native_public'))
 and (select status='cancelled' from public.public_website_bookings where id='ca000000-0000-4000-8000-0000000000f3'),'public request lapse closes receipt');

select public.record_tenant_booking('ba-site',pg_temp.ba_booking('ba_public_ghost',60,jsonb_build_object(
 'publicReservationId','ca000000-0000-4000-8000-0000000000f4','serviceRef','consultation','status','held','origin','site')),'native');
select pg_temp.ba_assert(not (public.release_public_record_booking_claim('ba-other','ca000000-0000-4000-8000-0000000000f4')->>'released')::boolean,'other tenant cannot release a claim');
select pg_temp.ba_assert((public.release_public_record_booking_claim('ba-site','ca000000-0000-4000-8000-0000000000f4')->>'released')::boolean,'unplaced claim releases');
select pg_temp.ba_assert((select status='cancelled' from public.business_bookings where id=pg_temp.ba_id('ba_public_ghost')),'unplaced claim releases its slot');
select pg_temp.ba_assert(public.claim_booking_updates(pg_temp.ba_id('ba_public_ghost'),true,true,100) = '[]'::jsonb,'unplaced claim never sends a cancellation');
select pg_temp.ba_assert(not (public.release_public_record_booking_claim('ba-site','ca000000-0000-4000-8000-0000000000f4')->>'released')::boolean,'release replay changes nothing');
select pg_temp.ba_assert(public.read_tenant_booking_policy('ba-site')->>'tenantStableId'='ca000000-0000-4000-8000-0000000000b1'
 and not (public.read_tenant_booking_policy('ba-site') ? 'hours'),'fresh policy contains no record facts');
select pg_temp.ba_assert(not has_function_privilege('authenticated','public.release_public_record_booking_claim(text,uuid)','execute')
 and not has_function_privilege('anon','public.read_tenant_booking_policy(text)','execute'),'recovery and policy RPCs service-role only');

rollback;
