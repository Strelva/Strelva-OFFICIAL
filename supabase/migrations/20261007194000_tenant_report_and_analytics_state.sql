-- Systems catalog section 5: report cadence, last-sent markers and the
-- analytics config move from Redis into Postgres.
--
-- Today the only copies live in Redis:
--   reb:report-cadence:{tenant}  operator cadence override ('weekly' or 'monthly')
--   reb:report-sent:{tenant}     epoch ms of the last report email
--   analytics:cfg:{tenant}       { gscProperty, ga4PropertyId, updatedAt }
-- After this migration the app writes both places and reads Postgres first.
-- The Redis keys are never renamed or deleted; they stay a read fallback, and
-- the last-sent read takes the later of the two markers so a missed copy can
-- never send a report twice.
--
-- Additive only. It does not alter `tenants`, `/api/v1`, Redis or any
-- existing function. It depends only on `tenants(stable_id)`.
--
-- Identity. Rows key on the tenant's `stable_id`, so a slug rename keeps them
-- (the Redis keys still move with the slug in src/lib/tenant-rename.ts).
-- Deprovisioning a tenant deletes its rows, like every tenant-scoped table.
--
-- Access. RLS on, every table privilege revoked. The app reaches the tables
-- only through service-role security-definer functions.

create table public.tenant_report_state (
  tenant_stable_id uuid primary key references public.tenants(stable_id) on delete cascade,
  cadence text check (cadence is null or cadence in ('weekly', 'monthly')),
  last_sent_at timestamptz,
  recorded_via text not null check (recorded_via in ('dual_write', 'backfill')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.tenant_report_state enable row level security;
revoke all on public.tenant_report_state from public, anon, authenticated, service_role;

create table public.tenant_analytics_config (
  tenant_stable_id uuid primary key references public.tenants(stable_id) on delete cascade,
  gsc_property text check (gsc_property is null or char_length(gsc_property) between 1 and 300),
  ga4_property_id text check (ga4_property_id is null or char_length(ga4_property_id) between 1 and 120),
  config_updated_at timestamptz,
  recorded_via text not null check (recorded_via in ('dual_write', 'backfill')),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.tenant_analytics_config enable row level security;
revoke all on public.tenant_analytics_config from public, anon, authenticated, service_role;

-- Read one tenant's report state. Null when the tenant is unknown or has no
-- row, so the caller falls back to Redis. lastSentAt is epoch milliseconds,
-- the same unit the Redis marker uses.
create function public.read_tenant_report_state(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row public.tenant_report_state%rowtype;
begin
  select s.* into v_row from public.tenant_report_state s
    join public.tenants t on t.stable_id = s.tenant_stable_id
    where t.id = p_tenant_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'cadence', v_row.cadence,
    'lastSentAt', case when v_row.last_sent_at is null then null
      else floor(extract(epoch from v_row.last_sent_at) * 1000)::bigint end);
end;
$$;

-- Set the cadence override. A backfill copy only fills a cadence that is not
-- set yet, so it never overwrites a newer operator choice.
create function public.set_tenant_report_cadence(p_tenant_id text, p_cadence text, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_cadence text;
begin
  if p_via is null or p_via not in ('dual_write', 'backfill')
    or p_cadence is null or p_cadence not in ('weekly', 'monthly') then
    raise exception 'tenant_report_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'tenant_report_unknown_tenant'; end if;
  insert into public.tenant_report_state(tenant_stable_id, cadence, recorded_via)
    values (v_stable, p_cadence, p_via)
  on conflict (tenant_stable_id) do update set
    cadence = case when p_via = 'backfill' then coalesce(tenant_report_state.cadence, excluded.cadence)
      else excluded.cadence end,
    recorded_via = case when p_via = 'backfill' and tenant_report_state.cadence is not null
      then tenant_report_state.recorded_via else excluded.recorded_via end,
    updated_at = clock_timestamp()
  returning cadence into v_cadence;
  return jsonb_build_object('cadence', v_cadence);
end;
$$;

-- Record a report send. The marker only moves forward: a backfill or a late
-- write with an older time never makes the next report due early.
create function public.mark_tenant_report_sent(p_tenant_id text, p_sent_at timestamptz, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_sent timestamptz;
begin
  if p_via is null or p_via not in ('dual_write', 'backfill') or p_sent_at is null
    or p_sent_at < timestamptz '2020-01-01' or p_sent_at > clock_timestamp() + interval '1 day' then
    raise exception 'tenant_report_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'tenant_report_unknown_tenant'; end if;
  insert into public.tenant_report_state(tenant_stable_id, last_sent_at, recorded_via)
    values (v_stable, p_sent_at, p_via)
  on conflict (tenant_stable_id) do update set
    last_sent_at = greatest(coalesce(tenant_report_state.last_sent_at, excluded.last_sent_at), excluded.last_sent_at),
    updated_at = clock_timestamp()
  returning last_sent_at into v_sent;
  return jsonb_build_object('lastSentAt', floor(extract(epoch from v_sent) * 1000)::bigint);
end;
$$;

-- Read one tenant's stored analytics config. Null when there is no row, so
-- the caller falls back to Redis and then to the siteUrl-derived default.
create function public.read_tenant_analytics_config(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row public.tenant_analytics_config%rowtype;
begin
  select c.* into v_row from public.tenant_analytics_config c
    join public.tenants t on t.stable_id = c.tenant_stable_id
    where t.id = p_tenant_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'gscProperty', v_row.gsc_property,
    'ga4PropertyId', v_row.ga4_property_id,
    'updatedAt', case when v_row.config_updated_at is null then null
      else to_char(v_row.config_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
end;
$$;

-- Write the whole config. A backfill copy never replaces an existing row.
create function public.write_tenant_analytics_config(p_tenant_id text, p_config jsonb, p_via text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_updated timestamptz; v_written boolean;
begin
  if p_via is null or p_via not in ('dual_write', 'backfill')
    or p_config is null or jsonb_typeof(p_config) <> 'object'
    or (p_config ? 'gscProperty' and jsonb_typeof(p_config->'gscProperty') not in ('string', 'null'))
    or (p_config ? 'ga4PropertyId' and jsonb_typeof(p_config->'ga4PropertyId') not in ('string', 'null'))
    or (p_config ? 'updatedAt' and jsonb_typeof(p_config->'updatedAt') not in ('string', 'null'))
    or char_length(coalesce(p_config->>'gscProperty', 'x')) not between 1 and 300
    or char_length(coalesce(p_config->>'ga4PropertyId', 'x')) not between 1 and 120 then
    raise exception 'tenant_analytics_invalid';
  end if;
  begin
    v_updated := (p_config->>'updatedAt')::timestamptz;
  exception when others then
    raise exception 'tenant_analytics_invalid';
  end;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'tenant_analytics_unknown_tenant'; end if;
  if p_via = 'backfill' then
    insert into public.tenant_analytics_config(tenant_stable_id, gsc_property, ga4_property_id, config_updated_at, recorded_via)
      values (v_stable, p_config->>'gscProperty', p_config->>'ga4PropertyId', v_updated, p_via)
    on conflict (tenant_stable_id) do nothing;
    v_written := found;
  else
    insert into public.tenant_analytics_config(tenant_stable_id, gsc_property, ga4_property_id, config_updated_at, recorded_via)
      values (v_stable, p_config->>'gscProperty', p_config->>'ga4PropertyId', v_updated, p_via)
    on conflict (tenant_stable_id) do update set
      gsc_property = excluded.gsc_property,
      ga4_property_id = excluded.ga4_property_id,
      config_updated_at = excluded.config_updated_at,
      recorded_via = excluded.recorded_via,
      updated_at = clock_timestamp();
    v_written := true;
  end if;
  return jsonb_build_object('status', case when v_written then 'written' else 'exists' end);
end;
$$;

revoke all on function public.read_tenant_report_state(text) from public, anon, authenticated;
revoke all on function public.set_tenant_report_cadence(text, text, text) from public, anon, authenticated;
revoke all on function public.mark_tenant_report_sent(text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.read_tenant_analytics_config(text) from public, anon, authenticated;
revoke all on function public.write_tenant_analytics_config(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.read_tenant_report_state(text) to service_role;
grant execute on function public.set_tenant_report_cadence(text, text, text) to service_role;
grant execute on function public.mark_tenant_report_sent(text, timestamptz, text) to service_role;
grant execute on function public.read_tenant_analytics_config(text) to service_role;
grant execute on function public.write_tenant_analytics_config(text, jsonb, text) to service_role;
