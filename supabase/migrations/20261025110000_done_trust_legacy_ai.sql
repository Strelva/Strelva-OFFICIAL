-- Preserve paid legacy AI access through the canonical tenant/workspace link.
-- Native current-period caps win; legacy active/trialing relationships are
-- subscribed without inventing a new spending cap. No records are rewritten.
begin;
set local lock_timeout = '5s';
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
    'subscribed', ent.period_start is not null or exists (
      select 1 from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      where l.workspace_id = p_workspace_id and t.subscription_status in ('active','trialing')
    ), 'unknownCostCalls', unknown_calls);
end;
$$;

create or replace function public.reserve_business_ai_budget(p_workspace_id uuid, p_maximum_cost_usd numeric, p_free_cap_usd numeric) returns jsonb
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
  -- The workspace lock fences new links through its foreign key. Lock existing
  -- links and tenants too: a webhook cannot revoke a legacy subscription, nor
  -- can unlink/tenant deletion change the relationship during this admission.
  perform 1 from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id order by t.stable_id for share of t, l;
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

commit;
