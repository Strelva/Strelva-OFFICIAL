begin;
do $$
declare v_reports jsonb; v_result jsonb;
begin
  if has_function_privilege('anon', 'public.record_booking_parity_batch(jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.record_booking_parity_batch(jsonb)', 'execute') then
    raise exception 'parity callable by visitor';
  end if;
  begin
    perform public.record_booking_parity_batch('[]');
    raise exception 'empty batch passed';
  exception when others then
    if sqlerrm <> 'booking_parity_incomplete' then raise; end if;
  end;
  select jsonb_agg(jsonb_build_object('tenant', id, 'legacyCount', 0, 'storeCount', 0, 'missing', 0, 'mismatched', 0))
    into v_reports from public.tenants;
  v_result := public.record_booking_parity_batch(v_reports);
  if (v_result->>'recorded')::int <> jsonb_array_length(v_reports) then raise exception 'not every tenant recorded'; end if;
  -- An incomplete same-day rerun cannot overwrite a successful day's rows.
  begin
    perform public.record_booking_parity_batch(v_reports - 0);
    raise exception 'partial batch passed';
  exception when others then
    if sqlerrm <> 'booking_parity_incomplete' then raise; end if;
  end;
  v_reports := jsonb_set(v_reports, '{0,missing}', '1');
  perform public.record_booking_parity_batch(v_reports);
  if (public.client_record_parity_streak('bookings')->>'days')::int <> 0 then raise exception 'failed tenant counted as green'; end if;
end;
$$;
rollback;
