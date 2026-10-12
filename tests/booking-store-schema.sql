\set ON_ERROR_STOP on
-- One booking store (20261008141000_booking_store.sql). Fictional tenants only.
-- Runs in the focused workspace cluster after the business record, Systems,
-- public booking and tenant lead migrations.
begin;
create or replace function pg_temp.bk_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking store assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.bk_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
-- A booking payload: start/end in UTC, America/New_York.
create or replace function pg_temp.bk(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('status', 'confirmed', 'origin', 'legacy', 'serviceRef', 'svc-consult', 'serviceName', 'Consultation',
    'timeZone', 'America/New_York', 'bufferMinutes', 15,
    'customer', jsonb_build_object('name', 'Dana Reed', 'email', 'Dana@Example.test', 'phone', '716-555-0100'),
    'createdAt', '2026-10-01T12:00:00Z') || extra
$$;

insert into public.users(id, email, verified_at) values
  ('b0000000-0000-4000-8000-0000000000e1', 'bk-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('b0000000-0000-4000-8000-0000000000e1', 'bk-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('bk-site', 'b0000000-0000-4000-8000-0000000000b1', 'Mooney Firm', true),
  ('bk-other', 'b0000000-0000-4000-8000-0000000000b2', 'Other Booking Site', true),
  ('bk-plain', 'b0000000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

-- bk-site and bk-other become businesses with record hours and services.
create temporary table bk_ws(name text primary key, id uuid) on commit drop;
insert into bk_ws select 'site', (public.convert_tenant_to_business('bk-operator@strelva.example.test', 'bk-site',
  '{"tenantId":"bk-site","tenantStableId":"b0000000-0000-4000-8000-0000000000b1","workspaceName":"Mooney Firm","billing":null,"account":null,
    "patch":{"facts":{"phone":{"value":"716-555-0199","verified":false},
      "hours":{"value":{"timezone":"America/New_York","weekly":[{"day":5,"opens":"09:00","closes":"15:00"}]},"verified":false}},
      "services":[{"op":"upsert","name":"Consultation","durationMinutes":30,"active":true,"position":0,"externalRef":"svc-consult"}]},
    "contacts":[]}',
  'b0000000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into bk_ws select 'other', (public.convert_tenant_to_business('bk-operator@strelva.example.test', 'bk-other',
  '{"tenantId":"bk-other","tenantStableId":"b0000000-0000-4000-8000-0000000000b2","workspaceName":"Other Booking Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'b0000000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;

-- Locked down.
select pg_temp.bk_assert((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.business_bookings'::regclass, 'public.business_booking_history'::regclass, 'public.booking_settings'::regclass)), 'rls on');
select pg_temp.bk_assert(not has_table_privilege('anon', 'public.business_bookings', 'select')
  and not has_table_privilege('authenticated', 'public.business_bookings', 'select')
  and not has_table_privilege('service_role', 'public.business_bookings', 'insert')
  and not has_table_privilege('service_role', 'public.booking_settings', 'select')
  and not has_table_privilege('service_role', 'public.business_booking_history', 'select'), 'no direct table access');
select pg_temp.bk_assert(not has_function_privilege('anon', 'public.record_tenant_booking(text,jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_tenant_bookings(text,date,date)', 'execute')
  and not has_function_privilege('authenticated', 'public.decide_workspace_booking_request(uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.booking_tenant(text)', 'execute')
  and has_function_privilege('service_role', 'public.record_tenant_booking(text,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_booking_context(text)', 'execute')
  and has_function_privilege('service_role', 'public.read_workspace_booking_requests(uuid)', 'execute'), 'function grants');

-- Context: read from the record at use, never copied.
select pg_temp.bk_assert((select c->'hours' = 'null'::jsonb and c->'services' = '[]'::jsonb and c->'settings' = 'null'::jsonb
    and c->>'workspaceId' is null and (c->>'paused')::boolean = false
  from (select public.read_tenant_booking_context('bk-plain') c) x), 'unconverted site has no record facts');
select pg_temp.bk_assert((select c#>>'{hours,timezone}' = 'America/New_York' and c#>>'{hours,weekly,0,closes}' = '15:00'
    and c#>>'{services,0,externalRef}' = 'svc-consult' and (c#>>'{services,0,durationMinutes}')::int = 30
    and c->>'phone' = '716-555-0199' and (c->>'workspaceId')::uuid = (select id from bk_ws where name = 'site')
  from (select public.read_tenant_booking_context('bk-site') c) x), 'converted site reads its record');
select pg_temp.bk_assert(public.read_tenant_booking_context('no-such-site') is null, 'unknown tenant');
-- Friday hours change in the record: the next read sees it, nothing booking-side changes.
update public.business_record_facts set value = '{"timezone":"America/New_York","weekly":[{"day":5,"opens":"09:00","closes":"14:00"}]}'
  where workspace_id = (select id from bk_ws where name = 'site') and fact_key = 'hours';
select pg_temp.bk_assert(public.read_tenant_booking_context('bk-site')#>>'{hours,weekly,0,closes}' = '14:00', 'hours read at use');

-- Settings.
select pg_temp.bk_assert(public.upsert_tenant_booking_settings('bk-site',
  '{"mode":"request","bufferMinutes":15,"minNoticeMinutes":1440,"maxAdvanceDays":60,"defaultLengthMinutes":60,"timezone":"America/New_York",
    "bookableHours":[{"day":5,"opens":"10:00","closes":"12:00"}],"legacyRequiresPayment":true}', 'backfill')->>'status' = 'recorded', 'settings recorded');
select pg_temp.bk_assert((public.upsert_tenant_booking_settings('bk-site', '{"mode":"instant","bufferMinutes":10}', 'dual_write')->>'revision')::int = 2, 'settings replaced');
select pg_temp.bk_assert((select c#>>'{settings,mode}' = 'instant' and (c#>>'{settings,bufferMinutes}')::int = 10
  from (select public.read_tenant_booking_context('bk-site') c) x), 'settings read back');
select pg_temp.bk_expect($$select public.upsert_tenant_booking_settings('bk-site', '{"mode":"always"}', 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.upsert_tenant_booking_settings('bk-site', '{"bufferMinutes":999}', 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.upsert_tenant_booking_settings('no-such-site', '{}', 'dual_write')$$, 'booking_unknown_tenant');

-- A legacy widget booking: Friday Nov 6 2026, 10:00-10:30 New York (15:00Z).
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_1","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z","notes":"x"}'),
  'dual_write')->>'status' = 'recorded', 'legacy booking recorded');
select pg_temp.bk_assert((select b.business_service_id is not null and b.contact_id is not null and b.customer_email = 'dana@example.test'
    and b.workspace_id = (select id from bk_ws where name = 'site') and b.block_end_at = '2026-11-06T15:45:00Z'
  from public.business_bookings b where legacy_id = 'bk_1'), 'service, contact, workspace and buffer resolved');
select pg_temp.bk_assert((select 'booking' = any(sources) from public.business_contacts where email = 'dana@example.test'), 'contact source booking');
select pg_temp.bk_assert((select count(*) from public.business_booking_history h join public.business_bookings b on b.id = h.booking_id
  where b.legacy_id = 'bk_1' and h.from_status is null and h.to_status = 'confirmed' and h.actor = 'visitor') = 1, 'history row');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_1","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'),
  'backfill')->>'status' = 'unchanged', 'replay is a no-op');

-- One slot, one booking, across both route families.
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"site","publicReservationId":"b0000000-0000-4000-8000-0000000000d1",
  "start":"2026-11-06T15:15:00Z","end":"2026-11-06T15:45:00Z"}'), 'native')->>'status' = 'conflict', 'API reservation refused on a widget slot');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"site","publicReservationId":"b0000000-0000-4000-8000-0000000000d1",
  "start":"2026-11-06T15:40:00Z","end":"2026-11-06T16:10:00Z"}'), 'native')->>'status' = 'conflict', 'buffer after the widget booking is held');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"site","publicReservationId":"b0000000-0000-4000-8000-0000000000d1",
  "start":"2026-11-06T15:45:00Z","end":"2026-11-06T16:15:00Z"}'), 'native')->>'status' = 'recorded', 'next free slot after the buffer');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_2","start":"2026-11-06T16:00:00Z","end":"2026-11-06T16:30:00Z"}'),
  'dual_write')->>'status' = 'conflict', 'widget booking refused on an API slot');
