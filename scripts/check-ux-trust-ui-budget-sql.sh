#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
source scripts/temp-postgres.sh
create_temp_postgres trust-budget-proof
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;
create table public.workspaces(id uuid primary key);
create table public.tenants(id text primary key, stable_id uuid unique, subscription_status text not null default 'none');
create table public.tenant_workspace_links(tenant_stable_id uuid references public.tenants(stable_id), workspace_id uuid references public.workspaces(id));
create table public.work_allowance_subscription_entitlements(id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces(id), spending_cap_cents int, period_start timestamptz, period_end timestamptz, status text);
insert into public.workspaces values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
SQL
psql "${args[@]}" -f supabase/migrations/20261007140000_model_call_log.sql >/dev/null
psql "${args[@]}" -f supabase/migrations/20261023143000_two_doors_business_ai_budget.sql >/dev/null
psql "${args[@]}" -f supabase/migrations/20261024121500_ux_trust_ui_ai_budget_reservations.sql >/dev/null
# Empty inverse and reapply prove installation can be backed out before use.
psql "${args[@]}" -f supabase/migrations/rollback-20261024121500_ux_trust_ui_ai_budget_reservations.sql >/dev/null
psql "${args[@]}" -f supabase/migrations/20261024121500_ux_trust_ui_ai_budget_reservations.sql >/dev/null
psql "${args[@]}" -f supabase/migrations/20261025110000_done_trust_legacy_ai.sql >/dev/null
psql "${args[@]}" <<'SQL'
insert into public.tenants values ('budget-race-fixture','33333333-3333-4333-8333-333333333333','past_due');
insert into public.tenant_workspace_links values ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222');
do $$ declare b jsonb; r jsonb; count_stored int; begin
 b := public.business_ai_budget('11111111-1111-4111-8111-111111111111');
 if b->>'spentUsd' <> '0' or b->>'reservedUsd' <> '0' or b->>'resetsAt' is null then raise exception 'empty_read_failed %',b; end if;
 r := public.reserve_business_ai_budget('11111111-1111-4111-8111-111111111111', .6, 1);
 if r->>'status' <> 'reserved' then raise exception 'reserve_failed'; end if;
 b := public.reserve_business_ai_budget('11111111-1111-4111-8111-111111111111', .5, 1);
 if b->>'status' <> 'paused' then raise exception 'cap_failed'; end if;
 count_stored := public.record_model_calls(jsonb_build_array(jsonb_build_object('calledAt',clock_timestamp(),'purpose','ask','workspaceId','11111111-1111-4111-8111-111111111111','budgetReservationId',r->>'reservationId','actorKind','owner','modelLabel','fixture/text','attempt',1,'step',1,'latencyMs',1,'outcome','ok','costUsd','.2','costSource','estimate','priceTableVersion','fixture')));
 b := public.business_ai_budget('11111111-1111-4111-8111-111111111111');
 if (b->>'spentUsd')::numeric <> .2 or (b->>'reservedUsd')::numeric <> .4 then raise exception 'spend_hold_failed %', b; end if;
 begin
  perform public.record_model_calls(jsonb_build_array(jsonb_build_object('calledAt',clock_timestamp(),'purpose','ask','workspaceId','22222222-2222-4222-8222-222222222222','budgetReservationId',r->>'reservationId','actorKind','owner','modelLabel','fixture/text','attempt',1,'step',1,'latencyMs',1,'outcome','ok','costUsd','.2','costSource','estimate','priceTableVersion','fixture')));
  raise exception 'cross_workspace_not_refused';
 exception when others then if sqlerrm <> 'model_call_invalid' then raise; end if; end;
 if has_function_privilege('authenticated','public.reserve_business_ai_budget(uuid,numeric,numeric)','execute') then raise exception 'public_reserve_grant'; end if;
 if has_table_privilege('service_role','public.business_ai_budget_reservations','insert') then raise exception 'direct_reserve_grant'; end if;
end $$;
SQL
# Two separate transactions both request .6 against a cap of 1. The first holds
# the workspace lock; the second must wait and refuse after the first commits.
psql "${args[@]}" -At <<'SQL' > "$cluster_root/first" &
begin;
select public.reserve_business_ai_budget('22222222-2222-4222-8222-222222222222', .6, 1)->>'status';
select pg_sleep(3);
commit;
SQL
first_pid=$!
# Observe the actual first admission before starting the contender; process
# startup timing must not determine which transaction wins this proof.
first_reserved=false
for attempt in $(seq 1 100); do
  if rg -q '^reserved$' "$cluster_root/first"; then first_reserved=true; break; fi
  sleep .01
done
[[ "$first_reserved" == true ]] || { printf 'First budget reservation did not reach its held transaction.\n' >&2; wait "$first_pid"; exit 1; }
# The admitted transaction must fence webhook changes to the linked legacy
# relationship until its hold commits, even while the tenant is not entitled.
if psql "${args[@]}" -c "set lock_timeout='200ms'; update public.tenants set subscription_status='active' where id='budget-race-fixture'" > "$cluster_root/tenant-update" 2>&1; then
  printf 'Legacy subscription changed during budget admission.\n' >&2; exit 1
fi
rg -q 'lock timeout' "$cluster_root/tenant-update"
psql "${args[@]}" -At -c "select public.reserve_business_ai_budget('22222222-2222-4222-8222-222222222222', .6, 1)->>'status'" > "$cluster_root/second"
wait "$first_pid"
rg -q '^reserved$' "$cluster_root/first"
rg -q '^paused$' "$cluster_root/second"
if psql "${args[@]}" -f supabase/migrations/rollback-20261024121500_ux_trust_ui_ai_budget_reservations.sql > "$cluster_root/rollback" 2>&1; then
  echo 'ERROR populated inverse was allowed'; exit 1
fi
rg -q 'business_ai_budget_rollback_has_reservations' "$cluster_root/rollback"
echo 'PASS migration, empty rollback/reapply, populated rollback refusal, held cost, cross-workspace refusal, grants, concurrent admission and legacy subscription lock'
