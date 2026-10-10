-- What happens to a booking after it is taken (bookings spec, "Approvals",
-- "Notifications", "Manage link", "Placing a booking"). Builds on the one
-- booking store (20261008141000_booking_store.sql). Additive only.
--
--   business_booking_messages   the send log: each reminder, owner chase and
--                               lapse notice is claimed once and never sent
--                               twice (unique booking + kind).
--   claim_booking_messages      due customer reminders (24 h and 2 h before a
--                               confirmed booking) and the one owner reminder
--                               for a request unanswered after 24 hours.
--   finish_booking_message      records what the send path returned.
--   expire_booking_holds        the sweep: an agent hold not confirmed in 15
--                               minutes is released (cancelled, with history).
--   lapse_booking_requests      the request's own 72-hour clock: an unanswered
--                               request is declined ("Expired"), never
--                               confirmed by silence, and the customer is told.
--   read_workspace_booking      one booking of one business (Needs you reads
--                               why a request stopped waiting).
--   read_public_booking_by_manage_token
--                               the manage link (/b/[token]) finds its receipt
--                               by the token's hash alone; the token never
--                               leaves the hash at rest.
--   record_workspace_booking    copies a schedule reservation that has no
--                               public receipt (made in the workspace) into
--                               the one store: on the calendar of the tenant
--                               the schedule is published to, else the
--                               workspace's own calendar.
--   set_tenant_booking_hours    booking-only hours edited from the bookings
--                               screen. Narrowing only: refused unless the
--                               business record has hours and every range
--                               lies inside them.
--
-- Access. RLS on, every table privilege revoked, service-role functions only.
-- Workspace functions refuse a booking of another business.

create table public.business_booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.business_bookings(id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'reminder_2h', 'request_owner_reminder', 'request_lapsed')),
  status text not null default 'claimed' check (status in ('claimed', 'sent', 'suppressed', 'failed', 'skipped')),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  detail text check (detail is null or char_length(detail) <= 500),
  claimed_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  unique (booking_id, kind)
);
create index business_booking_messages_claimed_idx on public.business_booking_messages(status, claimed_at) where status = 'claimed';

-- Requests and holds age on their own clocks; reminders look ahead by start.
create index business_bookings_clock_idx on public.business_bookings(status, created_at) where status in ('held', 'requested');
create index business_bookings_upcoming_idx on public.business_bookings(start_at) where status = 'confirmed';
-- The manage link looks a receipt up by the token hash alone.
create index public_website_bookings_manage_token_idx on public.public_website_bookings(management_token_hash);

alter table public.business_booking_messages enable row level security;
revoke all on public.business_booking_messages from public, anon, authenticated, service_role;

-- Claim every message that is due now, at most p_limit. A booking taken
-- inside a reminder's window (a booking made 5 hours ahead) skips that
-- reminder: the confirmation just went out. Imported bookings get none:
-- the other tool sends its own. Returns [{messageId, kind, booking}].
create function public.claim_booking_messages(p_now timestamptz, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row record;
  v_id uuid;
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'booking_invalid';
  end if;
  for v_row in
    select * from (
      select b.id as booking_id, 'reminder_2h'::text as kind, b.start_at as due_order
        from public.business_bookings b
        where b.status = 'confirmed' and b.origin <> 'import' and b.customer_email is not null
          and b.start_at > p_now and b.start_at <= p_now + interval '2 hours'
          and b.created_at <= b.start_at - interval '2 hours'
      union all
      select b.id, 'reminder_24h', b.start_at
        from public.business_bookings b
        where b.status = 'confirmed' and b.origin <> 'import' and b.customer_email is not null
          and b.start_at > p_now + interval '2 hours' and b.start_at <= p_now + interval '24 hours'
          and b.created_at <= b.start_at - interval '24 hours'
      union all
      select b.id, 'request_owner_reminder', b.created_at
        from public.business_bookings b
        where b.status = 'requested' and b.public_reservation_id is null
          and b.created_at <= p_now - interval '24 hours' and b.created_at > p_now - interval '72 hours'
    ) due
    where not exists (select 1 from public.business_booking_messages m where m.booking_id = due.booking_id and m.kind = due.kind)
    order by due.due_order, due.booking_id
    limit p_limit
  loop
    v_id := null;
    insert into public.business_booking_messages(booking_id, kind)
      values (v_row.booking_id, v_row.kind)
      on conflict (booking_id, kind) do nothing
      returning id into v_id;
    -- Another run claimed it first: it is theirs to send.
    if v_id is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId', v_id, 'kind', v_row.kind,
      'booking', (select public.booking_json(b) from public.business_bookings b where b.id = v_row.booking_id)));
  end loop;
  return v_out;
