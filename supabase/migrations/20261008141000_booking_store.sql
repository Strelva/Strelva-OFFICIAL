-- One booking store (Strelva Reborn §2; bookings spec, "Bookings in the 1.0.0
-- model", docs/capabilities/bookings/bookings-spec-2026-10-01.md).
--
-- Today three stores don't talk: the tenant `bookings` table (plus Redis config
-- and slot locks), the schedule JSON in `saved_product_work`, and the
-- `public_website_bookings` receipts. This migration adds the one store both
-- route families land in:
--
--   business_bookings         every booking, legacy widget and public API alike
--   business_booking_history  one immutable row per status change
--   booking_settings          what is about booking only (mode, buffer, notice,
--                             advance window, daily cap, narrower hours).
--                             Weekly hours, time zone, services, phone and the
--                             owner recipient are read from the business record.
--
-- Identity. A booking's calendar is `calendar_key`: the tenant's stable id for
-- bookings taken through a tenant route (both `/api/booking/*` and
-- `/api/v1/bookings/[tenant]/*`), else the workspace id. It never changes, so a
-- widget booking and an API reservation for the same site share one calendar.
-- `tenant_stable_id` has no foreign key, like `tenant_leads`: a booking
-- outlives a deprovisioned tenant row.
--
-- One slot, one booking. The exclusion constraint refuses two held, requested
-- or confirmed bookings whose time plus buffer overlaps on one calendar. It
-- replaces the Redis slot locks once reads flip. Imported bookings (Calendly)
-- are the other tool's record: they are always kept and block those times for
-- Strelva's routes, but are not refused for overlapping.
--
-- Additive. `public_website_bookings` gains a nullable `booking_id`; nothing
-- else existing changes. The legacy `bookings` table is not touched; the app
-- copies it (dual-write, backfill) and compares before any read flips.
--
-- Access. RLS on, every table privilege revoked. Service-role functions only;
-- the app checks membership before any workspace-scoped call, and the
-- workspace functions refuse a booking of another business.

create extension if not exists btree_gist;

create table public.booking_settings (
  calendar_key uuid primary key,
  tenant_stable_id uuid,
  workspace_id uuid references public.workspaces(id) on delete set null,
  mode text not null default 'instant' check (mode in ('instant', 'request')),
  buffer_minutes integer not null default 15 check (buffer_minutes between 0 and 240),
  min_notice_minutes integer not null default 240 check (min_notice_minutes between 0 and 525600),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 730),
  default_length_minutes integer not null default 60 check (default_length_minutes between 5 and 1440),
  max_per_day integer check (max_per_day is null or max_per_day between 1 and 500),
  -- Used only where the business record has no hours (an unconverted site).
  timezone text not null default 'America/New_York' check (char_length(timezone) between 1 and 64),
  -- Narrower bookable hours: [{day, opens, closes}], and [{date, closed, opens?, closes?, label?}].
  bookable_hours jsonb check (bookable_hours is null or (jsonb_typeof(bookable_hours) = 'array' and jsonb_array_length(bookable_hours) <= 70)),
  bookable_overrides jsonb check (bookable_overrides is null or (jsonb_typeof(bookable_overrides) = 'array' and jsonb_array_length(bookable_overrides) <= 366)),
  -- Legacy `requirePayment: true`: not carried (payments are out of scope), kept for the migration report.
  legacy_requires_payment boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  recorded_via text not null check (recorded_via in ('dual_write', 'repair', 'backfill', 'native')),
  updated_at timestamptz not null default clock_timestamp(),
  check (tenant_stable_id is null or calendar_key = tenant_stable_id)
);

