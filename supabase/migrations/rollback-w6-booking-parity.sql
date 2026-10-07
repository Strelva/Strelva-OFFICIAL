begin;
set local lock_timeout = '2s';
drop function if exists public.record_booking_parity_batch(jsonb);
drop function if exists public.booking_parity_streak();
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
commit;
