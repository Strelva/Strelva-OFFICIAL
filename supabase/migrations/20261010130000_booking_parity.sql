-- Daily parity evidence only; no booking/client data writes. Settings fix
-- preserves native hours on later legacy config mirrors. Additive functions.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create function public.record_booking_parity_batch(p_reports jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_report jsonb; v_count integer;
begin
  if p_reports is null or jsonb_typeof(p_reports) <> 'array' then raise exception 'booking_parity_invalid'; end if;
  -- Coverage is validated on the authoritative tenant table, including quiet
  -- tenants. A cached/truncated list cannot certify a day.
  select count(*) into v_count from public.tenants;
  if v_count = 0 or jsonb_array_length(p_reports) <> v_count
    or (select count(distinct r->>'tenant') from jsonb_array_elements(p_reports) r) <> v_count
    or exists (select 1 from public.tenants t where not exists
      (select 1 from jsonb_array_elements(p_reports) r where r->>'tenant' = t.id)) then
    raise exception 'booking_parity_incomplete';
  end if;
  for v_report in select value from jsonb_array_elements(p_reports) loop
    perform public.record_client_record_parity('bookings', v_report->>'tenant',
      (v_report->>'legacyCount')::integer, (v_report->>'storeCount')::integer,
      (v_report->>'missing')::integer, (v_report->>'mismatched')::integer);
  end loop;
  return jsonb_build_object('recorded', v_count);
end;
$$;
revoke all on function public.record_booking_parity_batch(jsonb) from public, anon, authenticated;
grant execute on function public.record_booking_parity_batch(jsonb) to service_role;

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
      mode = case when s.recorded_via = 'native' and p_via <> 'native' then s.mode else excluded.mode end, buffer_minutes = excluded.buffer_minutes,
      min_notice_minutes = excluded.min_notice_minutes, max_advance_days = excluded.max_advance_days,
      default_length_minutes = excluded.default_length_minutes, max_per_day = excluded.max_per_day,
      timezone = excluded.timezone,
      -- A mirror may change numeric settings, but never reopen the native
      -- hours or silently turn an owner-request schedule into instant mode.
      bookable_hours = case when s.recorded_via = 'native' and p_via <> 'native' then s.bookable_hours else excluded.bookable_hours end,
      bookable_overrides = excluded.bookable_overrides, legacy_requires_payment = excluded.legacy_requires_payment,
      recorded_via = case when s.recorded_via = 'native' then 'native' else excluded.recorded_via end, revision = s.revision + 1, updated_at = clock_timestamp()
    returning * into v_row;
  exception
    when check_violation or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'booking_invalid';
  end;
  return jsonb_build_object('status', case when v_row.revision = 1 then 'recorded' else 'updated' end, 'revision', v_row.revision);
end;
$$;
commit;