-- A held or requested booking holds the slot too.
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_held","status":"held","start":"2026-11-13T15:00:00Z","end":"2026-11-13T15:30:00Z"}'),
  'native')->>'status' = 'recorded', 'held');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_3","start":"2026-11-13T15:00:00Z","end":"2026-11-13T15:30:00Z"}'),
  'dual_write')->>'status' = 'conflict', 'held slot refused');
-- Concurrent writers: the constraint itself refuses an overlap, even without the function.
select pg_temp.bk_expect($$insert into public.business_bookings(calendar_key, tenant_stable_id, status, origin, service_name_at_booking,
    start_at, end_at, block_end_at, time_zone, customer_name, recorded_via, created_at)
  values ('b0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-0000000000b1', 'confirmed', 'site', 'Consultation',
    '2026-11-06T15:10:00Z', '2026-11-06T15:20:00Z', '2026-11-06T15:20:00Z', 'America/New_York', 'Race', 'native', now())$$,
  'conflicting key value violates exclusion constraint "business_bookings_one_slot"');

-- Cancelling frees the slot; the cancellation is history.
select pg_temp.bk_assert(public.set_tenant_booking_status('bk-site', 'bk_1', 'cancelled', 'owner', 'Client called')->>'status' = 'updated', 'cancelled');
select pg_temp.bk_assert((select cancelled_at is not null from public.business_bookings where legacy_id = 'bk_1'), 'cancelled_at stamped');
select pg_temp.bk_assert((select count(*) from public.business_booking_history h join public.business_bookings b on b.id = h.booking_id
  where b.legacy_id = 'bk_1' and h.from_status = 'confirmed' and h.to_status = 'cancelled' and h.reason = 'Client called') = 1, 'cancel history');
