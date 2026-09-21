\set ON_ERROR_STOP on

create function pg_temp.assert_public_booking(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

-- Public booking rows are server-owned. The bearer management token is only
-- returned by the API receipt and is never a table column that browser roles
-- can select directly.
select pg_temp.assert_public_booking(
  (select relrowsecurity from pg_class where oid = 'public.public_website_booking_grants'::regclass)
    and (select relrowsecurity from pg_class where oid = 'public.public_website_bookings'::regclass)
    and has_table_privilege('service_role', 'public.public_website_booking_grants', 'SELECT,INSERT,UPDATE')
    and has_table_privilege('service_role', 'public.public_website_bookings', 'SELECT,INSERT,UPDATE')
    and not has_table_privilege('anon', 'public.public_website_booking_grants', 'SELECT')
    and not has_table_privilege('authenticated', 'public.public_website_booking_grants', 'SELECT')
    and not has_table_privilege('anon', 'public.public_website_bookings', 'SELECT')
    and not has_table_privilege('authenticated', 'public.public_website_bookings', 'SELECT'),
  'public booking grants and receipts must stay behind the server boundary'
);
select pg_temp.assert_public_booking(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_website_bookings'
      and column_name = 'management_token'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_website_bookings'
      and column_name = 'management_token_ciphertext'
  ),
  'booking receipts must retain only encrypted management-token state'
);
select pg_temp.assert_public_booking(
  has_function_privilege('service_role', 'public.publish_public_website_booking_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.revoke_public_website_booking_grant(uuid,uuid,text,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.read_public_website_booking_grants(uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.export_public_website_bookings(uuid,uuid,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.publish_public_website_booking_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.revoke_public_website_booking_grant(uuid,uuid,text,uuid,text)', 'EXECUTE'),
  'grant publication, revocation, read, and export stay behind actor-bearing service functions'
);

insert into public.users(id, email, verified_at)
values
  ('d1220000-0000-4000-8000-000000000001', 'public-booking-owner@example.test', clock_timestamp()),
  ('d1220000-0000-4000-8000-000000000002', 'public-booking-member@example.test', clock_timestamp());

insert into public.workspaces(id, kind, name, created_by)
values
  ('d1220000-0000-4000-8000-000000000010', 'customer', 'Public Booking A', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000011', 'customer', 'Public Booking B', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000012', 'customer', 'Public Booking C', 'd1220000-0000-4000-8000-000000000001');

insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
values
  ('d1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000001', 'owner', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000002', 'member', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000001', 'owner', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000001', 'owner', 'd1220000-0000-4000-8000-000000000001');

insert into public.tenants(id, stable_id, site_name, active)
values
  ('public-booking-a', 'd1220000-0000-4000-8000-000000000020', 'Public Booking A', true),
  ('public-booking-b', 'd1220000-0000-4000-8000-000000000021', 'Public Booking B', true),
  ('public-booking-c', 'd1220000-0000-4000-8000-000000000022', 'Public Booking C', true);

insert into public.memberships(user_id, tenant_id, role, tenant_stable_id)
values
  ('d1220000-0000-4000-8000-000000000001', 'public-booking-a', 'owner', 'd1220000-0000-4000-8000-000000000020'),
  ('d1220000-0000-4000-8000-000000000001', 'public-booking-b', 'owner', 'd1220000-0000-4000-8000-000000000021'),
  ('d1220000-0000-4000-8000-000000000001', 'public-booking-c', 'owner', 'd1220000-0000-4000-8000-000000000022');

insert into public.offering_website_bindings(
  id, business_workspace_id, tenant_stable_id, tenant_id_at_binding,
  site_name_at_binding, idempotency_key, command_digest, created_by, updated_by
)
values
  ('d1220000-0000-4000-8000-000000000030', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'Public Booking A', 'public-booking-binding-a', repeat('a', 64), 'd1220000-0000-4000-8000-000000000001', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000031', 'd1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000021', 'public-booking-b', 'Public Booking B', 'public-booking-binding-b', repeat('b', 64), 'd1220000-0000-4000-8000-000000000001', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000032', 'd1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000022', 'public-booking-c', 'Public Booking C', 'public-booking-binding-c', repeat('c', 64), 'd1220000-0000-4000-8000-000000000001', 'd1220000-0000-4000-8000-000000000001');

insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values
  ('d1220000-0000-4000-8000-000000000040', 'd1220000-0000-4000-8000-000000000010', 'scheduling', 'schedule', 'Public consultation A',
   '{"version":1,"revision":0,"title":"Public consultation A","createdBy":"d1220000-0000-4000-8000-000000000001","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[{"start":"2026-10-01T13:00:00Z","end":"2026-10-01T14:00:00Z"}],"reservations":[]}'::jsonb,
   'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000041', 'd1220000-0000-4000-8000-000000000011', 'scheduling', 'schedule', 'Public consultation B',
   '{"version":1,"revision":0,"title":"Public consultation B","createdBy":"d1220000-0000-4000-8000-000000000001","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[{"start":"2026-10-01T13:00:00Z","end":"2026-10-01T14:00:00Z"}],"reservations":[]}'::jsonb,
   'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000042', 'd1220000-0000-4000-8000-000000000012', 'scheduling', 'schedule', 'Public consultation C',
   '{"version":1,"revision":0,"title":"Public consultation C","createdBy":"d1220000-0000-4000-8000-000000000001","createdAt":"2026-09-20T00:00:00Z","history":[],"availability":[{"start":"2026-10-01T13:00:00Z","end":"2026-10-01T14:00:00Z"}],"reservations":[]}'::jsonb,
   'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000043', 'd1220000-0000-4000-8000-000000000010', 'scheduling', 'not_schedule', 'Not a schedule',
   '{"version":1,"revision":0,"title":"Not a schedule","createdBy":"d1220000-0000-4000-8000-000000000001","createdAt":"2026-09-20T00:00:00Z","history":[]}'::jsonb,
   'd1220000-0000-4000-8000-000000000001');

do $$
declare
  caught text;
begin
  caught := null;
  begin
    insert into public.public_website_booking_grants(
      id, tenant_stable_id, business_workspace_id, work_id, capability_id,
      capability_version, inquiry_capability_id, inquiry_version, provider,
      display_name, time_zone, published_by
    ) values (
      'd1220000-0000-4000-8000-000000000050', 'd1220000-0000-4000-8000-000000000020',
      'd1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000041',
      'wrong-binding', 1, 'inquiries', 1, 'outlook', 'Wrong binding', 'UTC',
      'd1220000-0000-4000-8000-000000000001'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_website_binding_required', 'a grant cannot cross tenant and business binding identity');

  caught := null;
  begin
    insert into public.public_website_booking_grants(
      id, tenant_stable_id, business_workspace_id, work_id, capability_id,
      capability_version, inquiry_capability_id, inquiry_version, provider,
      display_name, time_zone, published_by
    ) values (
      'd1220000-0000-4000-8000-000000000051', 'd1220000-0000-4000-8000-000000000020',
      'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040',
      'member-publisher', 1, 'inquiries', 1, 'outlook', 'Member publisher', 'UTC',
      'd1220000-0000-4000-8000-000000000002'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_publisher_required', 'a verified ordinary member cannot publish a booking grant');

  caught := null;
  begin
    insert into public.public_website_booking_grants(
      id, tenant_stable_id, business_workspace_id, work_id, capability_id,
      capability_version, inquiry_capability_id, inquiry_version, provider,
      display_name, time_zone, published_by
    ) values (
      'd1220000-0000-4000-8000-000000000052', 'd1220000-0000-4000-8000-000000000020',
      'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000043',
      'wrong-schedule', 1, 'inquiries', 1, 'outlook', 'Wrong schedule', 'UTC',
      'd1220000-0000-4000-8000-000000000001'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_schedule_required', 'a grant must bind an existing native scheduling work item');
end;
$$;

insert into public.public_website_booking_grants(
  id, tenant_stable_id, business_workspace_id, work_id, capability_id,
  capability_version, inquiry_capability_id, inquiry_version, provider,
  display_name, time_zone, published_by
)
values
  ('d1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'inquiries', 3, 'outlook', 'Consultations A', 'America/New_York', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000061', 'd1220000-0000-4000-8000-000000000021', 'd1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000041', 'consultations', 2, 'inquiries', 3, 'outlook', 'Consultations B', 'America/New_York', 'd1220000-0000-4000-8000-000000000001'),
  ('d1220000-0000-4000-8000-000000000062', 'd1220000-0000-4000-8000-000000000022', 'd1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000042', 'consultations', 2, 'inquiries', 3, 'outlook', 'Consultations C', 'America/New_York', 'd1220000-0000-4000-8000-000000000001');

insert into public.public_website_bookings(
  id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
  work_id, capability_id, capability_version, provider, inquiry_id,
  request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
  calendar_request_id, management_token_hash,
  management_token_ciphertext, expected_revision, title, start_at, end_at,
  time_zone, status
)
values
  ('d1220000-0000-4000-8000-000000000070', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'inquiry-a', repeat('a', 64), repeat('7', 64), 'slot-a-001', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-a', repeat('1', 64), 'encrypted-management-token-a', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'),
  -- The same request and management digests are safe in another tenant because
  -- both uniqueness constraints are intentionally tenant scoped.
  ('d1220000-0000-4000-8000-000000000071', 'd1220000-0000-4000-8000-000000000061', 'd1220000-0000-4000-8000-000000000021', 'public-booking-b', 'd1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000041', 'consultations', 2, 'outlook', 'inquiry-b', repeat('a', 64), repeat('8', 64), 'slot-b-001', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-b', repeat('1', 64), 'encrypted-management-token-b', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'),
  ('d1220000-0000-4000-8000-000000000072', 'd1220000-0000-4000-8000-000000000062', 'd1220000-0000-4000-8000-000000000022', 'public-booking-c', 'd1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000042', 'consultations', 2, 'outlook', 'inquiry-c', repeat('c', 64), repeat('9', 64), 'slot-c-001', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-c', repeat('3', 64), 'encrypted-management-token-c', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed');

-- The replay fingerprint and original slot are required evidence. A legacy
-- shaped insert must fail before a receipt can be created without them.
do $$
declare
  caught text;
begin
  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000079', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'missing-fingerprint', repeat('0', 64), 'public-request-missing-fingerprint', repeat('0', 64), 'encrypted-management-token-missing-fingerprint', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_request_fingerprint_required', 'a receipt must include replay fingerprint and original slot evidence');

  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000080', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'missing-original-slot', repeat('0', 64), repeat('a', 64), 'public-request-missing-original-slot', repeat('0', 64), 'encrypted-management-token-missing-original-slot', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_request_fingerprint_required', 'a replay fingerprint without an original slot must be rejected');

  perform pg_temp.assert_public_booking(
    (select request_fingerprint = repeat('7', 64) and slot_id = 'slot-a-001'
      and slot_start_at = '2026-10-01T13:00:00Z'::timestamptz
      and slot_end_at = '2026-10-01T14:00:00Z'::timestamptz
     from public.public_website_bookings where id = 'd1220000-0000-4000-8000-000000000070'),
    'a stored receipt must retain the exact replay fingerprint and original slot'
  );

  caught := null;
  begin
    update public.public_website_bookings
       set request_fingerprint = repeat('0', 64)
     where id = 'd1220000-0000-4000-8000-000000000070';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_request_fingerprint_immutable', 'a receipt fingerprint cannot be rewritten after acceptance');

  caught := null;
  begin
    update public.public_website_bookings
       set slot_id = 'slot-a-mutated'
     where id = 'd1220000-0000-4000-8000-000000000070';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_request_fingerprint_immutable', 'the original slot id cannot be rewritten after acceptance');
end;
$$;

do $$
declare
  caught text;
  exported jsonb;
begin
  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000073', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'inquiry-a-duplicate', repeat('a', 64), repeat('0', 64), 'slot-a-duplicate', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-a-duplicate', repeat('4', 64), 'encrypted-management-token-a2', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when unique_violation then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught is not null, 'one tenant cannot create two receipts for one request digest');

  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000074', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'inquiry-a-token-duplicate', repeat('d', 64), repeat('2', 64), 'slot-a-token-duplicate', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-a-token-duplicate', repeat('1', 64), 'encrypted-management-token-a2', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when unique_violation then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught is not null, 'one tenant cannot reuse a management-token digest');

  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000075', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'another-capability', 2, 'outlook', 'inquiry-a-binding-mismatch', repeat('e', 64), repeat('3', 64), 'slot-a-binding-mismatch', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-a-binding-mismatch', repeat('5', 64), 'encrypted-management-token-a3', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_receipt_binding_mismatch', 'a receipt cannot forge the published capability binding');

  perform pg_temp.assert_public_booking(
    (select count(*) from public.public_website_bookings where request_id_hash = repeat('a', 64)) = 2
      and (select count(*) from public.public_website_bookings where management_token_hash = repeat('1', 64)) = 2,
    'request and management-token uniqueness must remain isolated by tenant stable identity'
  );

  perform pg_temp.assert_public_booking(
    (select count(*) from public.read_public_website_booking_grants(
      'd1220000-0000-4000-8000-000000000010',
      'd1220000-0000-4000-8000-000000000001',
      'public-booking-owner@example.test'
    )) = 1,
    'grant reads are scoped to the requested business workspace'
  );

  exported := public.export_public_website_bookings(
    'd1220000-0000-4000-8000-000000000010',
    'd1220000-0000-4000-8000-000000000001',
    'public-booking-owner@example.test'
  );
  perform pg_temp.assert_public_booking(
    (select count(*) from jsonb_array_elements(exported->'receipts') item
      where item ? 'managementToken'
         or item ? 'managementTokenCiphertext'
         or item ? 'calendarRequestId') = 0,
    'workspace export must omit management tokens, ciphertext, and public request keys'
  );
