-- Lead cutover requires complete days across every tenant, and zero misses
-- during a day. Other stores retain their existing parity behavior.
begin;
set local lock_timeout = '3s';
create function public.record_tenant_lead_read_parity(
  p_tenant_id text,p_redis_count integer,p_postgres_count integer,p_missing integer,p_mismatched integer
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_day date := (clock_timestamp() at time zone 'UTC')::date; v_ok boolean;
begin
  select stable_id into v_stable from public.tenants where id=p_tenant_id;
  if v_stable is null then raise exception 'client_record_unknown_tenant'; end if;
  if p_redis_count is null or p_postgres_count is null or p_missing is null or p_mismatched is null
    or least(p_redis_count,p_postgres_count,p_missing,p_mismatched)<0 then raise exception 'client_record_invalid'; end if;
  insert into public.tenant_client_record_parity(store,tenant_stable_id,checked_on,ok,redis_count,postgres_count,missing,mismatched)
  values('tenant_leads',v_stable,v_day,p_missing=0 and p_mismatched=0,p_redis_count,p_postgres_count,p_missing,p_mismatched)
  on conflict(store,tenant_stable_id,checked_on) do update set
    checked_at=clock_timestamp(),ok=tenant_client_record_parity.ok and excluded.ok,
    redis_count=excluded.redis_count,postgres_count=excluded.postgres_count,
    missing=greatest(tenant_client_record_parity.missing,excluded.missing),
    mismatched=greatest(tenant_client_record_parity.mismatched,excluded.mismatched)
  returning ok into v_ok;
  return jsonb_build_object('ok',v_ok,'checkedOn',v_day);
end $$;

create function public.tenant_lead_read_parity_streak() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date := (clock_timestamp() at time zone 'UTC')::date; v_days integer := 0;
begin
  if not exists(select 1 from public.tenants) then return jsonb_build_object('store','tenant_leads','days',0); end if;
  -- Yesterday may close the window only when nobody has checked today yet.
  if not exists(select 1 from public.tenant_client_record_parity where store='tenant_leads' and checked_on=v_day) then
    v_day := v_day-1;
  end if;
  loop
    exit when exists(select 1 from public.tenants t where not exists(
      select 1 from public.tenant_client_record_parity p where p.store='tenant_leads'
        and p.tenant_stable_id=t.stable_id and p.checked_on=v_day and p.ok));
    v_days := v_days+1;
    v_day := v_day-1;
    exit when v_days>=366;
  end loop;
  return jsonb_build_object('store','tenant_leads','days',v_days);
end $$;
revoke all on function public.record_tenant_lead_read_parity(text,integer,integer,integer,integer),
  public.tenant_lead_read_parity_streak() from public,anon,authenticated;
grant execute on function public.record_tenant_lead_read_parity(text,integer,integer,integer,integer),
  public.tenant_lead_read_parity_streak() to service_role;
commit;
