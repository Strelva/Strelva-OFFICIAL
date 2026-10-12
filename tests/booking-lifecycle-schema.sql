\set ON_ERROR_STOP on
-- After a booking is taken (20261009110000_booking_lifecycle.sql): reminders
-- claimed once, the hold sweep, the 72-hour request clock, the manage-link
-- lookup, schedule reservations copied into the one store, and booking-only
-- hours that can only narrow the record. Fictional tenants only; rolls back.
begin;
create or replace function pg_temp.bl_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'booking lifecycle assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.bl_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
-- Insert one booking directly with a chosen created_at (the clocks read it).
create or replace function pg_temp.bl_book(p_calendar uuid, p_ws uuid, p_ref text, p_status text, p_start timestamptz, p_created timestamptz,
  p_email text default 'dana@example.test', p_origin text default 'site') returns uuid language sql as $$
  insert into public.business_bookings(calendar_key, tenant_stable_id, workspace_id, status, origin, service_name_at_booking,
    start_at, end_at, block_end_at, time_zone, customer_name, customer_email, legacy_id, recorded_via, created_at,
    external_source, external_ref)
  values (p_calendar, p_calendar, p_ws, p_status, p_origin, 'Consultation', p_start, p_start + interval '30 minutes',
    p_start + interval '30 minutes', 'America/New_York', 'Dana Reed', p_email, p_ref, 'native', p_created,
    case when p_origin = 'import' then 'calendly' end, case when p_origin = 'import' then 'https://api.calendly.com/invitees/' || p_ref end)
  returning id
$$;

insert into public.users(id, email, verified_at) values
  ('c1000000-0000-4000-8000-0000000000e1', 'bl-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('c1000000-0000-4000-8000-0000000000e1', 'bl-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('bl-site', 'c1000000-0000-4000-8000-0000000000b1', 'Lifecycle Firm', true),
  ('bl-other', 'c1000000-0000-4000-8000-0000000000b2', 'Other Lifecycle Site', true),
  ('bl-plain', 'c1000000-0000-4000-8000-0000000000b3', 'Lifecycle Plain', true);
create temporary table bl_ws(name text primary key, id uuid) on commit drop;
insert into bl_ws select 'site', (public.convert_tenant_to_business('bl-operator@strelva.example.test', 'bl-site',
  '{"tenantId":"bl-site","tenantStableId":"c1000000-0000-4000-8000-0000000000b1","workspaceName":"Lifecycle Firm","billing":null,"account":null,
    "patch":{"facts":{"hours":{"value":{"timezone":"America/New_York","weekly":[{"day":1,"opens":"09:00","closes":"17:00"},{"day":5,"opens":"09:00","closes":"15:00"}]},"verified":false}}},
    "contacts":[]}',
  'c1000000-0000-4000-8000-0000000000c1', repeat('e', 64))->>'workspaceId')::uuid;
insert into bl_ws select 'other', (public.convert_tenant_to_business('bl-operator@strelva.example.test', 'bl-other',
  '{"tenantId":"bl-other","tenantStableId":"c1000000-0000-4000-8000-0000000000b2","workspaceName":"Other Lifecycle","billing":null,"account":null,"patch":{},"contacts":[]}',
  'c1000000-0000-4000-8000-0000000000c2', repeat('f', 64))->>'workspaceId')::uuid;

-- Locked down.
select pg_temp.bl_assert((select relrowsecurity from pg_class where oid = 'public.business_booking_messages'::regclass), 'rls on');
select pg_temp.bl_assert(not has_table_privilege('anon', 'public.business_booking_messages', 'select')
  and not has_table_privilege('authenticated', 'public.business_booking_messages', 'select')
  and not has_table_privilege('service_role', 'public.business_booking_messages', 'insert'), 'no direct table access');
select pg_temp.bl_assert(not has_function_privilege('anon', 'public.claim_booking_messages(timestamptz,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_public_booking_by_manage_token(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_tenant_booking_hours(uuid,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_workspace_booking(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.claim_booking_messages(timestamptz,integer)', 'execute')
  and has_function_privilege('service_role', 'public.lapse_booking_requests(timestamptz,integer)', 'execute')
  and has_function_privilege('service_role', 'public.record_workspace_booking(uuid,jsonb,text)', 'execute'), 'function grants');

