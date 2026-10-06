\set ON_ERROR_STOP on
-- Model-call cost log (20261007140000_model_call_log.sql). Fictional tenants
-- and workspaces only; runs in the isolated workspace SQL cluster.
begin;
insert into public.users(id, email, verified_at) values ('0c000000-0000-4000-8000-000000000001', 'mc-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('0c000000-0000-4000-8000-000000000010', 'customer', 'Cost Fixture Business', '0c000000-0000-4000-8000-000000000001'),
  ('0c000000-0000-4000-8000-000000000011', 'customer', 'Other Cost Business', '0c000000-0000-4000-8000-000000000001');
insert into public.tenants(id, stable_id, site_name, active) values
  ('cost-site', '0c000000-0000-4000-8000-0000000000b1', 'Cost Fixture Site', true);

create or replace function pg_temp.mc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'model call log assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.mc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.mc_row(extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('calledAt', '2026-10-07T12:00:00Z', 'purpose', 'ask', 'actorKind', 'owner',
    'modelLabel', 'google/gemini-2.5-flash', 'attempt', 1, 'step', 1, 'inputTokens', 1000, 'outputTokens', 200,
    'latencyMs', 850, 'outcome', 'ok', 'costUsd', '0.00080000', 'costSource', 'estimate',
    'priceTableVersion', '2026-10-06') || extra
$$;

-- Locked down: RLS on, no table privilege for any API role, functions only for service_role.
select pg_temp.mc_assert((select relrowsecurity from pg_class where oid = 'public.model_call_log'::regclass), 'rls enabled');
select pg_temp.mc_assert(not has_table_privilege('anon', 'public.model_call_log', 'select')
  and not has_table_privilege('authenticated', 'public.model_call_log', 'select')
  and not has_table_privilege('authenticated', 'public.model_call_log', 'insert')
  and not has_table_privilege('service_role', 'public.model_call_log', 'select')
  and not has_table_privilege('service_role', 'public.model_call_log', 'insert'), 'no direct table access');
select pg_temp.mc_assert(not has_function_privilege('anon', 'public.record_model_calls(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_model_calls(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.summarize_model_call_costs(timestamptz,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.summarize_model_call_costs(timestamptz,uuid)', 'execute'), 'public keys cannot call cost functions');
select pg_temp.mc_assert(has_function_privilege('service_role', 'public.record_model_calls(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.summarize_model_call_costs(timestamptz,uuid)', 'execute'), 'service role can record and read');

-- One attempt with two steps, then a failed primary and its fallback.
select pg_temp.mc_assert(public.record_model_calls(jsonb_build_array(
  pg_temp.mc_row(jsonb_build_object('tenantId', 'cost-site', 'workspaceId', '0c000000-0000-4000-8000-000000000010',
    'systemId', '0c000000-0000-4000-8000-0000000000c1')),
  pg_temp.mc_row(jsonb_build_object('step', 2, 'tenantId', 'cost-site', 'workspaceId', '0c000000-0000-4000-8000-000000000010')))) = 2, 'two steps recorded');
select pg_temp.mc_assert(public.record_model_calls(jsonb_build_array(
  pg_temp.mc_row(jsonb_build_object('outcome', 'error', 'errorKind', 'provider_5xx', 'inputTokens', null, 'outputTokens', null,
    'costUsd', null, 'costSource', 'unknown', 'priceTableVersion', null, 'workspaceId', '0c000000-0000-4000-8000-000000000010')))) = 1, 'failed attempt recorded');
select pg_temp.mc_assert(public.record_model_calls(jsonb_build_array(
  pg_temp.mc_row(jsonb_build_object('attempt', 2, 'modelLabel', 'anthropic/fallback-model', 'costUsd', null, 'costSource', 'unknown',
    'priceTableVersion', null, 'workspaceId', '0c000000-0000-4000-8000-000000000010')))) = 1, 'unpriced fallback recorded');

select pg_temp.mc_assert((select tenant_stable_id = '0c000000-0000-4000-8000-0000000000b1' and tenant_slug_at_call = 'cost-site'
  and system_id = '0c000000-0000-4000-8000-0000000000c1' from public.model_call_log where step = 1 and tenant_slug_at_call is not null),
  'tenant stored by stable id with its slug');
select pg_temp.mc_assert((select count(*) from public.model_call_log where cost_source = 'unknown' and cost_usd is null) = 2,
  'unknown cost stays null');

-- Rename: the slug changes, the rows stay attached through stable_id.
update public.tenants set id = 'cost-site-renamed' where stable_id = '0c000000-0000-4000-8000-0000000000b1';
select pg_temp.mc_assert((select count(*) from public.model_call_log l join public.tenants t on t.stable_id = l.tenant_stable_id
  where t.id = 'cost-site-renamed') = 2, 'renamed tenant keeps its rows');

-- Unknown tenant slug: kept as written, no stable id.
select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('tenantId', 'no-such-site'))));
select pg_temp.mc_assert((select tenant_stable_id is null from public.model_call_log where tenant_slug_at_call = 'no-such-site'), 'unknown tenant has no stable id');

-- Summary keeps known cost and unknown-cost calls apart; workspace filter isolates.
select pg_temp.mc_assert((select (s->>'calls')::int = 5 and (s->>'unknownCostCalls')::int = 2 and (s->>'failedCalls')::int = 1
    and (s->>'knownCostUsd')::numeric = 0.0024
  from jsonb_array_elements(public.summarize_model_call_costs('2026-10-01', null)) s where s->>'purpose' = 'ask'), 'summary by purpose');
select pg_temp.mc_assert(jsonb_array_length(public.summarize_model_call_costs('2026-10-01', '0c000000-0000-4000-8000-000000000011')) = 0,
  'another workspace sees none of these rows');

-- Failure paths: unknown recorded as zero, estimate without a table version,
-- error without a kind, bad purpose, empty or oversized batch. Nothing stored.
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('costUsd', '0', 'costSource', 'unknown'))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('costUsd', null))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('priceTableVersion', null))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('outcome', 'error'))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(jsonb_build_object('purpose', 'marketing'))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls(jsonb_build_array(pg_temp.mc_row(), pg_temp.mc_row(jsonb_build_object('step', 0))))$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls('[]'::jsonb)$$, 'model_call_invalid');
select pg_temp.mc_expect($$select public.record_model_calls('{}'::jsonb)$$, 'model_call_invalid');
select pg_temp.mc_assert((select count(*) from public.model_call_log) = 5, 'failed batches stored nothing');

-- Deprovisioning the tenant keeps the cost row and clears the reference.
delete from public.tenants where stable_id = '0c000000-0000-4000-8000-0000000000b1';
select pg_temp.mc_assert((select count(*) from public.model_call_log where tenant_slug_at_call = 'cost-site' and tenant_stable_id is null) = 2,
  'deprovisioned tenant keeps cost rows');

rollback;
