-- Refuse rollback while native commitments exist; never erase a booking.
begin;
set local lock_timeout='2s';
drop trigger zz_booking_workspace_overlap_guard on public.business_bookings;
drop function public.enforce_booking_workspace_overlap();
drop function public.change_workspace_booking_status(uuid,uuid,text,text,text,text);
drop function public.read_native_booking_workspaces();
do $$ begin if exists(select 1 from public.business_bookings where tenant_stable_id is null and service_ref is not null) or exists(select 1 from public.booking_service_policies where tenant_stable_id is null) or exists(select 1 from public.booking_instant_policies where tenant_stable_id is null) then raise exception 'native_booking_rollback_has_commitments'; end if; end $$;
create or replace function public.booking_tenant(p_tenant_id text)
returns table(tenant_stable_id uuid,workspace_id uuid,system_id uuid,system_lifecycle text)
language sql stable security definer set search_path=public,pg_temp as $$
 select t.stable_id,l.workspace_id,s.id,
   case when l.workspace_id is not null and public.workspace_exit_completed(l.workspace_id) then 'paused' else s.lifecycle end
 from public.tenants t
 left join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
 left join lateral(select x.id,x.lifecycle from public.systems x where x.business_workspace_id=l.workspace_id and x.kind='booking' order by x.created_at,x.id limit 1) s on true
 where t.id=p_tenant_id
$$;

create or replace function public.read_tenant_booking_context_before_service_policy(p_tenant_id text) returns jsonb
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