create table public.business_bookings (
  id uuid primary key default gen_random_uuid(),
  calendar_key uuid not null,
  tenant_stable_id uuid,
  tenant_slug_at_booking text check (tenant_slug_at_booking is null or char_length(tenant_slug_at_booking) between 1 and 120),
  workspace_id uuid references public.workspaces(id) on delete set null,
  system_id uuid references public.systems(id) on delete set null,
  status text not null check (status in ('held', 'requested', 'confirmed', 'cancelled', 'declined', 'no_show', 'completed')),
  origin text not null check (origin in ('site', 'inquiry', 'agent', 'owner', 'import', 'legacy')),
  service_ref text check (service_ref is null or char_length(service_ref) between 1 and 200),
  business_service_id uuid references public.business_services(id) on delete set null,
  service_name_at_booking text not null check (char_length(service_name_at_booking) between 1 and 160),
  start_at timestamptz not null,
  end_at timestamptz not null,
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  -- end_at plus the buffer, stored so the exclusion constraint's range is immutable.
  block_end_at timestamptz not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  customer_email text check (customer_email is null or char_length(customer_email) <= 320),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 80),
  contact_id uuid references public.business_contacts(id) on delete set null,
  intake_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(intake_answers) = 'object' and octet_length(intake_answers::text) <= 20000),
  inquiry_id text check (inquiry_id is null or char_length(inquiry_id) between 1 and 200),
  -- The tenant `bookings.id`, kept for old links and activity.
  legacy_id text check (legacy_id is null or char_length(legacy_id) between 1 and 120),
  -- The `public_website_bookings.id` receipt of an API reservation.
  public_reservation_id uuid,
  external_source text check (external_source is null or external_source in ('calendly')),
  external_ref text check (external_ref is null or char_length(external_ref) between 1 and 500),
  request_fingerprint text check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$'),
  manage_token_hash text check (manage_token_hash is null or manage_token_hash ~ '^[a-f0-9]{64}$'),
  recorded_via text not null check (recorded_via in ('dual_write', 'repair', 'backfill', 'native', 'import')),
  created_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  check (end_at > start_at),
  check (block_end_at >= end_at),
  check (tenant_stable_id is null or calendar_key = tenant_stable_id),
  check ((external_source is null) = (external_ref is null)),
  check (origin <> 'import' or external_source is not null),
  constraint business_bookings_one_slot exclude using gist (
    calendar_key with =,
    tstzrange(start_at, block_end_at, '[)') with &&
  ) where (status in ('held', 'requested', 'confirmed') and origin <> 'import')
);
create unique index business_bookings_legacy_idx on public.business_bookings(calendar_key, legacy_id) where legacy_id is not null;
create unique index business_bookings_reservation_idx on public.business_bookings(public_reservation_id) where public_reservation_id is not null;
create unique index business_bookings_external_idx on public.business_bookings(calendar_key, external_source, external_ref) where external_ref is not null;
create index business_bookings_calendar_idx on public.business_bookings(calendar_key, start_at);
create index business_bookings_workspace_idx on public.business_bookings(workspace_id, status, start_at) where workspace_id is not null;

create table public.business_booking_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.business_bookings(id) on delete cascade,
  actor text not null check (actor in ('visitor', 'owner', 'member', 'strelva', 'import', 'migration', 'system')),
  from_status text check (from_status is null or from_status in ('held', 'requested', 'confirmed', 'cancelled', 'declined', 'no_show', 'completed')),
  to_status text not null check (to_status in ('held', 'requested', 'confirmed', 'cancelled', 'declined', 'no_show', 'completed')),
  reason text check (reason is null or char_length(reason) <= 500),
  at timestamptz not null default clock_timestamp()
);
create index business_booking_history_booking_idx on public.business_booking_history(booking_id, at, id);

alter table public.public_website_bookings add column booking_id uuid references public.business_bookings(id) on delete set null;

alter table public.booking_settings enable row level security;
alter table public.business_bookings enable row level security;
alter table public.business_booking_history enable row level security;
revoke all on public.booking_settings, public.business_bookings, public.business_booking_history
  from public, anon, authenticated, service_role;

create function public.business_booking_history_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'booking_history_immutable';
end;
$$;
create trigger business_booking_history_immutable before update on public.business_booking_history
  for each row execute function public.business_booking_history_immutable();

-- Who a tenant is, for the booking functions: stable id, linked workspace and
-- that business's bookings System (the earliest of kind `booking`).
create function public.booking_tenant(p_tenant_id text)
returns table (tenant_stable_id uuid, workspace_id uuid, system_id uuid, system_lifecycle text)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.stable_id, l.workspace_id, s.id, s.lifecycle
  from public.tenants t
  left join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
  left join lateral (
    select x.id, x.lifecycle from public.systems x
    where x.business_workspace_id = l.workspace_id and x.kind = 'booking'
    order by x.created_at, x.id limit 1
  ) s on true
  where t.id = p_tenant_id
$$;