select pg_temp.bk_assert(public.set_tenant_booking_status('bk-site', 'bk_1', 'cancelled', 'owner', null)->>'status' = 'unchanged', 'cancel twice is a no-op');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_4","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'),
  'dual_write')->>'status' = 'recorded', 'freed slot taken again');
-- Re-confirming the cancelled booking onto a taken slot is refused, not forced.
select pg_temp.bk_assert(public.set_tenant_booking_status('bk-site', 'bk_1', 'confirmed', 'owner', null)->>'status' = 'conflict', 'reconfirm onto a taken slot refused');

-- Calendly imports are always kept, even overlapping, and dedupe on the invitee.
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"import","externalSource":"calendly","externalRef":"https://api.calendly.com/invitees/1",
  "start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'), 'import')->>'status' = 'recorded', 'calendly kept');
select pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"import","externalSource":"calendly","externalRef":"https://api.calendly.com/invitees/1",
  "status":"cancelled","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z","cancelledAt":"2026-11-02T10:00:00Z"}'), 'import')->>'status' = 'updated', 'calendly cancel updates the same booking');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"origin":"import","legacyId":"x","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'), 'import')$$, 'booking_invalid');

-- Per business: another tenant's calendar is separate and its bookings are not reachable.
select pg_temp.bk_assert(public.record_tenant_booking('bk-other', pg_temp.bk('{"legacyId":"bk_1","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'),
  'dual_write')->>'status' = 'recorded', 'same time on another calendar');
select pg_temp.bk_assert(public.set_tenant_booking_status('bk-other', 'bk_4', 'cancelled', 'owner', null)->>'status' = 'not_found', 'cannot change another tenant''s booking');
select pg_temp.bk_assert(public.set_tenant_booking_status('bk-other', (select id::text from public.business_bookings where legacy_id = 'bk_4'), 'cancelled', 'owner', null)->>'status' = 'not_found', 'nor by store id');
select pg_temp.bk_assert(jsonb_array_length(public.read_tenant_bookings('bk-other', null, null)) = 1, 'reads stay per tenant');
select pg_temp.bk_assert(public.read_tenant_booking_history('bk-other', 'bk_4') = '[]'::jsonb, 'history stays per tenant');

-- Reads by local date in the booking's own zone.
select pg_temp.bk_assert((select r#>>'{0,localDate}' = '2026-11-06' and r#>>'{0,localStart}' = '10:00' and r#>>'{0,localEnd}' = '10:30'
  from (select public.read_tenant_bookings('bk-site', '2026-11-06', '2026-11-06') r) x), 'local date and time');
