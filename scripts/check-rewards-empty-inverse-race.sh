#!/usr/bin/env bash
set -euo pipefail
# Prepared only: one mode per fresh parent-qualified disposable 1750 schema.
# No bootstrap/migration forward is performed here. inverse_first intentionally
# runs the reviewed inverse; parent owns that disposed schema's lifecycle.
[[ "${STRELVA_REWARDS_DISPOSABLE_PROOF:-}" == 1 ]] || { printf 'Requires parent-owned disposable schema qualification.\n' >&2;exit 2; }
mode="${1:?writer_first or inverse_first required}";shift
[[ "$mode" == writer_first || "$mode" == inverse_first ]] || exit 2
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proof_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/strelva-rewards-empty-race.XXXXXX")"
psql_args=("$@" --no-psqlrc --set=ON_ERROR_STOP=1)
export PGOPTIONS="${PGOPTIONS:-} -c lock_timeout=5s -c statement_timeout=15s"
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_state(){ for ((n=0;n<100;n++));do [[ "$(query "$1")" == t ]] && return;sleep 0.02;done;printf 'First-acceptance barrier unavailable.\n' >&2;exit 1; }
cleanup(){ set +e;exec 7>&-;for pid in $(jobs -pr);do kill "$pid" 2>/dev/null;done;wait; }
trap cleanup EXIT
[[ "$(query 'select count(*) from public.tenant_reward_mutations')" == 0 ]] || { printf 'First-acceptance proof requires empty fresh receipt state.\n' >&2;exit 2; }
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/catalog-before.log"
psql "${psql_args[@]}" >"$proof_dir/fixture.log" <<'SQL'
begin;
insert into public.users(id,email,verified_at) values('17500000-0000-4000-8000-000000000021','reward-first-owner@example.test',now());
insert into public.tenants(id,site_name) values('fictional-reward-first-acceptance','Fictional first native reward');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) select '17500000-0000-4000-8000-000000000021',id,stable_id,'owner' from public.tenants where id='fictional-reward-first-acceptance';
select public.record_tenant_client_record('fictional-reward-first-acceptance','reward_members','first-member@example.test','{"email":"first-member@example.test","starsAvailable":"100","starsLifetime":"100","tier":"snapper","tierOverride":"","badges":"[]","createdAt":"2026-01-01T00:00:00Z"}',repeat('a',64),'2026-01-01','backfill','replace')->>'status';
commit;
SQL
writer(){ query "select public.mutate_tenant_reward_record('fictional-reward-first-acceptance','first-member@example.test','{\"operation\":\"adjust\",\"commandId\":\"first-native-command\",\"delta\":10,\"tierThreshold\":500,\"actor\":{\"userId\":\"17500000-0000-4000-8000-000000000021\",\"verifiedEmail\":\"reward-first-owner@example.test\"},\"transaction\":{\"id\":\"txn_first-native-command\",\"type\":\"admin-credit\",\"amount\":10,\"reason\":\"Fictional first acceptance\",\"timestamp\":\"2026-10-09T00:00:00Z\"}}')->>'status'"; }
holder_tag="reward-first-holder-$$";writer_tag="reward-first-writer-$$";inverse_tag="reward-first-inverse-$$"
mkfifo "$proof_dir/control.fifo"
PGAPPNAME="$holder_tag" psql "${psql_args[@]}" <"$proof_dir/control.fifo" >"$proof_dir/control.log" 2>&1 & holder_pid=$!
exec 7>"$proof_dir/control.fifo"
if [[ "$mode" == writer_first ]];then
 printf "%s\n" "begin;select pg_advisory_xact_lock(hashtextextended((select stable_id::text from public.tenants where id='fictional-reward-first-acceptance')||':reward_members:first-member@example.test',9106));" >&7
else
 printf "%s\n" "begin;select pg_advisory_xact_lock(hashtextextended('reward-native-writer',1750));" >&7
fi
wait_state "select exists(select 1 from pg_stat_activity where application_name='$holder_tag' and state='idle in transaction')"
PGAPPNAME="$writer_tag" writer >"$proof_dir/writer.log" 2>&1 & writer_pid=$!
wait_state "select exists(select 1 from pg_stat_activity where application_name='$writer_tag' and wait_event_type='Lock')"
if [[ "$mode" == writer_first ]];then
 PGAPPNAME="$inverse_tag" psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql" >"$proof_dir/inverse.log" 2>&1 & inverse_pid=$!
 wait_state "select exists(select 1 from pg_stat_activity where application_name='$inverse_tag' and wait_event_type='Lock')"
 printf 'commit;\n\\q\n' >&7;exec 7>&-;wait "$holder_pid";wait "$writer_pid"
 if wait "$inverse_pid";then printf 'Inverse deleted first accepted receipt.\n' >&2;exit 1;fi
 rg -q rewards_populated_rollback_refused "$proof_dir/inverse.log"
 [[ "$(query "select count(*) from public.tenant_reward_mutations where command_id='first-native-command'")" == 1 ]]
 [[ "$(query "select payload->>'starsAvailable' from public.tenant_client_records where store='reward_members' and record_id='first-member@example.test'")" == 110 ]]
 psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/catalog-after.log"
else
 # This exact reviewed inverse runs in the session already holding its first
 # exclusive native boundary; its own population/guard checks remain unchanged.
 printf '\\i %s\n\\q\n' "$repo_root/supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql" >&7
 exec 7>&-;wait "$holder_pid"
 if wait "$writer_pid";then printf 'Native acceptance followed committed empty inverse.\n' >&2;exit 1;fi
 [[ "$(query "select to_regclass('public.tenant_reward_mutations') is null and to_regprocedure('public.mutate_tenant_reward_record(text,text,jsonb)') is null")" == t ]]
 [[ "$(query "select payload->>'starsAvailable' from public.tenant_client_records where store='reward_members' and record_id='first-member@example.test'")" == 100 ]]
 [[ "$(query "select count(*) from public.tenant_client_records where store='reward_transactions' and record_id='txn_first-native-command'")" == 0 ]]
fi
printf 'GREEN controlled %s empty-inverse/first-acceptance ordering. Evidence: %s\n' "$mode" "$proof_dir"