create function public.booking_json(b public.business_bookings) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id,
    'calendarKey', b.calendar_key,
    'tenantStableId', b.tenant_stable_id,
    'tenantId', (select t.id from public.tenants t where t.stable_id = b.tenant_stable_id),
    'workspaceId', b.workspace_id,
    'systemId', b.system_id,
    'status', b.status,
    'origin', b.origin,
    'serviceRef', b.service_ref,
    'businessServiceId', b.business_service_id,
    'serviceName', b.service_name_at_booking,
    'start', to_char(b.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'end', to_char(b.end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'bufferMinutes', b.buffer_minutes,
    'timeZone', b.time_zone,
    'localDate', to_char(b.start_at at time zone b.time_zone, 'YYYY-MM-DD'),
    'localStart', to_char(b.start_at at time zone b.time_zone, 'HH24:MI'),
    'localEnd', to_char(b.end_at at time zone b.time_zone, 'HH24:MI'),
    'customer', jsonb_strip_nulls(jsonb_build_object('name', b.customer_name, 'email', b.customer_email, 'phone', b.customer_phone)),
    'contactId', b.contact_id,
    'intakeAnswers', b.intake_answers,
    'inquiryId', b.inquiry_id,
    'legacyId', b.legacy_id,
    'publicReservationId', b.public_reservation_id,
    'externalSource', b.external_source,
    'externalRef', b.external_ref,
    'recordedVia', b.recorded_via,
    'createdAt', to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancelledAt', case when b.cancelled_at is null then null
      else to_char(b.cancelled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  )
$$;

-- Everything a booking route needs about the business, read at use and never
-- copied: record hours, services, phone, the bookings System's pause, and the
-- booking-only settings. `hours` is null when the record has none.
create function public.read_tenant_booking_context(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_settings public.booking_settings;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null then return null; end if;
  select * into v_settings from public.booking_settings where calendar_key = v.tenant_stable_id;
  return jsonb_build_object(
    'tenantStableId', v.tenant_stable_id,
    'workspaceId', v.workspace_id,
    'systemId', v.system_id,
    'paused', coalesce(v.system_lifecycle = 'paused', false),
    'hours', (select f.value from public.business_record_facts f where f.workspace_id = v.workspace_id and f.fact_key = 'hours'),
    'phone', (select f.value from public.business_record_facts f where f.workspace_id = v.workspace_id and f.fact_key = 'phone'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'durationMinutes', s.duration_minutes,
        'active', s.active, 'externalRef', s.external_ref) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v.workspace_id), '[]'::jsonb),
    'settings', case when v_settings.calendar_key is null then null else jsonb_build_object(
      'mode', v_settings.mode,
      'bufferMinutes', v_settings.buffer_minutes,
      'minNoticeMinutes', v_settings.min_notice_minutes,
      'maxAdvanceDays', v_settings.max_advance_days,
      'defaultLengthMinutes', v_settings.default_length_minutes,
      'maxPerDay', v_settings.max_per_day,
      'timezone', v_settings.timezone,
      'bookableHours', v_settings.bookable_hours,
      'bookableOverrides', v_settings.bookable_overrides,
      'legacyRequiresPayment', v_settings.legacy_requires_payment,
      'revision', v_settings.revision) end
  );
end;
$$;

-- Replace one tenant's booking settings. Returns {status, revision}.
create function public.upsert_tenant_booking_settings(p_tenant_id text, p_settings jsonb, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_row public.booking_settings;
begin
  if p_via is null or p_via not in ('dual_write', 'repair', 'backfill', 'native')
    or p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'booking_invalid';
  end if;
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null then raise exception 'booking_unknown_tenant'; end if;
  begin
    insert into public.booking_settings as s (calendar_key, tenant_stable_id, workspace_id, mode, buffer_minutes,
      min_notice_minutes, max_advance_days, default_length_minutes, max_per_day, timezone, bookable_hours,
      bookable_overrides, legacy_requires_payment, recorded_via)
    values (v.tenant_stable_id, v.tenant_stable_id, v.workspace_id,
      coalesce(p_settings->>'mode', 'instant'),
      coalesce((p_settings->>'bufferMinutes')::integer, 15),
      coalesce((p_settings->>'minNoticeMinutes')::integer, 240),
      coalesce((p_settings->>'maxAdvanceDays')::integer, 60),
      coalesce((p_settings->>'defaultLengthMinutes')::integer, 60),
      (p_settings->>'maxPerDay')::integer,
      coalesce(p_settings->>'timezone', 'America/New_York'),
      case when jsonb_typeof(p_settings->'bookableHours') = 'array' then p_settings->'bookableHours' end,
      case when jsonb_typeof(p_settings->'bookableOverrides') = 'array' then p_settings->'bookableOverrides' end,
      coalesce((p_settings->>'legacyRequiresPayment')::boolean, false),
      p_via)
    on conflict (calendar_key) do update set
      workspace_id = coalesce(excluded.workspace_id, s.workspace_id),
      mode = excluded.mode, buffer_minutes = excluded.buffer_minutes,
      min_notice_minutes = excluded.min_notice_minutes, max_advance_days = excluded.max_advance_days,
      default_length_minutes = excluded.default_length_minutes, max_per_day = excluded.max_per_day,
      timezone = excluded.timezone, bookable_hours = excluded.bookable_hours,
      bookable_overrides = excluded.bookable_overrides, legacy_requires_payment = excluded.legacy_requires_payment,
      recorded_via = excluded.recorded_via, revision = s.revision + 1, updated_at = clock_timestamp()
    returning * into v_row;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'booking_invalid';
  end;
  return jsonb_build_object('status', case when v_row.revision = 1 then 'recorded' else 'updated' end, 'revision', v_row.revision);
end;
$$;

-- Record one booking taken (or copied) through a tenant route. Idempotent on
-- the legacy id, the public reservation id or the external ref: a replay
-- updates status and times and writes a history row when the status moved.
-- Returns {status: recorded|updated|unchanged|conflict, booking}. `conflict`
-- means the exclusion constraint refused it: the slot is taken.
create function public.record_tenant_booking(p_tenant_id text, p_booking jsonb, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_existing public.business_bookings;
  v_row public.business_bookings;
  v_start timestamptz;
  v_end timestamptz;
  v_buffer integer;
  v_status text;
  v_origin text;
  v_tz text;
  v_service uuid;
  v_contact uuid;
  v_email text;
  v_actor text;
  v_reservation uuid;
  v_created timestamptz;
  v_cancelled timestamptz;
begin
  if p_via is null or p_via not in ('dual_write', 'repair', 'backfill', 'native', 'import')
    or p_booking is null or jsonb_typeof(p_booking) <> 'object' or octet_length(p_booking::text) > 40000 then
    raise exception 'booking_invalid';
  end if;
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null then raise exception 'booking_unknown_tenant'; end if;

  v_status := p_booking->>'status';
  v_origin := p_booking->>'origin';
  v_tz := p_booking->>'timeZone';
  v_buffer := coalesce((p_booking->>'bufferMinutes')::integer, 0);
  v_email := lower(nullif(btrim(coalesce(p_booking#>>'{customer,email}', '')), ''));
  begin
    v_start := (p_booking->>'start')::timestamptz;
    v_end := (p_booking->>'end')::timestamptz;
    v_reservation := (p_booking->>'publicReservationId')::uuid;
    v_created := coalesce((p_booking->>'createdAt')::timestamptz, clock_timestamp());
    v_cancelled := (p_booking->>'cancelledAt')::timestamptz;
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'booking_invalid';
  end;
  if v_start is null or v_end is null or v_end <= v_start or v_tz is null
    or v_buffer < 0 or v_buffer > 240
    or coalesce(p_booking->>'legacyId', p_booking->>'publicReservationId', p_booking->>'externalRef', p_booking->>'id') is null then
    raise exception 'booking_invalid';
  end if;
  v_actor := case p_via when 'backfill' then 'migration' when 'import' then 'import' else 'visitor' end;

  perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text, 9106));

  select * into v_existing from public.business_bookings b
    where b.calendar_key = v.tenant_stable_id and (
      (p_booking ? 'legacyId' and b.legacy_id = p_booking->>'legacyId')
      or (v_reservation is not null and b.public_reservation_id = v_reservation)
      or (p_booking ? 'externalRef' and b.external_source = p_booking->>'externalSource' and b.external_ref = p_booking->>'externalRef')
      or (p_booking ? 'id' and b.id::text = p_booking->>'id'))
    limit 1 for update;

  if found then
    if v_existing.status = v_status and v_existing.start_at = v_start and v_existing.end_at = v_end
      and v_existing.cancelled_at is not distinct from v_cancelled then
      return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_existing));
    end if;
    begin
      update public.business_bookings set status = v_status, start_at = v_start, end_at = v_end,
          block_end_at = v_end + make_interval(mins => v_buffer), buffer_minutes = v_buffer,
          cancelled_at = v_cancelled,
          workspace_id = coalesce(workspace_id, v.workspace_id), updated_at = clock_timestamp()
        where id = v_existing.id returning * into v_row;
    exception
      when exclusion_violation then
        return jsonb_build_object('status', 'conflict', 'booking', null);
      when check_violation then
        raise exception 'booking_invalid';
    end;
    if v_existing.status is distinct from v_row.status then
      insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
        values (v_row.id, v_actor, v_existing.status, v_row.status, left(p_booking->>'reason', 500));
    end if;
    return jsonb_build_object('status', 'updated', 'booking', public.booking_json(v_row));
  end if;

  if v.workspace_id is not null then
    select s.id into v_service from public.business_services s
      where s.workspace_id = v.workspace_id and s.external_ref = p_booking->>'serviceRef' limit 1;
    if v_email is not null and exists (select 1 from public.business_records r where r.workspace_id = v.workspace_id) then
      begin
        insert into public.business_contacts as c (workspace_id, name, email, sources, first_seen_at, last_seen_at)
          values (v.workspace_id, left(nullif(btrim(p_booking#>>'{customer,name}'), ''), 160), v_email, array['booking'],
            v_created, v_created)
          on conflict (workspace_id, email) where email is not null do update set
            sources = case when 'booking' = any(c.sources) then c.sources else c.sources || array['booking'] end,
            last_seen_at = greatest(c.last_seen_at, excluded.last_seen_at), updated_at = clock_timestamp()
          returning id into v_contact;
      exception when others then
        v_contact := null;  -- a contact that can't be matched never loses the booking
      end;
    end if;
  end if;

  begin
    insert into public.business_bookings(calendar_key, tenant_stable_id, tenant_slug_at_booking, workspace_id, system_id,
      status, origin, service_ref, business_service_id, service_name_at_booking, start_at, end_at, buffer_minutes, block_end_at,
      time_zone, customer_name, customer_email, customer_phone, contact_id, intake_answers, inquiry_id, legacy_id,
      public_reservation_id, external_source, external_ref, request_fingerprint, manage_token_hash, recorded_via,
      created_at, cancelled_at)
    values (v.tenant_stable_id, v.tenant_stable_id, p_tenant_id, v.workspace_id, v.system_id,
      v_status, v_origin, p_booking->>'serviceRef', v_service, p_booking->>'serviceName', v_start, v_end, v_buffer,
      v_end + make_interval(mins => v_buffer), v_tz,
      p_booking#>>'{customer,name}', v_email, nullif(btrim(coalesce(p_booking#>>'{customer,phone}', '')), ''),
      v_contact, coalesce(case when jsonb_typeof(p_booking->'intakeAnswers') = 'object' then p_booking->'intakeAnswers' end, '{}'::jsonb),
      p_booking->>'inquiryId', p_booking->>'legacyId', v_reservation,
      p_booking->>'externalSource', p_booking->>'externalRef', p_booking->>'requestFingerprint', p_booking->>'manageTokenHash',
      p_via, v_created, v_cancelled)
    returning * into v_row;
  exception
    when exclusion_violation then
      return jsonb_build_object('status', 'conflict', 'booking', null);
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'booking_invalid';
  end;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values (v_row.id, v_actor, null, v_row.status, left(p_booking->>'reason', 500));
  if v_reservation is not null then
    update public.public_website_bookings set booking_id = v_row.id
      where id = v_reservation and tenant_stable_id = v.tenant_stable_id and booking_id is null;
  end if;
  return jsonb_build_object('status', 'recorded', 'booking', public.booking_json(v_row));
end;
$$;

-- Change one booking's status by its legacy id or store id, for this tenant
-- only. Returns {status: updated|unchanged|not_found|conflict, booking}.
create function public.set_tenant_booking_status(p_tenant_id text, p_ref text, p_status text, p_actor text, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_existing public.business_bookings;
  v_row public.business_bookings;
begin
  if p_status is null or p_status not in ('held', 'requested', 'confirmed', 'cancelled', 'declined', 'no_show', 'completed')
    or p_actor is null or p_actor not in ('visitor', 'owner', 'member', 'strelva', 'import', 'migration', 'system')
    or p_ref is null or char_length(p_ref) > 120 then
    raise exception 'booking_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'booking_unknown_tenant'; end if;
  select * into v_existing from public.business_bookings b
    where b.calendar_key = v_stable and (b.legacy_id = p_ref or b.id::text = p_ref) limit 1 for update;
  if not found then return jsonb_build_object('status', 'not_found', 'booking', null); end if;
  if v_existing.status = p_status then
    return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_existing));
  end if;
  begin
    update public.business_bookings set status = p_status, updated_at = clock_timestamp(),
        cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, clock_timestamp()) else cancelled_at end
      where id = v_existing.id returning * into v_row;
  exception when exclusion_violation then
    return jsonb_build_object('status', 'conflict', 'booking', public.booking_json(v_existing));
  end;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values (v_row.id, p_actor, v_existing.status, p_status, left(p_reason, 500));
  return jsonb_build_object('status', 'updated', 'booking', public.booking_json(v_row));
end;
$$;

-- One tenant's bookings whose local start date falls in [p_from, p_to] (both
-- optional), oldest first. Every status; callers filter.
create function public.read_tenant_bookings(p_tenant_id text, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.booking_json(b) order by b.start_at, b.id)
    from public.business_bookings b
    where b.calendar_key = v_stable
      and (p_from is null or (b.start_at at time zone b.time_zone)::date >= p_from)
      and (p_to is null or (b.start_at at time zone b.time_zone)::date <= p_to)
  ), '[]'::jsonb);
end;
$$;

-- Booking requests waiting on the owner of one business (Needs you source).
-- The caller has already resolved the workspace; nothing of another business
-- is returned.
create function public.read_workspace_booking_requests(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.booking_json(b) order by b.start_at, b.id), '[]'::jsonb)
  from public.business_bookings b
  where p_workspace_id is not null and b.workspace_id = p_workspace_id and b.status = 'requested'