select pg_temp.bk_assert(jsonb_array_length(public.read_tenant_bookings('bk-site', '2026-11-07', '2026-11-12')) = 0, 'range filter');
-- DST: Nov 1 2026 is the fall-back day in New York. 9:00 local is 14:00Z.
select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_dst","start":"2026-11-01T14:00:00Z","end":"2026-11-01T14:30:00Z"}'), 'backfill');
select pg_temp.bk_assert(public.read_tenant_bookings('bk-site', '2026-11-01', '2026-11-01')#>>'{0,localStart}' = '09:00', 'DST local time');

-- Booking requests through Needs you: per business, decided once.
select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_req","status":"requested","origin":"site","start":"2026-11-20T15:00:00Z","end":"2026-11-20T15:30:00Z"}'), 'native');
select pg_temp.bk_assert(jsonb_array_length(public.read_workspace_booking_requests((select id from bk_ws where name = 'site'))) = 1, 'request listed for its business');
select pg_temp.bk_assert(public.read_workspace_booking_requests((select id from bk_ws where name = 'other')) = '[]'::jsonb, 'not for another business');
select pg_temp.bk_expect(format($$select public.decide_workspace_booking_request(%L, %L, 'approve', 'owner')$$,
  (select id from bk_ws where name = 'other'), (select id from public.business_bookings where legacy_id = 'bk_req')), 'booking_not_found');
select pg_temp.bk_assert(public.decide_workspace_booking_request((select id from bk_ws where name = 'site'),
  (select id from public.business_bookings where legacy_id = 'bk_req'), 'approve', 'owner')#>>'{booking,status}' = 'confirmed', 'approved');
select pg_temp.bk_assert(public.decide_workspace_booking_request((select id from bk_ws where name = 'site'),
  (select id from public.business_bookings where legacy_id = 'bk_req'), 'not_yet', 'owner')->>'status' = 'already_decided', 'decided once');
select pg_temp.bk_assert((select count(*) from public.business_booking_history h join public.business_bookings b on b.id = h.booking_id
  where b.legacy_id = 'bk_req' and h.actor = 'owner' and h.to_status = 'confirmed') = 1, 'approval history');

-- Pause: the bookings System pauses; every booking stays as it was.
do $$
declare v_ws uuid := (select id from bk_ws where name = 'site'); v_sys uuid := gen_random_uuid(); v_rev uuid := gen_random_uuid();
  v_before text := (select string_agg(id::text || status, ',' order by id) from public.business_bookings);
begin
  insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by)
    values (v_sys, v_ws, 'Bookings', 'booking', gen_random_uuid(), repeat('c', 64), 'b0000000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-0000000000e1');
  insert into public.system_revisions(id, system_id, business_workspace_id, number, implementation, command_id, command_digest, created_by)
    values (v_rev, v_sys, v_ws, 1, '{"kind":"schedule","ref":"work:fixture"}', gen_random_uuid(), repeat('d', 64), 'b0000000-0000-4000-8000-0000000000e1');
  update public.systems set current_revision_id = v_rev, current_revision_number = 1, lifecycle = 'live' where id = v_sys;
  perform pg_temp.bk_assert((public.read_tenant_booking_context('bk-site')->>'paused')::boolean = false
    and (public.read_tenant_booking_context('bk-site')->>'systemId')::uuid = v_sys, 'live system');
  update public.systems set lifecycle = 'paused' where id = v_sys;
  perform pg_temp.bk_assert((public.read_tenant_booking_context('bk-site')->>'paused')::boolean, 'paused system');
  perform pg_temp.bk_assert(v_before = (select string_agg(id::text || status, ',' order by id) from public.business_bookings), 'pause changed no booking');
  -- A customer can still cancel while paused.
  perform pg_temp.bk_assert(public.set_tenant_booking_status('bk-site', 'bk_4', 'cancelled', 'visitor', 'Customer cancelled')->>'status' = 'updated', 'cancel while paused');
  perform pg_temp.bk_assert(public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bk_after","start":"2026-12-04T15:00:00Z","end":"2026-12-04T15:30:00Z"}'),
    'dual_write')->>'status' = 'recorded', 'booking while paused is still recorded by the store');
  perform pg_temp.bk_assert((select system_id = v_sys from public.business_bookings where legacy_id = 'bk_after'), 'new rows point at the System');
end $$;

-- Receipts gain a reference to the booking row.
select pg_temp.bk_assert(exists (select 1 from information_schema.columns where table_schema = 'public'
  and table_name = 'public_website_bookings' and column_name = 'booking_id'), 'receipt link column');

-- History never changes.
select pg_temp.bk_expect($$update public.business_booking_history set reason = 'edited'$$, 'booking_history_immutable');

-- Failure paths.
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bad","start":"2026-11-06T15:30:00Z","end":"2026-11-06T15:00:00Z"}'), 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bad","timeZone":"Mars/Olympus","start":"2026-11-06T15:00:00Z","end":"2026-11-06T15:30:00Z"}'), 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bad","status":"maybe","start":"2026-11-06T18:00:00Z","end":"2026-11-06T18:30:00Z"}'), 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"start":"2026-11-06T18:00:00Z","end":"2026-11-06T18:30:00Z"}'), 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bad","start":"soon","end":"2026-11-06T18:30:00Z"}'), 'dual_write')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.record_tenant_booking('no-such-site', pg_temp.bk('{"legacyId":"bad","start":"2026-11-06T18:00:00Z","end":"2026-11-06T18:30:00Z"}'), 'dual_write')$$, 'booking_unknown_tenant');
select pg_temp.bk_expect($$select public.record_tenant_booking('bk-site', pg_temp.bk('{"legacyId":"bad","start":"2026-11-06T18:00:00Z","end":"2026-11-06T18:30:00Z"}'), 'magic')$$, 'booking_invalid');
select pg_temp.bk_expect($$select public.set_tenant_booking_status('bk-site', 'bk_4', 'maybe', 'owner', null)$$, 'booking_invalid');
select pg_temp.bk_assert((select count(*) from public.business_bookings where legacy_id = 'bad') = 0, 'rejected writes stored nothing');
rollback;
