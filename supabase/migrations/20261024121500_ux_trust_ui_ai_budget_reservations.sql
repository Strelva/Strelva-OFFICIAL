-- A5: service-only, atomic admission for bounded business AI calls.
-- Unconfirmed calls keep their ceiling through the original period. No timeout
-- releases funds that an accepted provider request might still consume.
begin;
set local lock_timeout = '5s';
create table public.business_ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  maximum_cost_usd numeric(14,8) not null check (maximum_cost_usd > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index business_ai_budget_reservations_workspace_idx
  on public.business_ai_budget_reservations(workspace_id, period_start, period_end);
alter table public.business_ai_budget_reservations enable row level security;
revoke all on public.business_ai_budget_reservations from public, anon, authenticated, service_role;
alter table public.model_call_log add column budget_reservation_id uuid
  references public.business_ai_budget_reservations(id) on delete set null;
create index model_call_log_budget_reservation_idx on public.model_call_log(budget_reservation_id)
  where budget_reservation_id is not null;

create or replace function public.business_ai_budget(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ent record; since timestamptz; resets timestamptz; spent numeric; held numeric; unknown_calls bigint;
begin
  if p_workspace_id is null or not exists(select 1 from public.workspaces where id = p_workspace_id) then return null; end if;
  select e.spending_cap_cents, e.period_start, e.period_end into ent
    from public.work_allowance_subscription_entitlements e
    where e.workspace_id = p_workspace_id and e.status in ('active','trialing')
      and clock_timestamp() >= e.period_start and clock_timestamp() < e.period_end
    order by e.period_start desc, e.id limit 1;
  since := coalesce(ent.period_start, date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC');
  resets := coalesce(ent.period_end, since + interval '1 month');
  select coalesce(sum(cost_usd), 0), count(*) filter (where cost_usd is null and budget_reservation_id is null)
    into spent, unknown_calls from public.model_call_log
    where workspace_id = p_workspace_id and called_at >= since and called_at < resets
      and purpose in ('ask','ask.background','rebuild','work_plan','report','review_reply','suggestion','weekly_brief');
  -- Retain upper bounds rather than releasing estimated/unknown provider charges.
  -- The known portion is displayed as spend; the remainder stays reserved.
  select coalesce(sum(greatest(r.maximum_cost_usd - coalesce(c.cost,0),0)),0) into held
    from public.business_ai_budget_reservations r
    left join lateral (select sum(cost_usd) as cost from public.model_call_log
      where budget_reservation_id = r.id) c on true
    where r.workspace_id = p_workspace_id and r.period_start < resets and r.period_end > since;
  return jsonb_build_object('spentUsd', spent::text, 'reservedUsd', held::text,
    'since', since, 'resetsAt', resets, 'capCents', ent.spending_cap_cents,
    'subscribed', ent.period_start is not null, 'unknownCostCalls', unknown_calls);
end;
$$;

create function public.reserve_business_ai_budget(p_workspace_id uuid, p_maximum_cost_usd numeric, p_free_cap_usd numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_budget jsonb; cap numeric; reservation uuid;
begin
  if p_workspace_id is null or p_maximum_cost_usd is null or p_maximum_cost_usd <= 0
    or p_maximum_cost_usd::text in ('NaN','Infinity','-Infinity')
    or p_maximum_cost_usd > 999999.99999999 or scale(p_maximum_cost_usd) > 8
    or (p_free_cap_usd is not null and (p_free_cap_usd < 0 or scale(p_free_cap_usd) > 8
      or p_free_cap_usd::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'business_ai_budget_invalid';
  end if;
  -- Serialize readers+reservation writers for this workspace. Never authorize
  -- from an application-side read; a second concurrent call sees the first hold.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 202610241215));
  -- FOR UPDATE conflicts with the FK key-share lock needed to insert a new
  -- entitlement; FOR SHARE alone would leave a concurrent-insert gap.
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'business_ai_budget_unavailable'; end if;
  -- Keep a concurrent entitlement update from changing the cap during admission.
  perform 1 from public.work_allowance_subscription_entitlements
    where workspace_id = p_workspace_id for share;
  current_budget := public.business_ai_budget(p_workspace_id);
  if current_budget is null or (current_budget->>'unknownCostCalls')::bigint > 0 then
    raise exception 'business_ai_budget_unavailable';
  end if;
  cap := case when (current_budget->>'subscribed')::boolean
    then (current_budget->>'capCents')::numeric / 100 else p_free_cap_usd end;
  if cap is null then raise exception 'business_ai_budget_unavailable'; end if;
  if (current_budget->>'spentUsd')::numeric + (current_budget->>'reservedUsd')::numeric + p_maximum_cost_usd > cap then
    return jsonb_build_object('status','paused','reservationId',null,'budget',current_budget);
  end if;
  insert into public.business_ai_budget_reservations(workspace_id, period_start, period_end, maximum_cost_usd)
    values (p_workspace_id, (current_budget->>'since')::timestamptz, (current_budget->>'resetsAt')::timestamptz, p_maximum_cost_usd)
    returning id into reservation;
  return jsonb_build_object('status','reserved','reservationId',reservation,'budget',public.business_ai_budget(p_workspace_id));
end;
$$;
revoke all on function public.reserve_business_ai_budget(uuid,numeric,numeric) from public, anon, authenticated;
grant execute on function public.reserve_business_ai_budget(uuid,numeric,numeric) to service_role;
create or replace function public.record_model_calls(p_calls jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_tenant uuid;
  v_workspace uuid;
  v_reservation uuid;
begin
  if p_calls is null or jsonb_typeof(p_calls) <> 'array' or jsonb_array_length(p_calls) = 0
    or jsonb_array_length(p_calls) > 100 or octet_length(p_calls::text) > 200000 then
    raise exception 'model_call_invalid';
  end if;
  for v_row in select value from jsonb_array_elements(p_calls) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'model_call_invalid'; end if;
    v_tenant := null;
    if jsonb_typeof(v_row->'tenantId') = 'string' then
      select stable_id into v_tenant from public.tenants where id = v_row->>'tenantId';
    end if;
    v_workspace := null;
    if jsonb_typeof(v_row->'workspaceId') = 'string' then
      select id into v_workspace from public.workspaces where id::text = v_row->>'workspaceId';
    end if;
    v_reservation := null;
    if jsonb_typeof(v_row->'budgetReservationId') = 'string' then
      select id into v_reservation from public.business_ai_budget_reservations
        where id = (v_row->>'budgetReservationId')::uuid and workspace_id = v_workspace
          and v_row->>'purpose' in ('ask','ask.background','rebuild','work_plan','report','review_reply','suggestion','weekly_brief')
          and (v_row->>'calledAt')::timestamptz >= period_start
          and (v_row->>'calledAt')::timestamptz < period_end;
      if v_reservation is null then raise exception 'model_call_invalid'; end if;
    end if;
    begin
      insert into public.model_call_log(called_at, purpose, workspace_id, system_id, tenant_stable_id, tenant_slug_at_call,
        actor_kind, model_label, attempt, step, input_tokens, output_tokens, latency_ms, outcome, error_kind,
        cost_usd, cost_source, price_table_version, budget_reservation_id)
      values ((v_row->>'calledAt')::timestamptz, v_row->>'purpose', v_workspace,
        case when jsonb_typeof(v_row->'systemId') = 'string' then (v_row->>'systemId')::uuid end,
        v_tenant, case when jsonb_typeof(v_row->'tenantId') = 'string' then v_row->>'tenantId' end,
        v_row->>'actorKind', v_row->>'modelLabel', (v_row->>'attempt')::smallint, (v_row->>'step')::smallint,
        case when jsonb_typeof(v_row->'inputTokens') = 'number' then (v_row->>'inputTokens')::integer end,
        case when jsonb_typeof(v_row->'outputTokens') = 'number' then (v_row->>'outputTokens')::integer end,
        (v_row->>'latencyMs')::integer, v_row->>'outcome',
        case when jsonb_typeof(v_row->'errorKind') = 'string' then v_row->>'errorKind' end,
        case when jsonb_typeof(v_row->'costUsd') = 'string' then (v_row->>'costUsd')::numeric end,
        v_row->>'costSource',
        case when jsonb_typeof(v_row->'priceTableVersion') = 'string' then v_row->>'priceTableVersion' end, v_reservation);
    exception when others then
      raise exception 'model_call_invalid';
    end;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

commit;
