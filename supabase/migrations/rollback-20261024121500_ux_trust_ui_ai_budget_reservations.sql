-- Refuse to erase unresolved cost commitments. Disable calls and resolve them
-- before rollback; retained rows are evidence, not expendable cache.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists(select 1 from public.business_ai_budget_reservations) then
    raise exception 'business_ai_budget_rollback_has_reservations';
  end if;
end $$;
create or replace function public.record_model_calls(p_calls jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row jsonb;
  v_count integer := 0;
  v_tenant uuid;
  v_workspace uuid;
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
    begin
      insert into public.model_call_log(called_at, purpose, workspace_id, system_id, tenant_stable_id, tenant_slug_at_call,
        actor_kind, model_label, attempt, step, input_tokens, output_tokens, latency_ms, outcome, error_kind,
        cost_usd, cost_source, price_table_version)
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
        case when jsonb_typeof(v_row->'priceTableVersion') = 'string' then v_row->>'priceTableVersion' end);
    exception when others then
      raise exception 'model_call_invalid';
    end;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.business_ai_budget(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ent record; since timestamptz; spent numeric;
begin
  if p_workspace_id is null then return null; end if;
  select e.spending_cap_cents, e.period_start into ent
    from public.work_allowance_subscription_entitlements e
    where e.workspace_id = p_workspace_id and e.status in ('active','trialing')
      and clock_timestamp() >= e.period_start and clock_timestamp() < e.period_end
    order by e.period_start desc, e.id limit 1;
  since := coalesce(ent.period_start, date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC');
  select coalesce(sum(cost_usd), 0) into spent from public.model_call_log
    where workspace_id = p_workspace_id and called_at >= since and cost_usd is not null;
  return jsonb_build_object('spentUsd', spent::text, 'since', since,
    'capCents', ent.spending_cap_cents, 'subscribed', ent.period_start is not null);
end;
$$;
drop function public.reserve_business_ai_budget(uuid,numeric,numeric);
alter table public.model_call_log drop column budget_reservation_id;
drop table public.business_ai_budget_reservations;
commit;