create or replace function public.read_tenant_booking_policy_before_service_policy(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('tenantStableId',v.tenant_stable_id,'workspaceId',v.workspace_id,'systemId',v.system_id,
    'paused',coalesce(v.system_lifecycle='paused',false),'settings',case when s.calendar_key is null then null else
      jsonb_build_object('mode',s.mode,'bufferMinutes',s.buffer_minutes,'minNoticeMinutes',s.min_notice_minutes,
        'maxAdvanceDays',s.max_advance_days,'defaultLengthMinutes',s.default_length_minutes,'maxPerDay',s.max_per_day,
        'timezone',s.timezone,'bookableHours',s.bookable_hours,'bookableOverrides',s.bookable_overrides,
        'legacyRequiresPayment',s.legacy_requires_payment,'revision',s.revision) end)
  from public.booking_tenant(p_tenant_id) v left join public.booking_settings s on s.calendar_key=v.tenant_stable_id
$$;

create or replace function public.upsert_tenant_booking_settings(p_tenant_id text, p_settings jsonb, p_via text) returns jsonb
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
      mode = case when s.recorded_via = 'native' and p_via <> 'native' then s.mode else excluded.mode end, buffer_minutes = case when s.recorded_via = 'native' and p_via <> 'native' then s.buffer_minutes else excluded.buffer_minutes end,
      min_notice_minutes = case when s.recorded_via = 'native' and p_via <> 'native' then s.min_notice_minutes else excluded.min_notice_minutes end, max_advance_days = case when s.recorded_via = 'native' and p_via <> 'native' then s.max_advance_days else excluded.max_advance_days end,
      default_length_minutes = case when s.recorded_via = 'native' and p_via <> 'native' then s.default_length_minutes else excluded.default_length_minutes end, max_per_day = case when s.recorded_via = 'native' and p_via <> 'native' then s.max_per_day else excluded.max_per_day end,
      timezone = case when s.recorded_via = 'native' and p_via <> 'native' then s.timezone else excluded.timezone end,
      -- A mirror may change numeric settings, but never reopen the native
      -- hours or silently turn an owner-request schedule into instant mode.
      bookable_hours = case when s.recorded_via = 'native' and p_via <> 'native' then s.bookable_hours else excluded.bookable_hours end,
      bookable_overrides = case when s.recorded_via = 'native' and p_via <> 'native' then s.bookable_overrides else excluded.bookable_overrides end, legacy_requires_payment = excluded.legacy_requires_payment,
      recorded_via = case when s.recorded_via = 'native' then 'native' else excluded.recorded_via end, revision = s.revision + 1, updated_at = clock_timestamp()
    returning * into v_row;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'booking_invalid';
  end;
  return jsonb_build_object('status', case when v_row.revision = 1 then 'recorded' else 'updated' end, 'revision', v_row.revision);
end;
$$;

create or replace function public.record_tenant_booking_before_w6(p_tenant_id text, p_booking jsonb, p_via text) returns jsonb
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

create or replace function public.record_tenant_booking(p_tenant_id text,p_booking jsonb,p_via text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record; v_before public.business_bookings; v_result jsonb; v_row public.business_bookings;
begin
 select * into v from public.booking_tenant(p_tenant_id);
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9106));
 select * into v_before from public.business_bookings b where b.calendar_key=v.tenant_stable_id and (
   (p_booking ? 'legacyId' and b.legacy_id=p_booking->>'legacyId') or
   (p_booking ? 'publicReservationId' and b.public_reservation_id::text=p_booking->>'publicReservationId') or
   (p_booking ? 'id' and b.id::text=p_booking->>'id'));
 if v_before.public_reservation_id is not null and p_booking ? 'requestFingerprint'
   and v_before.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
   raise exception 'booking_request_conflict';
 end if;
 if v_before.id is not null and (v_before.start_at is distinct from (p_booking->>'start')::timestamptz
   or v_before.end_at is distinct from (p_booking->>'end')::timestamptz) then
   p_booking := p_booking || jsonb_build_object('reason','Customer rescheduled');
 end if;
 v_result := public.record_tenant_booking_before_w6(p_tenant_id,p_booking,p_via);
 -- Native services may use the record UUID when no legacy external_ref exists.
 -- Resolve both identifiers without changing an existing booking's snapshot.
 if v_result#>>'{booking,id}' is not null then
   update public.business_bookings b set business_service_id=s.id from public.business_services s
     where b.id=(v_result#>>'{booking,id}')::uuid and b.business_service_id is null
       and s.workspace_id=b.workspace_id and (s.external_ref=b.service_ref or s.id::text=b.service_ref);
   select * into v_row from public.business_bookings where id=(v_result#>>'{booking,id}')::uuid;
   v_result := v_result || jsonb_build_object('booking',public.booking_json(v_row));
 end if;
 if v_before.id is not null and v_result->>'status'='updated' and
   (v_before.start_at is distinct from (v_result#>>'{booking,start}')::timestamptz or v_before.end_at is distinct from (v_result#>>'{booking,end}')::timestamptz) then
   if v_before.status=(v_result#>>'{booking,status}') then
     insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
     values(v_before.id,case when p_via='backfill' then 'migration' else 'visitor' end,v_before.status,v_before.status,'Customer rescheduled');
   end if;
   if v_result#>>'{booking,status}'='requested' then
     update public.business_bookings set requested_at=clock_timestamp() where id=v_before.id;
   end if;
 end if;
 return v_result;
end $$;

create or replace function public.set_tenant_booking_hours(p_workspace_id uuid, p_tenant_id text, p_hours jsonb) returns jsonb
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

create or replace function public.issue_booking_access(p_tenant_id text, p_ref text, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_a public.business_booking_access;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  select * into v_b from public.business_bookings where calendar_key = v.tenant_stable_id and (id::text = p_ref or legacy_id = p_ref) for update;
  if not found then raise exception 'booking_not_found'; end if;
  insert into public.business_booking_access(booking_id, manage_hash, manage_ciphertext, confirm_hash, confirm_ciphertext,
    status_hash, status_ciphertext, confirm_until, agent_name)
  values (v_b.id, p_access->>'manageHash', p_access->>'manageCiphertext', p_access->>'confirmHash', p_access->>'confirmCiphertext',
    p_access->>'statusHash', p_access->>'statusCiphertext', case when v_b.origin = 'agent' then v_b.created_at + interval '15 minutes' end, p_access->>'agentName')
  on conflict (booking_id) do nothing;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  return to_jsonb(v_a);
end;
$$;

create or replace function public.hold_agent_booking(p_tenant_id text, p_booking jsonb, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_result jsonb; v_access jsonb;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null then raise exception 'booking_unknown_tenant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text, 9106));
  select * into v_b from public.business_bookings where calendar_key = v.tenant_stable_id and legacy_id = p_booking->>'legacyId';
  if found then
    if v_b.origin <> 'agent' or v_b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
      raise exception 'booking_request_conflict';
    end if;
    return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_b),
      'access', (select to_jsonb(a) from public.business_booking_access a where a.booking_id = v_b.id));
  end if;
  if (select count(*) from public.business_bookings where calendar_key = v.tenant_stable_id and origin = 'agent'
    and created_at > clock_timestamp() - interval '1 hour') >= 10 then raise exception 'booking_agent_limit'; end if;
  if (public.read_tenant_booking_context(p_tenant_id)->>'paused')::boolean then raise exception 'booking_paused'; end if;
  if p_booking->>'status' <> 'held' or p_booking->>'origin' <> 'agent' then raise exception 'booking_invalid'; end if;
  v_result := public.record_tenant_booking(p_tenant_id, p_booking, 'native');
  if v_result->>'status' = 'conflict' then return v_result; end if;
  v_access := public.issue_booking_access(p_tenant_id, v_result#>>'{booking,id}', p_access);
  return v_result || jsonb_build_object('access', v_access);
end;
$$;

create or replace function public.read_tenant_booking_context(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select value || jsonb_build_object('servicePolicies',public.booking_service_policy_json((value->>'tenantStableId')::uuid))
 from (select public.read_tenant_booking_context_before_service_policy(p_tenant_id) as value) c
$$;

create or replace function public.read_tenant_booking_policy(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select value || jsonb_build_object('servicePolicies',public.booking_service_policy_json((value->>'tenantStableId')::uuid))
 from (select public.read_tenant_booking_policy_before_service_policy(p_tenant_id) as value) c
$$;

create or replace function public.set_tenant_booking_status_before_cutoff(p_tenant_id text, p_ref text, p_status text, p_actor text, p_reason text)
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

create or replace function public.read_tenant_bookings(p_tenant_id text, p_from date, p_to date) returns jsonb
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

create or replace function public.read_tenant_booking_history(p_tenant_id text, p_ref text) returns jsonb
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

create or replace function public.set_tenant_booking_status(p_tenant_id text,p_ref text,p_status text,p_actor text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.business_bookings; v_cutoff integer;
begin
 if p_status='cancelled' and p_actor='visitor' then
   select row.* into b from public.business_bookings row join public.tenants t on t.stable_id=row.calendar_key
     where t.id=p_tenant_id and (row.legacy_id=p_ref or row.id::text=p_ref) limit 1 for update of row;
   if found and b.status<>'cancelled' then
     select cancellation_cutoff_hours into v_cutoff from public.booking_settings where calendar_key=b.calendar_key;
     if b.start_at<clock_timestamp()+make_interval(hours=>coalesce(v_cutoff,24)) then
       p_reason:='Customer cancelled after the cancellation cutoff';
     end if;
   end if;
 end if;
 return public.set_tenant_booking_status_before_cutoff(p_tenant_id,p_ref,p_status,p_actor,p_reason);
end $$;

create or replace function public.read_native_booking_access(p_hash text, p_kind text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.booking_json(b) || jsonb_build_object('siteName', t.site_name,
    'confirmationRequired', b.status = 'held' and a.confirm_hash = p_hash,
    'confirmUntil', a.confirm_until, 'agentName', a.agent_name)
  from public.business_booking_access a join public.business_bookings b on b.id = a.booking_id
  join public.tenants t on t.stable_id = b.tenant_stable_id
  where (p_kind = 'manage' and a.manage_hash = p_hash)
    or (p_kind = 'confirm' and a.confirm_hash = p_hash)
    or (p_kind = 'status' and a.status_hash = p_hash)
$$;

create or replace function public.read_booking_business_details(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('name',coalesce((select f.value#>>'{}' from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='display_name'),t.site_name),
   'address',(select coalesce(f.value->>'formatted',concat_ws(', ',f.value->>'line1',f.value->>'line2',f.value->>'city',f.value->>'region',f.value->>'postalCode'))
     from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='address'))
 from public.booking_tenant(p_tenant_id) v join public.tenants t on t.stable_id=v.tenant_stable_id
$$;

create or replace function public.booking_setup_authorize(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
 select * into v from public.booking_tenant(p_tenant_id);
 if v.workspace_id is distinct from p_workspace_id or p_workspace_id is null then raise exception 'booking_not_found'; end if;
 if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin')
     and u.verified_at is not null and lower(btrim(u.email))=lower(btrim(p_email))) then raise exception 'booking_settings_denied'; end if;
 return v.tenant_stable_id;
end $$;

create or replace function public.configure_booking_setup_before_service_policy(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key uuid; v_s public.booking_settings; v_mode text; v_policy uuid;
begin
 v_key:=public.booking_setup_authorize(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,9107));
 select * into v_s from public.booking_settings where calendar_key=v_key for update;
 if coalesce(v_s.revision,0) is distinct from (p_settings->>'expectedRevision')::integer then raise exception 'booking_settings_stale'; end if;
 v_mode:=p_settings->>'mode';
 if v_mode is null or v_mode not in ('instant','request') or (p_settings->>'bufferMinutes')::int not between 0 and 120
   or (p_settings->>'minNoticeMinutes')::int not between 0 and 43200 or (p_settings->>'maxAdvanceDays')::int not between 1 and 60
   or (p_settings->>'cancellationCutoffHours')::int not between 0 and 168
   or ((p_settings->>'maxPerDay') is not null and (p_settings->>'maxPerDay')::int not between 1 and 1000) then raise exception 'booking_invalid'; end if;
 -- Editing an instant rule changes its promise: it returns to request mode
 -- until the owner approves the exact new settings revision.
 insert into public.booking_settings as s(calendar_key,tenant_stable_id,workspace_id,mode,buffer_minutes,min_notice_minutes,max_advance_days,max_per_day,cancellation_cutoff_hours,recorded_via)
 values(v_key,v_key,p_workspace_id,'request',(p_settings->>'bufferMinutes')::int,(p_settings->>'minNoticeMinutes')::int,
   (p_settings->>'maxAdvanceDays')::int,(p_settings->>'maxPerDay')::int,(p_settings->>'cancellationCutoffHours')::int,'native')
 on conflict(calendar_key) do update set mode='request',buffer_minutes=excluded.buffer_minutes,min_notice_minutes=excluded.min_notice_minutes,
   max_advance_days=excluded.max_advance_days,max_per_day=excluded.max_per_day,cancellation_cutoff_hours=excluded.cancellation_cutoff_hours,
   recorded_via='native',revision=s.revision+1,updated_at=clock_timestamp() returning * into v_s;
 update public.booking_instant_policies set status='declined',decided_at=clock_timestamp() where tenant_stable_id=v_key and status in ('proposed','active');
 if v_mode='instant' then
   insert into public.booking_instant_policies(workspace_id,tenant_stable_id,settings_revision) values(p_workspace_id,v_key,v_s.revision) returning id into v_policy;
 end if;
 return jsonb_build_object('revision',v_s.revision,'mode','request','approvalRequired',v_policy is not null,'policyId',v_policy);
end $$;

create or replace function public.booking_service_policy_json(p_tenant uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('businessServiceId',business_service_id,'mode',mode,'bufferMinutes',buffer_minutes,'bookable',bookable,'intake',intake)),'[]')
 from public.booking_service_policies where tenant_stable_id=p_tenant
$$;

create or replace function public.configure_booking_setup(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key uuid; v_services jsonb; v_service jsonb; v_record public.business_services; v_policy public.booking_service_policies; v_result jsonb; v_ids uuid[]; v_first boolean;
begin
 v_key:=public.booking_setup_authorize(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(v_key::text,9107));
 v_first:=not exists(select 1 from public.booking_settings where calendar_key=v_key);
 v_services:=p_settings->'services';
 if v_services is not null and (jsonb_typeof(v_services)<>'array' or jsonb_array_length(v_services)>100) then raise exception 'booking_invalid'; end if;
 -- Same settings revision serializes both schedule settings and service rules.
 v_result:=public.configure_booking_setup_before_service_policy(p_workspace_id,p_tenant_id,p_user_id,p_email,
   case when v_services is null then p_settings else (p_settings-'services') || '{"mode":"request"}'::jsonb end);
 if v_first then update public.booking_settings set default_length_minutes=30 where calendar_key=v_key; end if;
 if v_services is null then
   -- A global edit changes the approved promise for every service too.
   update public.booking_service_policies set mode='request',revision=revision+1 where tenant_stable_id=v_key;
   return v_result;
 end if;
 v_ids:='{}';
 for v_service in select value from jsonb_array_elements(v_services) loop
   select * into v_record from public.business_services where id=(v_service->>'businessServiceId')::uuid and workspace_id=p_workspace_id;
   if v_record.id is null or v_record.id=any(v_ids) then raise exception 'booking_invalid'; end if;
   v_ids:=array_append(v_ids,v_record.id);
   if v_service->>'mode' is null or v_service->>'mode' not in ('request','instant')
     or (v_service->>'bufferMinutes')::integer is null or (v_service->>'bufferMinutes')::integer not between 0 and 120
     or jsonb_typeof(v_service->'bookable') is distinct from 'boolean'
     or jsonb_typeof(v_service->'intake') is distinct from 'array' or jsonb_array_length(v_service->'intake')>8
     or exists(select 1 from jsonb_array_elements(v_service->'intake') q where q->>'id' is null or q->>'id' !~ '^[A-Za-z0-9_-]{1,80}$'
       or length(btrim(q->>'label')) not between 1 and 200 or q->>'label' is null or q->>'type' not in ('text','textarea') or q->>'type' is null
       or jsonb_typeof(q->'required') is distinct from 'boolean')
     or (select count(*)<>count(distinct q->>'id') from jsonb_array_elements(v_service->'intake') q)
     then raise exception 'booking_invalid'; end if;
   insert into public.booking_service_policies as p(tenant_stable_id,workspace_id,business_service_id,mode,buffer_minutes,bookable,intake)
   values(v_key,p_workspace_id,v_record.id,'request',(v_service->>'bufferMinutes')::int,(v_service->>'bookable')::boolean,v_service->'intake')
   on conflict(tenant_stable_id,business_service_id) do update set mode='request',buffer_minutes=excluded.buffer_minutes,
     bookable=excluded.bookable,intake=excluded.intake,revision=p.revision+1 returning * into v_policy;
   if v_service->>'mode'='instant' and v_policy.bookable then
     insert into public.booking_instant_policies(workspace_id,tenant_stable_id,settings_revision,business_service_id,service_policy_revision)
       values(p_workspace_id,v_key,(v_result->>'revision')::int,v_record.id,v_policy.revision);
   end if;
 end loop;
 -- An omitted configured service is no longer offered. Existing commitments survive.
 update public.booking_service_policies set mode='request',bookable=false,revision=revision+1
   where tenant_stable_id=v_key and not(business_service_id=any(v_ids));
 return v_result || jsonb_build_object('approvalRequired',exists(select 1 from public.booking_instant_policies where tenant_stable_id=v_key and status='proposed'));
end $$;

create or replace function public.read_booking_instant_policies_before_service_policy(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'workspaceId',p.workspace_id,'tenantId',t.id,'revision',p.revision,
   'settingsRevision',p.settings_revision,'siteName',t.site_name,'status',p.status)),'[]')
 from public.booking_instant_policies p join public.tenants t on t.stable_id=p.tenant_stable_id where p.workspace_id=p_workspace_id
$$;

create or replace function public.decide_booking_instant_policy_before_service_policy(p_workspace_id uuid,p_policy_id uuid,p_revision integer,p_decision text,p_user_id uuid,p_email text,p_owner_link boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_instant_policies; v_s public.booking_settings; v_tenant text;
begin
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id;
 if v.id is null then raise exception 'booking_not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9107));
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id for update;
 select id into v_tenant from public.tenants where stable_id=v.tenant_stable_id;
 -- The service-role caller verifies signed owner links through Needs you.
 -- A signed-in caller still must be this workspace's verified owner.
 if p_owner_link is distinct from true then
   perform public.booking_setup_authorize(p_workspace_id,v_tenant,p_user_id,p_email);
   if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'booking_settings_denied'; end if;
 end if;
 if v.revision is distinct from p_revision or p_decision is null or p_decision not in ('approve','not_yet') then raise exception 'booking_settings_stale'; end if;
 if v.status<>'proposed' then return jsonb_build_object('status','unchanged'); end if;
 select * into v_s from public.booking_settings where calendar_key=v.tenant_stable_id for update;
 if v_s.revision is distinct from v.settings_revision then raise exception 'booking_settings_stale'; end if;
 update public.booking_instant_policies set status=case when p_decision='approve' then 'active' else 'declined' end,decided_at=clock_timestamp() where id=v.id;
 if p_decision='approve' then update public.booking_settings set mode='instant',revision=revision+1,updated_at=clock_timestamp() where calendar_key=v.tenant_stable_id; end if;
 return jsonb_build_object('status','updated');
end $$;

create or replace function public.decide_booking_instant_policy(p_workspace_id uuid,p_policy_id uuid,p_revision integer,p_decision text,p_user_id uuid,p_email text,p_owner_link boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_instant_policies; v_s public.booking_service_policies; v_tenant text;
begin
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id;
 if v.id is null then raise exception 'booking_not_found'; end if;
 if v.business_service_id is null then return public.decide_booking_instant_policy_before_service_policy(p_workspace_id,p_policy_id,p_revision,p_decision,p_user_id,p_email,p_owner_link); end if;
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9107));
 select * into v from public.booking_instant_policies where id=p_policy_id and workspace_id=p_workspace_id for update;
 select id into v_tenant from public.tenants where stable_id=v.tenant_stable_id;
 if p_owner_link is distinct from true then
   perform public.booking_setup_authorize(p_workspace_id,v_tenant,p_user_id,p_email);
   if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then raise exception 'booking_settings_denied'; end if;
 end if;
 if v.revision is distinct from p_revision or p_decision is null or p_decision not in ('approve','not_yet') then raise exception 'booking_settings_stale'; end if;
 if v.status<>'proposed' then return '{"status":"unchanged"}'::jsonb; end if;
 select * into v_s from public.booking_service_policies where tenant_stable_id=v.tenant_stable_id and business_service_id=v.business_service_id for update;
 if v_s.revision is distinct from v.service_policy_revision or (select revision from public.booking_settings where calendar_key=v.tenant_stable_id) is distinct from v.settings_revision then raise exception 'booking_settings_stale'; end if;
 update public.booking_instant_policies set status=case when p_decision='approve' then 'active' else 'declined' end,decided_at=clock_timestamp() where id=v.id;
 if p_decision='approve' then update public.booking_service_policies set mode='instant' where tenant_stable_id=v.tenant_stable_id and business_service_id=v.business_service_id; end if;
 return '{"status":"updated"}'::jsonb;
end $$;

create or replace function public.confirm_agent_booking(p_hash text, p_force_request boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_a public.business_booking_access; v_to text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.confirm_hash = p_hash for update of b;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  if v_a.confirmed_at is not null then return jsonb_build_object('status','unchanged','booking',public.booking_json(v_b)); end if;
  if v_b.status <> 'held' or v_a.confirm_until <= clock_timestamp() or v_b.start_at <= clock_timestamp() then raise exception 'booking_hold_expired'; end if;
  v_to := case when p_force_request or coalesce((select p.mode from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(select mode from public.booking_settings where calendar_key=v_b.calendar_key),'request') = 'request'
    then 'requested' else 'confirmed' end;
  update public.business_bookings set status = v_to, updated_at = clock_timestamp() where id = v_b.id returning * into v_b;
  update public.business_booking_access set confirmed_at = clock_timestamp() where booking_id = v_b.id;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id, 'visitor', 'held', v_to, 'Customer confirmed agent request');
  return jsonb_build_object('status','updated','booking',public.booking_json(v_b));
end;
$$;

create or replace function public.change_native_booking_before_w6(p_hash text, p_change jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_before public.business_bookings; v_ctx jsonb; v_status text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.manage_hash = p_hash for update of b;
  if not found or v_b.end_at <= clock_timestamp() then raise exception 'booking_not_found'; end if;
  v_before := v_b;
  if p_change->>'action' = 'cancel' then
    if v_b.status = 'cancelled' then return public.booking_json(v_b); end if;
    update public.business_bookings set status='cancelled', cancelled_at=clock_timestamp(), updated_at=clock_timestamp()
      where id=v_b.id returning * into v_b;
  elsif p_change->>'action' = 'reschedule' then
    if v_b.status not in ('requested','confirmed') then raise exception 'booking_not_found'; end if;
    v_ctx := public.read_tenant_booking_context((select id from public.tenants where stable_id=v_b.tenant_stable_id));
    if (v_ctx->>'paused')::boolean then raise exception 'booking_paused'; end if;
    v_status := case when coalesce((select p.mode from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),v_ctx#>>'{settings,mode}','request')='request' or (p_change->>'forceRequest')::boolean
      then 'requested' else 'confirmed' end;
    begin
      update public.business_bookings set start_at=(p_change->>'start')::timestamptz, end_at=(p_change->>'end')::timestamptz,
        buffer_minutes=coalesce((select p.buffer_minutes from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes),
        block_end_at=(p_change->>'end')::timestamptz + make_interval(mins=>coalesce((select p.buffer_minutes from public.booking_service_policies p where p.tenant_stable_id=v_b.tenant_stable_id and p.business_service_id=v_b.business_service_id),(v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes)),
        status=v_status, updated_at=clock_timestamp()
        where id=v_b.id returning * into v_b;
    exception when exclusion_violation then raise exception 'booking_slot_taken'; end;
  else raise exception 'booking_invalid'; end if;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id,'visitor',v_before.status,v_b.status,case when p_change->>'action'='cancel' then
      case when v_before.start_at < clock_timestamp()+make_interval(hours=>coalesce((select (to_jsonb(s)->>'cancellation_cutoff_hours')::integer from public.booking_settings s where calendar_key=v_b.calendar_key),24))
        then 'Customer cancelled after the cancellation cutoff' else 'Customer cancelled' end
      else 'Customer rescheduled' end);
  return public.booking_json(v_b);
end;
$$;

create or replace function public.enforce_booking_service_policy() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.booking_service_policies; v_record public.business_services; v_q jsonb; v_new_time boolean;
begin
 if new.recorded_via<>'native' or new.origin in ('legacy','import') or new.service_ref is null then return new; end if;
 v_new_time:=tg_op='INSERT';
 if tg_op='UPDATE' then v_new_time:=new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at; end if;
 if not v_new_time and not(tg_op='UPDATE' and old.status='held' and new.status in ('requested','confirmed')) then return new; end if;
 select * into v_record from public.business_services where workspace_id=new.workspace_id and (id::text=new.service_ref or external_ref=new.service_ref) limit 1;
 select * into v from public.booking_service_policies where tenant_stable_id=new.tenant_stable_id and business_service_id=v_record.id;
 if v.business_service_id is null then return new; end if;
 if not v.bookable or not v_record.active then raise exception 'booking_service_unavailable'; end if;
 for v_q in select value from jsonb_array_elements(v.intake) loop
   if (v_q->>'required')::boolean and coalesce(btrim(new.intake_answers->>(v_q->>'id')),'')='' then raise exception 'booking_intake_required'; end if;
 end loop;
 if exists(select 1 from jsonb_each_text(new.intake_answers) a where length(a.value)>2000 or
   (a.key not in ('notes','message') and not exists(select 1 from jsonb_array_elements(v.intake) q where q->>'id'=a.key))) then raise exception 'booking_invalid'; end if;
 new.business_service_id:=v_record.id;
 new.buffer_minutes:=v.buffer_minutes;
 new.block_end_at:=new.end_at+make_interval(mins=>v.buffer_minutes);
 if new.status='confirmed' and v.mode='request' and new.origin<>'owner' then new.status:='requested'; end if;
 return new;
end $$;

create or replace function public.sync_booking_calendar_health(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_connection public.workspace_calendar_connections; v_revision text; v_out jsonb;
begin
 if not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id) then
  raise exception 'booking_health_workspace_unlinked';
 end if;
 -- Serialize both cron processes for this business, before reading connection state.
 perform 1 from public.workspaces where id=p_workspace_id for update;
 update public.booking_calendar_health_actions a set state='resolved',resolved_at=now()
 where a.workspace_id=p_workspace_id and a.state='open' and not exists(
  select 1 from public.workspace_calendar_connections c where c.id=a.connection_id and c.workspace_id=p_workspace_id
   and c.status in ('error','revoked') and a.revision_hash=md5(c.id::text||':'||c.provider||':'||c.calendar_id||':'||c.status));
 for v_connection in select * from public.workspace_calendar_connections where workspace_id=p_workspace_id and status in ('error','revoked') order by id limit 2 loop
  v_revision:=md5(v_connection.id::text||':'||v_connection.provider||':'||v_connection.calendar_id||':'||v_connection.status);
  insert into public.booking_calendar_health_actions(workspace_id,connection_id,revision_hash)
   values(p_workspace_id,v_connection.id,v_revision) on conflict(connection_id) where state='open' do nothing;
 end loop;
 select jsonb_build_object('businessName',w.name,'timezone',coalesce((select f.value->>'timezone'
  from public.business_record_facts f where f.workspace_id=p_workspace_id and f.fact_key='hours'),'America/New_York'),
  'actions',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision_hash,'provider',c.provider,'status',c.status,'delivery',a.delivery_status) order by a.id)
   from public.booking_calendar_health_actions a join public.workspace_calendar_connections c on c.id=a.connection_id
   where a.workspace_id=p_workspace_id and a.state='open'),'[]'::jsonb)) into v_out from public.workspaces w where w.id=p_workspace_id;
 return v_out;
end $$;

create or replace function public.claim_booking_calendar_health(p_workspace_id uuid,p_id uuid,p_revision text,p_day date) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.booking_calendar_health_actions; c public.workspace_calendar_connections;
begin
 if p_day is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id) then return false; end if;
 select * into a from public.booking_calendar_health_actions where id=p_id and workspace_id=p_workspace_id for update;
 if a.id is null or a.state<>'open' or a.revision_hash<>p_revision or a.delivery_status in ('sent','claimed') or a.last_attempt_day=p_day then return false; end if;
 select * into c from public.workspace_calendar_connections where id=a.connection_id and workspace_id=p_workspace_id for share;
 if c.id is null or c.status not in ('error','revoked') or a.revision_hash<>md5(c.id::text||':'||c.provider||':'||c.calendar_id||':'||c.status) then return false; end if;
 update public.booking_calendar_health_actions set delivery_status='claimed',last_attempt_day=p_day,delivery_reason=null where id=a.id;
 return true;
end $$;

create or replace function public.read_workspace_booking_evidence(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_out jsonb; v_health text;
begin
  perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_verified_email);
  select t.stable_id into v_stable from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    where t.id=p_tenant_id and l.workspace_id=p_workspace_id;
  if v_stable is null then raise exception 'workspace_access_denied'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>6 then raise exception 'booking_invalid'; end if;
  select case when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='connected' and calendar_id<>'pending') then 'connected'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status in ('error','revoked')) then 'reconnect'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='authorized') then 'setup'
    else 'not_connected' end into v_health;
  with selected as (
    select b.* from public.business_bookings b where b.calendar_key=v_stable
      and (b.start_at at time zone b.time_zone)::date between p_from and p_to
      order by b.start_at,b.id limit 501
  ), visible as (select * from selected order by start_at,id limit 500)
  select jsonb_build_object('calendarHealth',v_health,'truncated',(select count(*)>500 from selected),
    'bookings',coalesce(jsonb_agg(jsonb_build_object('booking',public.booking_json(b),
      'calendar',(select jsonb_build_object('status',case when m.status='verified' and b.status in ('confirmed','cancelled') and m.updated_at<b.updated_at then 'unknown' else m.status end,'updatedAt',m.updated_at) from public.business_booking_calendar_mirrors m where m.booking_id=b.id),
      'history',coalesce((select jsonb_agg(e.entry order by e.at,e.id) from (
        select * from (
          select h.at,h.id,jsonb_build_object('kind','change','actor',h.actor,'from',h.from_status,'to',h.to_status,'reason',h.reason,'at',h.at) entry
          from public.business_booking_history h where h.booking_id=b.id
          union all
          select coalesce(m.finished_at,m.claimed_at),m.id,jsonb_build_object('kind','reminder','reminder',m.kind,'status',m.status,'at',coalesce(m.finished_at,m.claimed_at))
          from public.business_booking_messages m where m.booking_id=b.id
        ) events order by at desc,id desc limit 50
      ) e),'[]'::jsonb),
      'historyTruncated',(select count(*) from public.business_booking_history h where h.booking_id=b.id)+(select count(*) from public.business_booking_messages m where m.booking_id=b.id)>50
    ) order by b.start_at,b.id),'[]'::jsonb)) into v_out from visible b;
  return v_out;
end $$;

create or replace function public.mark_workspace_booking_no_show(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_ref text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; b public.business_bookings;
begin
  perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_verified_email);
  select t.stable_id into v_stable from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    where t.id=p_tenant_id and l.workspace_id=p_workspace_id;
  if v_stable is null then raise exception 'workspace_access_denied'; end if;
  select * into b from public.business_bookings where calendar_key=v_stable and (id::text=p_ref or legacy_id=p_ref) for update;
  if b.id is null or b.end_at>clock_timestamp() or b.status not in ('confirmed','no_show') then raise exception 'booking_not_found'; end if;
  if b.status='no_show' then return public.booking_json(b); end if;
  update public.business_bookings set status='no_show',updated_at=clock_timestamp() where id=b.id returning * into b;
  insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
    values(b.id,case when exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then 'owner' else 'member' end,'confirmed','no_show','Marked as no-show');
  if b.legacy_id is not null then
    update public.bookings set status='completed' where tenant_id=p_tenant_id and id=b.legacy_id;
  end if;
  return public.booking_json(b);
end $$;
create or replace function public.create_workspace_manual_booking(p_workspace_id uuid,p_tenant_id text,p_user_id uuid,p_email text,p_booking jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; b public.business_bookings; s public.business_services; v_ref text;
begin
 ctx:=public.read_workspace_manual_booking_context(p_workspace_id,p_tenant_id,p_user_id,p_email);
 perform pg_advisory_xact_lock(hashtextextended(ctx->>'tenantStableId',9107));
 -- Recheck membership, pause and record after the lock.
 ctx:=public.read_workspace_manual_booking_context(p_workspace_id,p_tenant_id,p_user_id,p_email);
 v_ref:=p_booking->>'legacyId';
 if v_ref is null or v_ref !~ '^manual-[A-Za-z0-9_-]{8,80}$' then raise exception 'booking_invalid'; end if;
 select * into b from public.business_bookings where calendar_key=(ctx->>'tenantStableId')::uuid and legacy_id=v_ref for update;
 if found then
   if b.origin<>'owner' or b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then raise exception 'booking_request_conflict'; end if;
   return jsonb_build_object('status','unchanged','booking',public.booking_json(b));
 end if;
 if (ctx->>'paused')::boolean then raise exception 'booking_paused'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'booking_paused'; end if;
 select * into s from public.business_services where workspace_id=p_workspace_id and active
   and (id::text=p_booking->>'serviceRef' or external_ref=p_booking->>'serviceRef');
 if not found then raise exception 'booking_invalid'; end if;
 if (p_booking->>'start')::timestamptz<=clock_timestamp() or (p_booking->>'end')::timestamptz<=(p_booking->>'start')::timestamptz then raise exception 'booking_invalid'; end if;
 -- Origin is set here, never trusted from the browser. Staff file a request;
 -- approval remains the owner's existing Needs you decision.
 return public.record_tenant_booking(p_tenant_id,p_booking||jsonb_build_object('origin','owner','status','requested',
   'serviceName',s.name,'bufferMinutes',coalesce((ctx#>>'{settings,bufferMinutes}')::integer,15),
   'timeZone',coalesce(ctx#>>'{hours,timezone}',ctx#>>'{settings,timezone}','America/New_York')),'native');
end $$;

drop index public.booking_service_policies_calendar_key_idx;
alter table public.booking_service_policies drop constraint booking_service_policy_calendar_check;
alter table public.booking_service_policies drop column calendar_key;
alter table public.booking_service_policies alter column tenant_stable_id set not null;
alter table public.booking_service_policies add primary key(tenant_stable_id,business_service_id);
alter table public.booking_instant_policies drop constraint booking_instant_policy_calendar_check;
alter table public.booking_instant_policies drop column calendar_key;
alter table public.booking_instant_policies alter column tenant_stable_id set not null;
commit;