end;
$$;

-- What the one send path returned for one claimed message. A message is
-- finished once; a second finish is refused so a retry can't hide a send.
create function public.finish_booking_message(p_message_id uuid, p_status text, p_provider_message_id text, p_detail text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.business_booking_messages;
begin
  if p_status is null or p_status not in ('sent', 'suppressed', 'failed', 'skipped') then
    raise exception 'booking_invalid';
  end if;
  update public.business_booking_messages
    set status = p_status, provider_message_id = left(p_provider_message_id, 200), detail = left(p_detail, 500),
      finished_at = clock_timestamp()
    where id = p_message_id and status = 'claimed'
    returning * into v_row;
  if not found then
    return jsonb_build_object('status', 'not_claimed');
  end if;
  return jsonb_build_object('status', 'finished', 'messageStatus', v_row.status);
end;
$$;

-- The hold sweep. An agent's hold that the customer has not confirmed in 15
-- minutes is released. Returns {expired: n}.
create function public.expire_booking_holds(p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; v_row record;
begin
  if p_now is null then raise exception 'booking_invalid'; end if;
  for v_row in
    select id from public.business_bookings
      where status = 'held' and created_at <= p_now - interval '15 minutes'
      order by created_at, id
      for update skip locked
  loop
    update public.business_bookings set status = 'cancelled', cancelled_at = coalesce(cancelled_at, clock_timestamp()), updated_at = clock_timestamp()
      where id = v_row.id;
    insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
      values (v_row.id, 'system', 'held', 'cancelled', 'Hold expired: the customer did not confirm in 15 minutes');
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('expired', v_count);
end;
$$;

-- The request's own clock (it replaces the Needs you 3/7/14-day clock for
-- this kind). A public API reservation's `requested` row means its calendar
-- read-back is pending, not an owner decision, so it has no such clock. After 72 hours unanswered the request is declined, never
-- confirmed, and a `request_lapsed` message is claimed for the customer when
-- there is an address. Returns [{messageId, booking}] (messageId may be null).
create function public.lapse_booking_requests(p_now timestamptz, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row public.business_bookings;
  v_msg uuid;
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'booking_invalid'; end if;
  for v_row in
    select * from public.business_bookings
      where status = 'requested' and public_reservation_id is null and created_at <= p_now - interval '72 hours'
      order by created_at, id
      limit p_limit
      for update skip locked
  loop
    update public.business_bookings set status = 'declined', updated_at = clock_timestamp()
      where id = v_row.id returning * into v_row;
    insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
      values (v_row.id, 'system', 'requested', 'declined', 'Expired: the owner did not answer in 72 hours');
    v_msg := null;
    if v_row.customer_email is not null then
      insert into public.business_booking_messages(booking_id, kind) values (v_row.id, 'request_lapsed')
        on conflict (booking_id, kind) do nothing returning id into v_msg;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId', v_msg, 'booking', public.booking_json(v_row)));
  end loop;
  return v_out;
end;
$$;

-- One booking of one business with its latest history row, or null. Refuses
-- (returns null for) a booking of another business.
create function public.read_workspace_booking(p_workspace_id uuid, p_booking_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.booking_json(b) || jsonb_build_object('lastChange', (
      select jsonb_build_object('actor', h.actor, 'from', h.from_status, 'to', h.to_status, 'reason', h.reason)
      from public.business_booking_history h where h.booking_id = b.id order by h.at desc, h.id desc limit 1))
  from public.business_bookings b
  where p_workspace_id is not null and b.id = p_booking_id and b.workspace_id = p_workspace_id
$$;

-- The manage link's lookup: the receipt whose management token hashes to
-- p_token_hash. Exactly one match or nothing. Returns the current tenant slug
-- (the stored one may be renamed) and only what the page shows.
create function public.read_public_booking_by_manage_token(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_count integer; v_row record;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select count(*) into v_count from public.public_website_bookings where management_token_hash = p_token_hash;
  if v_count <> 1 then return null; end if;
  select p.*, t.id as current_tenant_id, t.site_name as site_name into v_row
    from public.public_website_bookings p
    join public.tenants t on t.stable_id = p.tenant_stable_id
    where p.management_token_hash = p_token_hash;
  if not found then return null; end if;
  return jsonb_build_object(
    'tenantId', v_row.current_tenant_id,
    'siteName', v_row.site_name,
    'reservationId', v_row.id,
    'capabilityId', v_row.capability_id,
    'capabilityVersion', v_row.capability_version,
    'title', v_row.title,
    'start', to_char(v_row.start_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'end', to_char(v_row.end_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'timeZone', v_row.time_zone,
    'status', v_row.status);
end;
$$;

-- A schedule reservation made in the workspace (no public receipt) into the
-- one store. Calendar: the tenant the schedule is published to (its booking
-- grant), so it blocks that site's slots; else the workspace's own calendar.
-- Identity is the schedule and its request id, so a rerun is `unchanged`.
-- p_booking: {workId, requestId, status, title, start, end, timeZone}.
-- Returns {status: recorded|updated|unchanged|conflict, booking}.
create function public.record_workspace_booking(p_workspace_id uuid, p_booking jsonb, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_work uuid;
  v_calendar uuid;
  v_tenant uuid;
  v_system uuid;
  v_ref text;
  v_status text;
  v_start timestamptz;
  v_end timestamptz;
  v_tz text;
  v_title text;
  v_existing public.business_bookings;
  v_row public.business_bookings;
begin
  if p_workspace_id is null or p_via is null or p_via not in ('backfill', 'repair', 'native')
    or p_booking is null or jsonb_typeof(p_booking) <> 'object' then
    raise exception 'booking_invalid';
  end if;
  begin
    v_work := (p_booking->>'workId')::uuid;
    v_start := (p_booking->>'start')::timestamptz;
    v_end := (p_booking->>'end')::timestamptz;
    v_tz := coalesce(p_booking->>'timeZone', 'UTC');
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'booking_invalid';
  end;
  v_status := p_booking->>'status';
  v_title := left(nullif(btrim(coalesce(p_booking->>'title', '')), ''), 160);
  if v_work is null or v_start is null or v_end is null or v_end <= v_start or v_title is null
    or coalesce(char_length(p_booking->>'requestId'), 0) not between 1 and 100
    or v_status is null or v_status not in ('confirmed', 'cancelled') then
    raise exception 'booking_invalid';
  end if;
  if not exists (select 1 from public.saved_product_work w where w.id = v_work and w.workspace_id = p_workspace_id
      and w.product_id = 'scheduling' and w.resource_kind = 'schedule') then
    raise exception 'booking_not_found';
  end if;
  select g.tenant_stable_id into v_tenant from public.public_website_booking_grants g
    where g.business_workspace_id = p_workspace_id and g.work_id = v_work
    order by g.created_at, g.id limit 1;
  v_calendar := coalesce(v_tenant, p_workspace_id);
  select s.id into v_system from public.systems s
    where s.business_workspace_id = p_workspace_id and s.kind = 'booking' order by s.created_at, s.id limit 1;
  v_ref := 'schedule:' || md5(v_work::text || ':' || (p_booking->>'requestId'));

  perform pg_advisory_xact_lock(hashtextextended(v_calendar::text, 9106));
  select * into v_existing from public.business_bookings where calendar_key = v_calendar and legacy_id = v_ref for update;
  if found then
    if v_existing.status = v_status and v_existing.start_at = v_start and v_existing.end_at = v_end then
      return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_existing));
    end if;
    begin
      update public.business_bookings set status = v_status, start_at = v_start, end_at = v_end, block_end_at = v_end,
          cancelled_at = case when v_status = 'cancelled' then coalesce(cancelled_at, clock_timestamp()) else null end,
          updated_at = clock_timestamp()
        where id = v_existing.id returning * into v_row;
    exception when exclusion_violation then
      return jsonb_build_object('status', 'conflict', 'booking', null);
    end;
    if v_existing.status is distinct from v_row.status then
      insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
        values (v_row.id, case p_via when 'backfill' then 'migration' else 'system' end, v_existing.status, v_row.status, 'Schedule reservation changed');
    end if;
    return jsonb_build_object('status', 'updated', 'booking', public.booking_json(v_row));
  end if;

  begin
    insert into public.business_bookings(calendar_key, tenant_stable_id, workspace_id, system_id, status, origin,
      service_name_at_booking, start_at, end_at, buffer_minutes, block_end_at, time_zone, customer_name,
      legacy_id, recorded_via, created_at, cancelled_at)
    values (v_calendar, v_tenant, p_workspace_id, v_system, v_status, 'owner',
      v_title, v_start, v_end, 0, v_end, v_tz, v_title,
      v_ref, p_via, clock_timestamp(), case when v_status = 'cancelled' then clock_timestamp() end)
    returning * into v_row;
  exception
    when exclusion_violation then
      return jsonb_build_object('status', 'conflict', 'booking', null);
    when check_violation or not_null_violation then
      raise exception 'booking_invalid';
  end;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values (v_row.id, case p_via when 'backfill' then 'migration' else 'system' end, null, v_row.status, 'Copied from the workspace schedule');
  return jsonb_build_object('status', 'recorded', 'booking', public.booking_json(v_row));
end;
$$;

-- Booking-only hours edited from the bookings screen. They can only narrow
-- the business record's hours: refused when the record has none, or when any
-- range starts or ends outside the record's open hours for that weekday.
-- p_hours: [{day, opens, closes}] (an empty array closes booking on every
-- day; null clears the narrowing). Keeps every other setting. The caller has
-- checked the person may manage this business's bookings.
create function public.set_tenant_booking_hours(p_workspace_id uuid, p_tenant_id text, p_hours jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_hours jsonb;
  v_range jsonb;
  v_ok boolean;
  v_row public.booking_settings;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null or v.workspace_id is distinct from p_workspace_id or p_workspace_id is null then
    raise exception 'booking_not_found';
  end if;
  if p_hours is not null and (jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 70) then
    raise exception 'booking_invalid';
  end if;
  select f.value into v_hours from public.business_record_facts f where f.workspace_id = v.workspace_id and f.fact_key = 'hours';
  if v_hours is null or jsonb_typeof(v_hours->'weekly') <> 'array' then
    raise exception 'booking_hours_need_record';
  end if;
  for v_range in select value from jsonb_array_elements(coalesce(p_hours, '[]'::jsonb)) loop
    if jsonb_typeof(v_range->'day') <> 'number' or (v_range->>'day')::int not between 0 and 6
      or coalesce(v_range->>'opens', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(v_range->>'closes', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or v_range->>'opens' >= v_range->>'closes' then
      raise exception 'booking_invalid';
    end if;
    select exists (select 1 from jsonb_array_elements(v_hours->'weekly') w
      where (w->>'day')::int = (v_range->>'day')::int and w->>'opens' <= v_range->>'opens' and w->>'closes' >= v_range->>'closes')
      into v_ok;
    if not v_ok then raise exception 'booking_hours_outside_record'; end if;
  end loop;
  insert into public.booking_settings as s (calendar_key, tenant_stable_id, workspace_id, bookable_hours, recorded_via)
    values (v.tenant_stable_id, v.tenant_stable_id, v.workspace_id, p_hours, 'native')
    on conflict (calendar_key) do update set bookable_hours = excluded.bookable_hours,
      workspace_id = coalesce(s.workspace_id, excluded.workspace_id), recorded_via = 'native',
      revision = s.revision + 1, updated_at = clock_timestamp()
    returning * into v_row;
  return jsonb_build_object('status', 'updated', 'revision', v_row.revision, 'bookableHours', v_row.bookable_hours);
end;
$$;

revoke all on function public.claim_booking_messages(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.finish_booking_message(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.expire_booking_holds(timestamptz) from public, anon, authenticated;
revoke all on function public.lapse_booking_requests(timestamptz, integer) from public, anon, authenticated;
revoke all on function public.read_workspace_booking(uuid, uuid) from public, anon, authenticated;
revoke all on function public.read_public_booking_by_manage_token(text) from public, anon, authenticated;
revoke all on function public.record_workspace_booking(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_tenant_booking_hours(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_booking_messages(timestamptz, integer) to service_role;
grant execute on function public.finish_booking_message(uuid, text, text, text) to service_role;
grant execute on function public.expire_booking_holds(timestamptz) to service_role;
grant execute on function public.lapse_booking_requests(timestamptz, integer) to service_role;
grant execute on function public.read_workspace_booking(uuid, uuid) to service_role;
grant execute on function public.read_public_booking_by_manage_token(text) to service_role;
grant execute on function public.record_workspace_booking(uuid, jsonb, text) to service_role;
grant execute on function public.set_tenant_booking_hours(uuid, text, jsonb) to service_role;
