#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-payer-race strelva-payer-race-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql ]]; then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
baseline=false
if [[ "${1:-}" == --baseline ]];then baseline=true;psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/rollback-20261020090005_allowance_payer_writer_authority.sql" >/dev/null;fi
psql "${psql_args[@]}" -f "$repo_root/tests/support/payer-authority-race-fixture.sql" >/dev/null
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_sql(){ for ((attempt=0;attempt<150;attempt++));do if [[ "$(query "$1")" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
agency="a9050000-0000-4000-8000-000000000020"
actor="a9050000-0000-4000-8000-000000000002"
demote="update public.workspace_memberships set role='member' where workspace_id='$agency' and user_id='$actor'"
restore="update public.workspace_memberships set role='admin' where workspace_id='$agency' and user_id='$actor'"
cap="select public.work_allowance_accept_cap('$actor','payer-race-agency@example.test',(select id from public.work_allowances where award_key='payer-race-allowance'))"
query "set application_name='payer_race_barrier';select pg_advisory_lock(16090501);select pg_sleep(20)" >"$cluster_root/barrier.log" 2>&1 & barrier_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='payer_race_barrier' and wait_event='PgSleep')"
query "set application_name='payer_race_cap';$cap" >"$cluster_root/cap.log" 2>&1 & cap_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='payer_race_cap' and wait_event='advisory')"
query "set application_name='payer_race_demotion';$demote" >"$cluster_root/demotion.log" 2>&1 & demotion_pid=$!
if [[ "$baseline" == true ]];then
 wait "$demotion_pid"
 [[ "$(query "select role='member' from public.workspace_memberships where workspace_id='$agency' and user_id='$actor'")" == t ]]
 printf 'RED baseline: actual agency demotion committed while cap UPDATE remained paused after unlocked payer authorization.\n'
else
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='payer_race_demotion' and wait_event_type='Lock')"
 [[ "$(query "select role='admin' from public.workspace_memberships where workspace_id='$agency' and user_id='$actor'")" == t ]]
 printf 'GREEN writer authority: current representative row lock prevents demotion committing through cap acceptance.\n'
fi
query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='payer_race_barrier'" >/dev/null
wait "$barrier_pid" || true
wait "$cap_pid"
wait "$demotion_pid"
[[ "$(query "select status='active' and cap_accepted_by='$actor' from public.work_allowances where award_key='payer-race-allowance'")" == t ]]
if [[ "$baseline" == true ]];then printf 'RED reproduced: actual native cap acceptance committed after current agency role loss.\n';fi
query "drop trigger payer_race_timing on public.work_allowances;drop schema payer_race_fixture cascade" >/dev/null
for case_name in cap job transition;do
 if [[ "$baseline" == true && "$case_name" == cap ]];then continue;fi
 query "$restore" >/dev/null
 query "set application_name='payer_race_lockfirst';begin;$demote;select pg_sleep(0.7);commit" >"$cluster_root/lockfirst.log" 2>&1 & first_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='payer_race_lockfirst' and wait_event='PgSleep')"
 case "$case_name" in
 cap) command="$cap"; denial=work_allowance_payer_required;;
 job) command="select public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',(select id from public.job_economics where workspace_id='a9050000-0000-4000-8000-000000000010')),'$actor','payer-race-agency@example.test')";denial=job_economics_payer_required;;
 transition) command="select public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',(select id from public.workspace_payer_transitions where workspace_id='a9050000-0000-4000-8000-000000000010' and status='pending')),'$actor','payer-race-agency@example.test')";denial=payer_transition_successor_required;;
 esac
 query "set application_name='payer_race_candidate';$command" >"$cluster_root/$case_name.log" 2>&1 & candidate_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='payer_race_candidate' and wait_event_type='Lock')"
 wait "$first_pid"
 if wait "$candidate_pid";then cat "$cluster_root/$case_name.log";printf 'Unauthorized %s succeeded\n' "$case_name" >&2;exit 1;fi
 if ! rg -q "$denial" "$cluster_root/$case_name.log";then cat "$cluster_root/$case_name.log";exit 1;fi
 printf 'GREEN %s: lock-first demotion commits; waited actual command rechecks direct current predicate and denies.\n' "$case_name"
done
[[ "$(query "select status='draft' and accepted_by is null from public.job_economics where workspace_id='a9050000-0000-4000-8000-000000000010'")" == t ]]
[[ "$(query "select count(*)=1 from public.workspace_payer_transitions where workspace_id='a9050000-0000-4000-8000-000000000010' and status='pending'")" == t ]]
if [[ "$baseline" == false ]];then
 psql "${psql_args[@]}" -f "$repo_root/tests/payer-authority-writer-schema.sql"
 node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
fi
printf 'Native payer concurrency proof completed (baseline=%s).\n' "$baseline"