$$;

-- The owner's decision on one request: approve confirms it, not_yet declines
-- it. Refuses a booking of another business. Returns {status, booking}.
create function public.decide_workspace_booking_request(p_workspace_id uuid, p_booking_id uuid, p_decision text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existing public.business_bookings;
  v_row public.business_bookings;
  v_to text;
begin
  if p_decision is null or p_decision not in ('approve', 'not_yet') or p_actor is null or p_actor not in ('owner', 'member') then
    raise exception 'booking_invalid';
  end if;
  select * into v_existing from public.business_bookings where id = p_booking_id for update;
  if not found or v_existing.workspace_id is distinct from p_workspace_id then
    raise exception 'booking_not_found';
  end if;
  if v_existing.status <> 'requested' then
    return jsonb_build_object('status', 'already_decided', 'booking', public.booking_json(v_existing));
  end if;
  v_to := case p_decision when 'approve' then 'confirmed' else 'declined' end;
  update public.business_bookings set status = v_to, updated_at = clock_timestamp()
    where id = v_existing.id returning * into v_row;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values (v_row.id, p_actor, 'requested', v_to, case p_decision when 'approve' then 'Owner approved' else 'Owner said not yet' end);
  return jsonb_build_object('status', 'decided', 'booking', public.booking_json(v_row));
end;
$$;

-- Status history of one booking, for this tenant only.
create function public.read_tenant_booking_history(p_tenant_id text, p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_id uuid;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '[]'::jsonb; end if;
  select id into v_id from public.business_bookings b where b.calendar_key = v_stable and (b.legacy_id = p_ref or b.id::text = p_ref) limit 1;
  if v_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('actor', h.actor, 'from', h.from_status, 'to', h.to_status, 'reason', h.reason,
      'at', to_char(h.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by h.at, h.id)
    from public.business_booking_history h where h.booking_id = v_id), '[]'::jsonb);
end;
$$;

revoke all on function public.business_booking_history_immutable() from public, anon, authenticated;
revoke all on function public.booking_tenant(text) from public, anon, authenticated, service_role;
revoke all on function public.booking_json(public.business_bookings) from public, anon, authenticated, service_role;
revoke all on function public.read_tenant_booking_context(text) from public, anon, authenticated;
revoke all on function public.upsert_tenant_booking_settings(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.record_tenant_booking(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_tenant_booking_status(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.read_tenant_bookings(text, date, date) from public, anon, authenticated;
revoke all on function public.read_workspace_booking_requests(uuid) from public, anon, authenticated;
revoke all on function public.decide_workspace_booking_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.read_tenant_booking_history(text, text) from public, anon, authenticated;
grant execute on function public.read_tenant_booking_context(text) to service_role;
grant execute on function public.upsert_tenant_booking_settings(text, jsonb, text) to service_role;
grant execute on function public.record_tenant_booking(text, jsonb, text) to service_role;
grant execute on function public.set_tenant_booking_status(text, text, text, text, text) to service_role;
grant execute on function public.read_tenant_bookings(text, date, date) to service_role;
grant execute on function public.read_workspace_booking_requests(uuid) to service_role;
grant execute on function public.decide_workspace_booking_request(uuid, uuid, text, text) to service_role;
grant execute on function public.read_tenant_booking_history(text, text) to service_role;
