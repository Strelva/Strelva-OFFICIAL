#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
export LC_ALL=en_US.UTF-8
create_temp_postgres strelva-owner-effects strelva-owner-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 name="$(basename "$migration")"
 if [[ "$name" == '20261005090000_tenant_leads.sql' || "$name" == '20261014110000_owner_decision_effects.sql' ]]; then continue; fi
 if [[ "$name" == '20261001120000_website_documents.sql' ]]; then
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null
 fi
 printf 'Apply %s\n' "$name"
 psql "${psql_args[@]}" --file="$migration" >/dev/null
done
# Install the candidate on the current complete prerequisite schema. Unrelated
# later migrations are included in both sides of the rollback comparison.
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/catalog-before-effects.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261014110000_owner_decision_effects.sql"
for fixture in owner-decision-links-schema owner-decision-effects-schema; do
 psql "${psql_args[@]}" --file="$repo_root/tests/$fixture.sql"
done
# An admission transaction holds ROW EXCLUSIVE when inserting its binding.
# Rollback must wait for it before checking emptiness, with a bounded timeout.
PGAPPNAME=strelva-owner-rollback-admission psql "${psql_args[@]}" -c 'begin; lock table public.owner_decision_link_sessions in row exclusive mode; select pg_sleep(4); rollback;' >"$cluster_root/rollback-holder.log" 2>&1 &
rollback_holder_pid=$!
ready=0
for attempt in $(seq 1 80); do
 if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='strelva-owner-rollback-admission' and wait_event='PgSleep')")" == t ]]; then ready=1; break; fi
 sleep 0.025
done
[[ "$ready" == 1 ]] || { echo 'Rollback admission holder did not acquire table authority.' >&2; exit 1; }
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261014110000_owner_decision_effects.sql" >"$cluster_root/rollback-contention.log" 2>&1; then
 echo 'Owner rollback did not serialize a concurrent session insert.' >&2; exit 1
fi
rg -q 'lock timeout' "$cluster_root/rollback-contention.log"
wait "$rollback_holder_pid"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261014110000_owner_decision_effects.sql"
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/catalog-after-effects-rollback.txt"
diff -u "$cluster_root/catalog-before-effects.txt" "$cluster_root/catalog-after-effects-rollback.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261014110000_owner_decision_effects.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-decision-effects-schema.sql"
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/owner-decision-effects-schema.sql"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261014110000_owner_decision_effects.sql" >"$cluster_root/refusal.log" 2>&1; then
 echo 'rollback discarded retained sessions' >&2; exit 1
fi
rg -q 'owner_decision_effects_rollback_requires_data_preservation' "$cluster_root/refusal.log"
echo 'Owner authority forward/rollback/reapply/preservation checks passed.'

# Exercise the real session predicate in a concurrent transaction. An effect
# that already began holds its authority until commit; a later revocation
# blocks until that commit and the next call is refused.
ws=b2100000-0000-4000-8000-000000000001
agency=b2100000-0000-4000-8000-000000000003
sid="$(psql "${psql_args[@]}" -Atc "select s.session_id from public.owner_decision_link_sessions s join public.owner_decisions d on d.id=s.decision_id where d.workspace_id='$ws' and d.source_id='race-boundary' order by s.created_at desc limit 1")"
psql "${psql_args[@]}" -c "insert into public.users(id,email,verified_at) values ('b2100000-0000-4000-8000-000000000099','oe-revoker@example.test',now()); insert into public.super_admins(user_id,email) values ('b2100000-0000-4000-8000-000000000099','oe-revoker@example.test')" >/dev/null
hold_owner_session() {
 PGAPPNAME=strelva-owner-effect-holder psql "${psql_args[@]}" -c "begin; select public.strelva_service_session('$ws','$sid','owner_decision_link'); select pg_sleep(2); commit;" >"$cluster_root/holder.log" 2>&1 &
 holder_pid=$!
 ready=0
 for attempt in $(seq 1 80); do
  if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='strelva-owner-effect-holder' and wait_event='PgSleep')")" == t ]]; then ready=1; break; fi
  sleep 0.025
 done
 [[ "$ready" == 1 ]] || { cat "$cluster_root/holder.log" >&2; echo 'Owner effect holder did not acquire authority.' >&2; exit 1; }
}
revoke="select public.record_agency_verification('oe-revoker@example.test','$agency','publish','unverified','{}','Race fixture revocation')"
hold_owner_session
if PGOPTIONS='-c lock_timeout=150ms' psql "${psql_args[@]}" -c "$revoke" >"$cluster_root/race-revoke.log" 2>&1; then
 echo 'Agency revocation raced an effect already holding authority.' >&2; exit 1
fi
rg -q 'lock timeout' "$cluster_root/race-revoke.log"
wait "$holder_pid"
psql "${psql_args[@]}" -c "$revoke" >/dev/null
if psql "${psql_args[@]}" -c "select public.strelva_service_session('$ws','$sid','owner_decision_link')" >"$cluster_root/revoked-session.log" 2>&1; then
 echo 'Revoked effect session was still usable.' >&2; exit 1
fi
rg -q 'strelva_service_access_denied' "$cluster_root/revoked-session.log"
psql "${psql_args[@]}" -c "select public.record_agency_verification('oe-revoker@example.test','$agency','publish','verified','{\"note\":\"race fixture restored\"}',null)" >/dev/null
psql "${psql_args[@]}" -c "insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('$ws','b2100000-0000-4000-8000-000000000099','owner','b2100000-0000-4000-8000-000000000099')" >/dev/null
end_assignment="select public.end_business_provider('b2100000-0000-4000-8000-000000000099','oe-revoker@example.test','$ws','Race fixture end')"
hold_owner_session
if PGOPTIONS='-c lock_timeout=150ms' psql "${psql_args[@]}" -c "$end_assignment" >"$cluster_root/race-assignment.log" 2>&1; then
 echo 'Assignment end raced an effect already holding authority.' >&2; exit 1
fi
rg -q 'lock timeout' "$cluster_root/race-assignment.log"
wait "$holder_pid"
psql "${psql_args[@]}" -c "$end_assignment" >/dev/null
if psql "${psql_args[@]}" -c "select public.strelva_service_session('$ws','$sid','owner_decision_link')" >"$cluster_root/ended-session.log" 2>&1; then
 echo 'Ended assignment session was still usable.' >&2; exit 1
fi
rg -q 'strelva_service_access_denied' "$cluster_root/ended-session.log"
echo 'Concurrent effect revocation and assignment end checks passed.'