end;
$$;

-- Underlying website-binding revocation must close new booking receipts while
-- leaving an existing receipt cancellable for cleanup.
do $$
declare
  caught text;
begin
  perform public.revoke_offering_website_binding(
    'd1220000-0000-4000-8000-000000000010',
    'd1220000-0000-4000-8000-000000000030',
    'd1220000-0000-4000-8000-000000000001',
    'public-booking-owner@example.test', 1, 'Public booking binding revoked'
  );
  perform pg_temp.assert_public_booking(
    (select status = 'revoked' from public.offering_website_bindings where id = 'd1220000-0000-4000-8000-000000000030'),
    'the native website binding revocation must commit'
  );

  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000076', 'd1220000-0000-4000-8000-000000000060', 'd1220000-0000-4000-8000-000000000020', 'public-booking-a', 'd1220000-0000-4000-8000-000000000010', 'd1220000-0000-4000-8000-000000000040', 'consultations', 2, 'outlook', 'inquiry-a-after-revoke', repeat('f', 64), repeat('6', 64), 'slot-a-after-revoke', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-a-after-revoke', repeat('6', 64), 'encrypted-management-token-a4', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(
    caught in ('public_booking_website_binding_required', 'public_booking_binding_revoked', 'public_booking_grant_revoked'),
    'binding revocation must close new public booking receipts'
  );

  update public.public_website_bookings
    set status = 'cancelled', updated_at = clock_timestamp()
    where id = 'd1220000-0000-4000-8000-000000000070';
  perform pg_temp.assert_public_booking(
    (select status = 'cancelled' from public.public_website_bookings where id = 'd1220000-0000-4000-8000-000000000070'),
    'an existing receipt remains cancellable after binding revocation'
  );
