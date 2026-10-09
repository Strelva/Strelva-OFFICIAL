#!/usr/bin/env bash
set -euo pipefail
# Source-prepared harness only. Parent supplies its qualified disposable DB's
# psql arguments; this harness never creates/applies a schema or provider effect.
[[ "${STRELVA_REWARDS_DISPOSABLE_PROOF:-}" == 1 ]] || { printf 'Requires parent-owned disposable schema qualification.\n' >&2; exit 2; }
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proof_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/strelva-rewards-races.XXXXXX")"
psql_args=("$@" --no-psqlrc --set=ON_ERROR_STOP=1)
# Each owned worker has bounded database waits, including a failed barrier.
export PGOPTIONS="${PGOPTIONS:-} -c lock_timeout=5s -c statement_timeout=15s"
cleanup(){
 set +e
 exec 7>&-
 # Only live jobs belonging to this harness, never another local stack/process.
 for pid in $(jobs -pr);do kill "$pid" 2>/dev/null;done
 wait
}
trap cleanup EXIT
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_state(){ for ((n=0;n<150;n++));do [[ "$(query "$1")" == t ]] && return;sleep 0.02;done;printf 'Controlled rewards barrier unavailable.\n' >&2;exit 1; }
# Functional work, exposure, denial, replay, atomic rollback, profile preservation.
psql "${psql_args[@]}" -f "$repo_root/tests/rewards-durable-mutations-schema.sql" >"$proof_dir/functional.log"
psql "${psql_args[@]}" >"$proof_dir/setup.log" <<'SQL'
begin;
insert into public.users(id,email,verified_at) values('17500000-0000-4000-8000-000000000011','reward-race-owner@example.test',now());
insert into public.tenants(id,site_name) values('fictional-reward-races','Fictional reward races');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) select '17500000-0000-4000-8000-000000000011',id,stable_id,'owner' from public.tenants where id='fictional-reward-races';
select public.mutate_tenant_reward_record('fictional-reward-races','race-member@example.test','{"operation":"save","commandId":"race-create","tierThreshold":500,"member":{"email":"race-member@example.test","starsAvailable":"100","starsLifetime":"490","tier":"snapper","tierOverride":"snapper","displayName":"Fictional member","badges":"[]","createdAt":"2026-01-01T00:00:00Z"}}')->>'status';
commit;
SQL
mutation(){ query "select public.mutate_tenant_reward_record('fictional-reward-races','race-member@example.test',jsonb_build_object('operation','adjust','commandId','$1','delta',$2,'tierThreshold',500,'actor',jsonb_build_object('userId','17500000-0000-4000-8000-000000000011','verifiedEmail','reward-race-owner@example.test'),'transaction',jsonb_build_object('id','txn_$1','type',case when $2>0 then 'admin-credit' else 'admin-debit' end,'amount',abs($2),'reason','Fictional controlled adjustment','timestamp','2026-10-09T00:00:00Z')))->>'status'"; }
pids=()
for ((n=1;n<=10;n++));do mutation "concurrent-debit-$n" -20 >"$proof_dir/debit-$n.log" 2>&1 & pids+=("$!");done
for pid in "${pids[@]}";do wait "$pid";done
accepted=0;refused=0
for ((n=1;n<=10;n++));do status="$(cat "$proof_dir/debit-$n.log")";case "$status" in adjusted) accepted=$((accepted+1));;insufficient) refused=$((refused+1));;*) printf 'Unexpected debit outcome.\n' >&2;exit 1;;esac;done
[[ "$accepted" == 5 && "$refused" == 5 ]]
[[ "$(query "select (payload->>'starsAvailable')||'|'||(payload->>'starsLifetime')||'|'||(payload->>'tier') from public.tenant_client_records where store='reward_members' and record_id='race-member@example.test'")" == '0|490|snapper' ]]
[[ "$(query "select count(*) from public.tenant_client_records where store='reward_transactions' and record_id like 'txn_concurrent-debit-%'")" == 5 ]]
# Twenty simultaneous credits retain every available/lifetime increment.
pids=()
for ((n=1;n<=20;n++));do mutation "concurrent-credit-$n" 10 >"$proof_dir/credit-$n.log" 2>&1 & pids+=("$!");done
query "select public.mutate_tenant_reward_record('fictional-reward-races','race-member@example.test','{\"operation\":\"save\",\"commandId\":\"concurrent-stale-profile\",\"tierThreshold\":500,\"member\":{\"email\":\"race-member@example.test\",\"starsAvailable\":\"100\",\"starsLifetime\":\"490\",\"tier\":\"snapper\",\"tierOverride\":\"snapper\",\"displayName\":\"Concurrent profile\",\"badges\":\"[]\",\"createdAt\":\"2026-01-01T00:00:00Z\"}}')->>'status'" >"$proof_dir/profile.log" 2>&1 & pids+=("$!")
for pid in "${pids[@]}";do wait "$pid";done
[[ "$(query "select (payload->>'starsAvailable')||'|'||(payload->>'starsLifetime')||'|'||(payload->>'tier') from public.tenant_client_records where store='reward_members' and record_id='race-member@example.test'")" == '200|690|snapper' ]]
# Revocation is held before admission, then committed while the producer waits.
revoke_tag="reward-revoke-$$";mutate_tag="reward-mutation-$$"
mkfifo "$proof_dir/revoke.fifo"
PGAPPNAME="$revoke_tag" psql "${psql_args[@]}" <"$proof_dir/revoke.fifo" >"$proof_dir/revoke.log" 2>&1 & revoke_pid=$!
exec 7>"$proof_dir/revoke.fifo"
printf "%s\n" "begin; update public.memberships set role='viewer' where user_id='17500000-0000-4000-8000-000000000011' and tenant_id='fictional-reward-races';" >&7
wait_state "select exists(select 1 from pg_stat_activity where application_name='$revoke_tag' and state='idle in transaction')"
PGAPPNAME="$mutate_tag" mutation "revoked-current" 10 >"$proof_dir/revoked-mutation.log" 2>&1 & mutate_pid=$!
wait_state "select exists(select 1 from pg_stat_activity where application_name='$mutate_tag' and wait_event_type='Lock')"
printf 'commit;\n\\q\n' >&7;exec 7>&-;wait "$revoke_pid"
if wait "$mutate_pid";then printf 'Revoked actor mutation accepted.\n' >&2;exit 1;fi
rg -q rewards_access_denied "$proof_dir/revoked-mutation.log"
[[ "$(query "select payload->>'starsAvailable' from public.tenant_client_records where store='reward_members' and record_id='race-member@example.test'")" == 200 ]]
[[ "$(query "select count(*) from public.tenant_reward_mutations where command_id='revoked-current'")" == 0 ]]
# A historical accepted command cannot regain authority through replay.
if mutation "concurrent-credit-1" 10 >"$proof_dir/revoked-replay.log" 2>&1;then printf 'Revoked replay accepted.\n' >&2;exit 1;fi
rg -q rewards_access_denied "$proof_dir/revoked-replay.log"
# The actual inverse must refuse populated accepted receipt state before DDL.
if psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql" >"$proof_dir/populated-inverse.log" 2>&1;then printf 'Populated inverse accepted.\n' >&2;exit 1;fi
rg -q rewards_populated_rollback_refused "$proof_dir/populated-inverse.log"
[[ "$(query "select to_regprocedure('public.mutate_tenant_reward_record(text,text,jsonb)') is not null")" == t ]]
printf 'GREEN controlled concurrent debit/credit, current revocation, replay denial and populated inverse. Evidence: %s\n' "$proof_dir"
# Fictional rows intentionally remain in this owned disposable DB for readback.
# Parent owns final schema/process teardown and qualification inventory.
