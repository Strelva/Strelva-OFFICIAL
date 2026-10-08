-- Business-scoped, privacy-minimized evidence for the agent booking channel.
-- The only new input telemetry is an aggregate daily discovery counter; booking
-- outcomes come from the existing immutable booking status history.
begin;
set local lock_timeout = '3s';

create table public.agent_business_discovery_days (
  calendar_key uuid not null,
  day date not null,
  calls bigint not null default 0 check (calls >= 0),
  primary key (calendar_key, day)
);
create table public.agent_business_discovery_coverage (
  calendar_key uuid primary key,
  first_observed_at timestamptz not null
);
create index agent_business_discovery_days_day_idx on public.agent_business_discovery_days(day);
alter table public.agent_business_discovery_days enable row level security;
alter table public.agent_business_discovery_coverage enable row level security;
revoke all on public.agent_business_discovery_days, public.agent_business_discovery_coverage from public, anon, authenticated, service_role;

create function public.record_agent_business_discovery(p_scopes text[]) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_scope text; v_key uuid; v_workspace uuid; v_keys uuid[] := array[]::uuid[]; v_count bigint := 0; v_day date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if p_scopes is null or cardinality(p_scopes) not between 1 and 10 then raise exception 'booking_invalid'; end if;
  -- Bound retained data to just over a year per business. These rows contain no
  -- search text, MCP caller identity, customer information or request tokens.
  delete from public.agent_business_discovery_days where day < v_day - 400;
  for v_scope in select distinct value from unnest(p_scopes) value loop
    if v_scope ~ '^workspace:[0-9a-fA-F-]{36}$' then
      v_workspace := substring(v_scope from 11)::uuid;
      perform 1 from public.workspaces where id = v_workspace;
      if not found then raise exception 'booking_unknown_tenant'; end if;
      v_key := v_workspace;
    else
      select t.tenant_stable_id, t.workspace_id into v_key, v_workspace
        from public.booking_tenant(v_scope) t;
      if v_key is null then raise exception 'booking_unknown_tenant'; end if;
      v_key := coalesce(v_key, v_workspace);
    end if;
    v_keys := array_append(v_keys, v_key);
  end loop;
  -- The same business can appear under its hosted-site id and native handle.
  -- A search result increments its business calendar only once.
  for v_key in select distinct k from unnest(v_keys) as resolved(k) loop
    insert into public.agent_business_discovery_days(calendar_key, day, calls)
      values (v_key, v_day, 1)
      on conflict (calendar_key, day) do update set calls = public.agent_business_discovery_days.calls + 1;
    insert into public.agent_business_discovery_coverage(calendar_key, first_observed_at) values (v_key, clock_timestamp())
      on conflict (calendar_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.record_agent_business_discovery(text[]) from public, anon, authenticated, service_role;
grant execute on function public.record_agent_business_discovery(text[]) to service_role;

create function public.read_agent_booking_outcomes(p_tenant_id text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_key uuid; v_keys uuid[]; v_workspace uuid; v_name text; v_discovery bigint; v_discovery_since date; v_first_observed_at timestamptz; v_discovery_coverage text; v_holds bigint; v_confirmations bigint; v_completed bigint;
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '8 days'
    or date_trunc('day', p_from at time zone 'UTC') <> p_from at time zone 'UTC'
    or date_trunc('day', p_to at time zone 'UTC') <> p_to at time zone 'UTC'
    or p_from < (((clock_timestamp() at time zone 'UTC')::date - 400)::timestamp at time zone 'UTC') then raise exception 'booking_invalid'; end if;
  if p_tenant_id ~ '^workspace:[0-9a-fA-F-]{36}$' then
    v_workspace := substring(p_tenant_id from 11)::uuid;
    v_key := v_workspace;
    v_keys := array[v_workspace];
    perform 1 from public.workspaces where id = v_workspace;
    if not found then raise exception 'booking_unknown_tenant'; end if;
  else
    select t.tenant_stable_id, t.workspace_id into v_key, v_workspace from public.booking_tenant(p_tenant_id) t;
    if v_key is null then raise exception 'booking_unknown_tenant'; end if;
    v_keys := array_remove(array[v_key, v_workspace], null::uuid);
  end if;
  select coalesce(
    (select f.value #>> '{}' from public.business_record_facts f where f.workspace_id = v_workspace and f.fact_key = 'display_name' and f.verified limit 1),
    (select f.value #>> '{}' from public.business_record_facts f where f.workspace_id = v_workspace and f.fact_key = 'legal_name' and f.verified limit 1),
    (select t.site_name from public.tenants t where t.stable_id = v_key),
    (select w.name from public.workspaces w where w.id = v_workspace),
    p_tenant_id
  ) into v_name;
  select min(c.first_observed_at) into v_first_observed_at from public.agent_business_discovery_coverage c where c.calendar_key = any(v_keys);
  v_discovery_since := (v_first_observed_at at time zone 'UTC')::date;
  -- A first observation cannot establish uninterrupted coverage: it may happen
  -- late in the day, and the feature can be disabled or writes can fail later.
  -- All observed counts are therefore lower bounds; no interval is called complete.
  v_discovery_coverage := case
    when v_first_observed_at is null or v_first_observed_at >= p_to then 'unknown'
    else 'partial'
  end;
  select coalesce(sum(d.calls), 0) into v_discovery from public.agent_business_discovery_days d
    where d.calendar_key = any(v_keys) and d.day >= (p_from at time zone 'UTC')::date and d.day < (p_to at time zone 'UTC')::date;
  select count(distinct b.id) into v_holds from public.business_bookings b
    where b.calendar_key = any(v_keys) and b.origin = 'agent' and b.created_at >= p_from and b.created_at < p_to;
  -- `confirmed_at` is written once by the customer email-confirm RPC in both
  -- request and instant modes. Status history also records owner decisions,
  -- so counting `to_status='confirmed'` would mislabel owner approval as a
  -- customer confirmation and miss request-mode customer confirmations. This
  -- receipt is retained with its access row for the booking's lifetime; both
  -- follow the booking's existing ON DELETE CASCADE lifecycle.
  select count(distinct b.id) into v_confirmations from public.business_booking_access a
    join public.business_bookings b on b.id = a.booking_id
    where b.calendar_key = any(v_keys) and b.origin = 'agent' and a.confirmed_at >= p_from and a.confirmed_at < p_to;
  select count(distinct b.id) into v_completed from public.business_booking_history h
    join public.business_bookings b on b.id = h.booking_id
    where b.calendar_key = any(v_keys) and b.origin = 'agent' and h.to_status = 'completed' and h.at >= p_from and h.at < p_to;
  return jsonb_build_object('businessName', v_name, 'discoveryCalls', v_discovery, 'discoveryCoverage', v_discovery_coverage,
    'discoverySince', v_discovery_since, 'holds', v_holds,
    'confirmations', v_confirmations, 'completed', v_completed);
end $$;
revoke all on function public.read_agent_booking_outcomes(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.read_agent_booking_outcomes(text, timestamptz, timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