end;
$$;

-- A grant explicitly revoked by its owner must not admit a new receipt. This
-- also guards a revoke-vs-request race after the resolver has read the grant.
select public.revoke_public_website_booking_grant(
  'd1220000-0000-4000-8000-000000000011',
  'd1220000-0000-4000-8000-000000000001',
  'public-booking-owner@example.test',
  'd1220000-0000-4000-8000-000000000061',
  'Public booking stopped'
);

do $$
declare caught text;
begin
  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000077', 'd1220000-0000-4000-8000-000000000061', 'd1220000-0000-4000-8000-000000000021', 'public-booking-b', 'd1220000-0000-4000-8000-000000000011', 'd1220000-0000-4000-8000-000000000041', 'consultations', 2, 'outlook', 'inquiry-b-after-revoke', repeat('7', 64), repeat('b', 64), 'slot-b-after-revoke', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-b-after-revoke', repeat('8', 64), 'encrypted-management-token-b2', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(caught = 'public_booking_grant_revoked', 'a revoked public booking grant cannot admit a new receipt');
end;
$$;

-- A completed workspace exit preserves cancellation but blocks new receipt
-- creation, rescheduling, and post-exit grant publication.
insert into public.workspace_exit_requests(
  workspace_id, requested_by, idempotency_key, command_digest, future_work,
  provider_participation, maintained_resource_action, state, completed_at
)
values (
  'd1220000-0000-4000-8000-000000000012',
  'd1220000-0000-4000-8000-000000000001',
  'public-booking-exit', repeat('9', 64), 'cancel', 'keep', 'stop',
  '{"status":"completed","maintainedResources":{"kind":"stopped"}}'::jsonb,
  clock_timestamp()
);