-- Reminders. "Now" is Mon Nov 2 2026 12:00Z.
create temporary table bl_b(name text primary key, id uuid) on commit drop;
insert into bl_b values
  ('tomorrow', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_tomorrow', 'confirmed', '2026-11-03T10:00:00Z', '2026-10-20T00:00:00Z')),
  ('soon', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_soon', 'confirmed', '2026-11-02T13:30:00Z', '2026-10-20T00:00:00Z')),
  ('late_booked', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_late', 'confirmed', '2026-11-02T20:00:00Z', '2026-11-02T08:00:00Z')),
  ('no_email', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_noemail', 'confirmed', '2026-11-03T11:00:00Z', '2026-10-20T00:00:00Z', null)),
  ('cancelled', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_cancel', 'cancelled', '2026-11-03T12:00:00Z', '2026-10-20T00:00:00Z')),
  ('imported', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_import', 'confirmed', '2026-11-03T13:00:00Z', '2026-10-20T00:00:00Z', 'dana@example.test', 'import')),
  ('far', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_far', 'confirmed', '2026-11-10T13:00:00Z', '2026-10-20T00:00:00Z')),
  ('past', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_past', 'confirmed', '2026-11-02T11:00:00Z', '2026-10-20T00:00:00Z')),
  ('req_25h', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_req25', 'requested', '2026-11-12T15:00:00Z', '2026-11-01T11:00:00Z')),
  ('req_fresh', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_reqfresh', 'requested', '2026-11-12T16:00:00Z', '2026-11-02T06:00:00Z')),
  ('req_73h', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_req73', 'requested', '2026-11-12T17:00:00Z', '2026-10-30T11:00:00Z')),
  ('req_73h_noemail', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_req73n', 'requested', '2026-11-12T18:00:00Z', '2026-10-30T11:00:00Z', null)),
  ('hold_old', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_hold_old', 'held', '2026-11-13T15:00:00Z', '2026-11-02T11:40:00Z')),
  ('hold_new', pg_temp.bl_book('c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'), 'bl_hold_new', 'held', '2026-11-13T16:00:00Z', '2026-11-02T11:50:00Z'));

create temporary table bl_claim on commit drop as
  select value as c from jsonb_array_elements(public.claim_booking_messages('2026-11-02T12:00:00Z', 50));
select pg_temp.bl_assert((select count(*) from bl_claim where c->>'kind' = 'reminder_2h' and (c#>>'{booking,id}')::uuid = (select id from bl_b where name = 'soon')) = 1, '2h reminder due');
select pg_temp.bl_assert((select count(*) from bl_claim where c->>'kind' = 'reminder_24h' and (c#>>'{booking,id}')::uuid = (select id from bl_b where name = 'tomorrow')) = 1, '24h reminder due');
select pg_temp.bl_assert((select count(*) from bl_claim where c->>'kind' = 'request_owner_reminder' and (c#>>'{booking,id}')::uuid = (select id from bl_b where name = 'req_25h')) = 1, 'owner chased once at 24h');
select pg_temp.bl_assert((select count(*) from bl_claim) = 3, 'nothing else is due: late-booked, no email, cancelled, imported, far, past, fresh and lapsing requests skip');
select pg_temp.bl_assert((select bool_and(c->>'messageId' is not null) from bl_claim), 'each claim has a message id');
-- A second run claims nothing: each message goes out once.
select pg_temp.bl_assert(public.claim_booking_messages('2026-11-02T12:05:00Z', 50) = '[]'::jsonb, 'claimed once');
select pg_temp.bl_assert(public.finish_booking_message((select (c->>'messageId')::uuid from bl_claim limit 1), 'sent', 'msg_1', null)->>'status' = 'finished', 'finished');
select pg_temp.bl_assert(public.finish_booking_message((select (c->>'messageId')::uuid from bl_claim limit 1), 'failed', null, 'retry')->>'status' = 'not_claimed', 'finished once');
select pg_temp.bl_expect($$select public.finish_booking_message(gen_random_uuid(), 'claimed', null, null)$$, 'booking_invalid');
select pg_temp.bl_expect($$select public.claim_booking_messages('2026-11-02T12:00:00Z', 0)$$, 'booking_invalid');
-- Later the same booking gets its 2h reminder too, once.
select pg_temp.bl_assert((select count(*) from jsonb_array_elements(public.claim_booking_messages('2026-11-03T08:30:00Z', 50)) c
  where c->>'kind' = 'reminder_2h' and (c#>>'{booking,id}')::uuid = (select id from bl_b where name = 'tomorrow')) = 1, '2h after 24h');

-- The hold sweep: only holds older than 15 minutes, history kept, slot freed.
select pg_temp.bl_assert((public.expire_booking_holds('2026-11-02T12:00:00Z')->>'expired')::int = 1, 'one hold expired');
select pg_temp.bl_assert((select status = 'cancelled' and cancelled_at is not null from public.business_bookings where id = (select id from bl_b where name = 'hold_old')), 'old hold released');
select pg_temp.bl_assert((select status from public.business_bookings where id = (select id from bl_b where name = 'hold_new')) = 'held', 'fresh hold kept');
select pg_temp.bl_assert((select count(*) from public.business_booking_history where booking_id = (select id from bl_b where name = 'hold_old')
  and actor = 'system' and to_status = 'cancelled' and reason like 'Hold expired%') = 1, 'hold history');
select pg_temp.bl_assert((public.expire_booking_holds('2026-11-02T12:00:00Z')->>'expired')::int = 0, 'sweep is idempotent');

-- The 72-hour request clock: declined, never confirmed; customer told once.
create temporary table bl_lapse on commit drop as
  select value as l from jsonb_array_elements(public.lapse_booking_requests('2026-11-02T12:00:00Z', 50));
select pg_temp.bl_assert((select count(*) from bl_lapse) = 2, 'two requests lapsed');
select pg_temp.bl_assert((select bool_and(l#>>'{booking,status}' = 'declined') from bl_lapse), 'lapsed means declined');
select pg_temp.bl_assert((select count(*) from bl_lapse where l->>'messageId' is not null) = 1, 'customer message only with an address');
select pg_temp.bl_assert((select status from public.business_bookings where id = (select id from bl_b where name = 'req_25h')) = 'requested', '25h request still waits');
select pg_temp.bl_assert((select count(*) from public.business_booking_history where booking_id = (select id from bl_b where name = 'req_73h')
  and actor = 'system' and from_status = 'requested' and to_status = 'declined' and reason like 'Expired%') = 1, 'lapse history');
select pg_temp.bl_assert(public.lapse_booking_requests('2026-11-02T12:00:00Z', 50) = '[]'::jsonb, 'lapse is idempotent');
-- A public API reservation awaiting its calendar read-back is not an owner request: no clock.
update public.business_bookings set public_reservation_id = gen_random_uuid(), status = 'requested'
  where id = (select id from bl_b where name = 'req_73h_noemail');
select pg_temp.bl_assert(public.lapse_booking_requests('2026-11-02T12:00:00Z', 50) = '[]'::jsonb, 'API pending row has no 72h clock');
-- The freed time can be taken again.
select pg_temp.bl_assert(public.record_tenant_booking('bl-site', jsonb_build_object('legacyId', 'bl_retake', 'status', 'confirmed', 'origin', 'site',
  'serviceName', 'Consultation', 'start', '2026-11-12T17:00:00Z', 'end', '2026-11-12T17:30:00Z', 'timeZone', 'America/New_York',
  'customer', jsonb_build_object('name', 'Sam')), 'native')->>'status' = 'recorded', 'lapsed slot freed');

-- One booking of one business, with why it last changed; another business gets nothing.
select pg_temp.bl_assert((select r#>>'{lastChange,reason}' like 'Expired%' and r->>'status' = 'declined'
  from (select public.read_workspace_booking((select id from bl_ws where name = 'site'), (select id from bl_b where name = 'req_73h')) r) x), 'read with last change');
select pg_temp.bl_assert(public.read_workspace_booking((select id from bl_ws where name = 'other'), (select id from bl_b where name = 'req_73h')) is null, 'other business refused');

-- Manage link lookup by token hash alone.
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('c1000000-0000-4000-8000-000000000040', (select id from bl_ws where name = 'site'), 'scheduling', 'schedule', 'Consults',
   '{"version":1,"revision":0,"title":"Consults","createdBy":"c1000000-0000-4000-8000-0000000000e1","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[],"reservations":[]}'::jsonb,
   'c1000000-0000-4000-8000-0000000000e1'),
  ('c1000000-0000-4000-8000-000000000041', (select id from bl_ws where name = 'site'), 'scheduling', 'schedule', 'Private',
   '{"version":1,"revision":0,"title":"Private","createdBy":"c1000000-0000-4000-8000-0000000000e1","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[],"reservations":[]}'::jsonb,
   'c1000000-0000-4000-8000-0000000000e1'),
  ('c1000000-0000-4000-8000-000000000042', (select id from bl_ws where name = 'other'), 'scheduling', 'schedule', 'Other',
   '{"version":1,"revision":0,"title":"Other","createdBy":"c1000000-0000-4000-8000-0000000000e1","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[],"reservations":[]}'::jsonb,
   'c1000000-0000-4000-8000-0000000000e1');
-- The grant and receipt are fixtures here; their own binding rules are
-- proven in public-website-bookings-schema.sql.
set local session_replication_role = replica;
insert into public.public_website_booking_grants(id, tenant_stable_id, business_workspace_id, work_id, capability_id,
  capability_version, inquiry_capability_id, inquiry_version, provider, display_name, time_zone, published_by)
values ('c1000000-0000-4000-8000-000000000050', 'c1000000-0000-4000-8000-0000000000b1', (select id from bl_ws where name = 'site'),
  'c1000000-0000-4000-8000-000000000040', 'consultations', 1, 'inquiries', 1, 'google', 'Consultations', 'America/New_York',
  'c1000000-0000-4000-8000-0000000000e1');
insert into public.public_website_bookings(id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
  work_id, capability_id, capability_version, provider, inquiry_id, request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
  calendar_request_id, management_token_hash, management_token_ciphertext, expected_revision, title, start_at, end_at, time_zone, status)
values ('c1000000-0000-4000-8000-000000000070', 'c1000000-0000-4000-8000-000000000050', 'c1000000-0000-4000-8000-0000000000b1', 'bl-site',
  (select id from bl_ws where name = 'site'), 'c1000000-0000-4000-8000-000000000040', 'consultations', 1, 'google', 'inquiry-bl',
  repeat('a', 64), repeat('7', 64), 'slot-bl-1', '2026-11-16T15:00:00Z', '2026-11-16T15:30:00Z', 'public-request-bl', repeat('9', 64),
  'encrypted-token', 1, 'Consultation', '2026-11-16T15:00:00Z', '2026-11-16T15:30:00Z', 'America/New_York', 'confirmed');
set local session_replication_role = origin;
select pg_temp.bl_assert((select r->>'tenantId' = 'bl-site' and r->>'reservationId' = 'c1000000-0000-4000-8000-000000000070'
    and r->>'capabilityId' = 'consultations' and r->>'status' = 'confirmed' and r->>'siteName' = 'Lifecycle Firm'
    and not (r ? 'managementToken') and not (r ? 'managementTokenHash')
  from (select public.read_public_booking_by_manage_token(repeat('9', 64)) r) x), 'manage lookup');
select pg_temp.bl_assert(public.read_public_booking_by_manage_token(repeat('8', 64)) is null, 'unknown token');
select pg_temp.bl_assert(public.read_public_booking_by_manage_token('not-a-hash') is null, 'malformed token');
select pg_temp.bl_assert(public.read_public_booking_by_manage_token(null) is null, 'no token');

-- Schedule reservations without a receipt: on the published tenant's calendar,
-- so they block that site's slots; an unpublished schedule uses the workspace's own.
select pg_temp.bl_assert(public.record_workspace_booking((select id from bl_ws where name = 'site'),
  '{"workId":"c1000000-0000-4000-8000-000000000040","requestId":"owner-1","status":"confirmed","title":"Walk-in consult",
    "start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z","timeZone":"America/New_York"}', 'backfill')->>'status' = 'recorded', 'copied');
select pg_temp.bl_assert((select calendar_key = 'c1000000-0000-4000-8000-0000000000b1' and tenant_stable_id = calendar_key and origin = 'owner'
    and workspace_id = (select id from bl_ws where name = 'site') from public.business_bookings where legacy_id like 'schedule:%' and service_name_at_booking = 'Walk-in consult'),
  'published schedule shares the tenant calendar');
select pg_temp.bl_assert(public.record_workspace_booking((select id from bl_ws where name = 'site'),
  '{"workId":"c1000000-0000-4000-8000-000000000040","requestId":"owner-1","status":"confirmed","title":"Walk-in consult",
    "start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z","timeZone":"America/New_York"}', 'backfill')->>'status' = 'unchanged', 'rerun unchanged');
select pg_temp.bl_assert(public.record_tenant_booking('bl-site', jsonb_build_object('legacyId', 'bl_clash', 'status', 'confirmed', 'origin', 'site',
  'serviceName', 'Consultation', 'start', '2026-11-16T16:15:00Z', 'end', '2026-11-16T16:45:00Z', 'timeZone', 'America/New_York',
  'customer', jsonb_build_object('name', 'Sam')), 'native')->>'status' = 'conflict', 'the copied reservation blocks the site');
select pg_temp.bl_assert(public.record_workspace_booking((select id from bl_ws where name = 'site'),
  '{"workId":"c1000000-0000-4000-8000-000000000041","requestId":"owner-2","status":"confirmed","title":"Private session",
    "start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z","timeZone":"America/New_York"}', 'backfill')->>'status' = 'recorded', 'unpublished schedule copied');
select pg_temp.bl_assert((select calendar_key = (select id from bl_ws where name = 'site') and tenant_stable_id is null
  from public.business_bookings where service_name_at_booking = 'Private session'), 'workspace calendar');
select pg_temp.bl_assert(public.record_workspace_booking((select id from bl_ws where name = 'site'),
  '{"workId":"c1000000-0000-4000-8000-000000000041","requestId":"owner-2","status":"cancelled","title":"Private session",
    "start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z","timeZone":"America/New_York"}', 'repair')->>'status' = 'updated', 'cancel copied');
select pg_temp.bl_assert((select count(*) from public.business_booking_history h join public.business_bookings b on b.id = h.booking_id
  where b.service_name_at_booking = 'Private session' and h.to_status = 'cancelled') = 1, 'cancel history');
-- Another business's schedule is refused.
select pg_temp.bl_expect(format($$select public.record_workspace_booking(%L,
  '{"workId":"c1000000-0000-4000-8000-000000000042","requestId":"x","status":"confirmed","title":"Nope","start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z"}', 'backfill')$$,
  (select id from bl_ws where name = 'site')), 'booking_not_found');
select pg_temp.bl_expect(format($$select public.record_workspace_booking(%L,
  '{"workId":"c1000000-0000-4000-8000-000000000040","requestId":"x","status":"writing","title":"Nope","start":"2026-11-16T16:00:00Z","end":"2026-11-16T16:30:00Z"}', 'backfill')$$,
  (select id from bl_ws where name = 'site')), 'booking_invalid');

-- Booking-only hours: narrow only.
select pg_temp.bl_assert((select r->>'status' = 'updated' and r->'bookableHours' = '[{"day":1,"opens":"10:00","closes":"12:00"}]'::jsonb
  from (select public.set_tenant_booking_hours((select id from bl_ws where name = 'site'), 'bl-site', '[{"day":1,"opens":"10:00","closes":"12:00"}]') r) x), 'narrowed');
select pg_temp.bl_assert(public.read_tenant_booking_context('bl-site')#>'{settings,bookableHours}' = '[{"day":1,"opens":"10:00","closes":"12:00"}]'::jsonb, 'read back');
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-site', '[{"day":5,"opens":"14:00","closes":"16:00"}]')$$,
  (select id from bl_ws where name = 'site')), 'booking_hours_outside_record');
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-site', '[{"day":0,"opens":"10:00","closes":"11:00"}]')$$,
  (select id from bl_ws where name = 'site')), 'booking_hours_outside_record');
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-site', '[{"day":1,"opens":"12:00","closes":"10:00"}]')$$,
  (select id from bl_ws where name = 'site')), 'booking_invalid');
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-site', '[{"day":1,"opens":"25:00","closes":"26:00"}]')$$,
  (select id from bl_ws where name = 'site')), 'booking_invalid');
-- The record has no hours: nothing to narrow, so nothing is saved.
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-other', '[{"day":1,"opens":"10:00","closes":"11:00"}]')$$,
  (select id from bl_ws where name = 'other')), 'booking_hours_need_record');
-- Another business can't edit this site's hours.
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-site', '[]')$$,
  (select id from bl_ws where name = 'other')), 'booking_not_found');
select pg_temp.bl_expect(format($$select public.set_tenant_booking_hours(%L, 'bl-plain', '[]')$$,
  (select id from bl_ws where name = 'site')), 'booking_not_found');
-- Clearing the narrowing goes back to the record's hours.
select pg_temp.bl_assert(public.set_tenant_booking_hours((select id from bl_ws where name = 'site'), 'bl-site', null)->'bookableHours' = 'null'::jsonb, 'cleared');
rollback;
