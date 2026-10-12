-- One model-call helper: the cost log (Ask Strelva spec §5).
--
-- Every provider call made through src/platform/infra/model-calls.ts writes
-- one row here: purpose, workspace, System, tenant, actor kind, model label,
-- input and output tokens, latency, outcome and cost. Fallback attempts and
-- failed calls get rows too.
--
-- Cost is an ESTIMATE from the dated price table in
-- src/platform/infra/model-prices.ts, or an exact amount from a trusted
-- provider receipt. A model missing from the table, or a call without token
-- counts, records cost as UNKNOWN (null), never zero. The table enforces that:
-- `cost_source = 'unknown'` exactly when `cost_usd` is null.
--
-- Additive only. It references `workspaces(id)` and `tenants(stable_id)`, both
-- already in production, and changes no existing table or function.
--
-- Identity. The app passes the tenant slug it called with; the row stores the
-- tenant's `stable_id`, so a slug rename keeps every row attached. The slug at
-- call time is kept for reading. `system_id` has no foreign key: a System may
-- be a projection (src/platform/systems/from-existing.ts) that is not stored.
--
-- Access. RLS on, every table privilege revoked. The app writes and reads only
-- through two service-role security-definer functions. A failed write never
-- fails the model call; the app counts it as a missing row instead.

create table public.model_call_log (
  id uuid primary key default gen_random_uuid(),
  called_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  purpose text not null check (purpose in ('ask', 'ask.background', 'operator', 'rebuild', 'work_plan', 'report',
    'review_reply', 'suggestion', 'weekly_brief', 'visibility_probe')),
  workspace_id uuid references public.workspaces(id) on delete set null,
  system_id uuid,
  tenant_stable_id uuid references public.tenants(stable_id) on delete set null,
  tenant_slug_at_call text check (tenant_slug_at_call is null or char_length(tenant_slug_at_call) between 1 and 120),
  actor_kind text not null check (actor_kind in ('owner', 'member', 'operator', 'strelva', 'visitor', 'unknown')),
  model_label text not null check (char_length(model_label) between 1 and 160),
  attempt smallint not null check (attempt between 1 and 5),
  step smallint not null check (step between 1 and 100),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  outcome text not null check (outcome in ('ok', 'error')),
  error_kind text check (error_kind is null or char_length(error_kind) <= 60),
  cost_usd numeric(14, 8) check (cost_usd is null or cost_usd >= 0),
  cost_source text not null check (cost_source in ('estimate', 'provider_receipt', 'unknown')),
  price_table_version text check (price_table_version is null or char_length(price_table_version) <= 40),
  check ((cost_source = 'unknown') = (cost_usd is null)),
  check (cost_source <> 'estimate' or price_table_version is not null),
  check ((outcome = 'error') = (error_kind is not null))
);
create index model_call_log_called_idx on public.model_call_log(called_at desc, id);
create index model_call_log_workspace_idx on public.model_call_log(workspace_id, called_at desc) where workspace_id is not null;
create index model_call_log_tenant_idx on public.model_call_log(tenant_stable_id, called_at desc) where tenant_stable_id is not null;

alter table public.model_call_log enable row level security;
revoke all on public.model_call_log from public, anon, authenticated, service_role;

-- Record a batch of rows (one model-call attempt). Returns the number stored.
-- Raises model_call_invalid on any malformed row; nothing in the batch is
-- stored then. An unknown tenant slug stores the slug with no stable id.
create function public.record_model_calls(p_calls jsonb)
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

-- Operator read: cost by purpose since a time, optionally for one workspace.
-- Known cost and calls with unknown cost are reported separately, so a total
-- is never presented as complete when some calls had no price.
create function public.summarize_model_call_costs(p_since timestamptz, p_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_since is null then raise exception 'model_call_invalid'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'purpose', purpose,
      'calls', calls,
      'failedCalls', failed,
      'inputTokens', input_tokens,
      'outputTokens', output_tokens,
      'knownCostUsd', known_cost::text,
      'unknownCostCalls', unknown_calls
    ) order by purpose)
    from (
      select purpose, count(*) as calls, count(*) filter (where outcome = 'error') as failed,
        coalesce(sum(input_tokens), 0) as input_tokens, coalesce(sum(output_tokens), 0) as output_tokens,
        coalesce(sum(cost_usd), 0)::numeric(14, 8) as known_cost,
        count(*) filter (where cost_source = 'unknown') as unknown_calls
      from public.model_call_log
      where called_at >= p_since and (p_workspace_id is null or workspace_id = p_workspace_id)
      group by purpose
    ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.record_model_calls(jsonb) from public, anon, authenticated;
revoke all on function public.summarize_model_call_costs(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.record_model_calls(jsonb) to service_role;
grant execute on function public.summarize_model_call_costs(timestamptz, uuid) to service_role;