do $$
declare caught text;
begin
  caught := null;
  begin
    insert into public.public_website_booking_grants(
      id, tenant_stable_id, business_workspace_id, work_id, capability_id,
      capability_version, inquiry_capability_id, inquiry_version, provider,
      display_name, time_zone, published_by
    ) values (
      'd1220000-0000-4000-8000-000000000063', 'd1220000-0000-4000-8000-000000000022',
      'd1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000042',
      'after-exit', 1, 'inquiries', 1, 'outlook', 'After exit', 'UTC',
      'd1220000-0000-4000-8000-000000000001'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(
    caught in ('workspace_exit_future_work_blocked', 'public_booking_workspace_exit_blocked'),
    'workspace exit must stop new booking capability publication'
  );

  caught := null;
  begin
    insert into public.public_website_bookings(
      id, grant_id, tenant_stable_id, tenant_id_at_reservation, business_workspace_id,
      work_id, capability_id, capability_version, provider, inquiry_id,
      request_id_hash, request_fingerprint, slot_id, slot_start_at, slot_end_at,
      calendar_request_id, management_token_hash,
      management_token_ciphertext, expected_revision, title, start_at, end_at,
      time_zone, status
    ) values (
      'd1220000-0000-4000-8000-000000000078', 'd1220000-0000-4000-8000-000000000062', 'd1220000-0000-4000-8000-000000000022', 'public-booking-c', 'd1220000-0000-4000-8000-000000000012', 'd1220000-0000-4000-8000-000000000042', 'consultations', 2, 'outlook', 'inquiry-c-after-exit', repeat('a', 64), repeat('c', 64), 'slot-c-after-exit', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'public-request-c-after-exit', repeat('a', 64), 'encrypted-management-token-c2', 1, 'Consultation', '2026-10-01T13:00:00Z', '2026-10-01T14:00:00Z', 'America/New_York', 'confirmed'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_public_booking(
    caught in ('workspace_exit_future_work_blocked', 'public_booking_workspace_exit_blocked'),
    'workspace exit must stop new public booking receipts'
  );

  update public.public_website_bookings
     set start_at = '2026-10-01T14:00:00Z', end_at = '2026-10-01T15:00:00Z', updated_at = clock_timestamp()
   where id = 'd1220000-0000-4000-8000-000000000072';
  raise exception 'post-exit booking reschedule was accepted';
exception when others then
  if sqlerrm = 'post-exit booking reschedule was accepted' then raise; end if;
  perform pg_temp.assert_public_booking(
    sqlerrm in ('workspace_exit_future_work_blocked', 'public_booking_workspace_exit_blocked'),
    'workspace exit must stop public booking reschedules'
  );
end;
$$;

select 'public website booking schema checks passed' as result;
