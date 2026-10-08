#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-recurring-sql strelva-recurring-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == "20261005090000_tenant_leads.sql" ]]; then continue; fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null
  fi
  if [[ "$migration_name" == "20261020090032_responsibility_month_evidence.sql" ]]; then continue; fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
 done
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
catalog="select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1"
query "$catalog" >"$cluster_root/before.catalog"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090032_responsibility_month_evidence.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/recurring-responsibilities-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090032_responsibility_month_evidence.sql" >/dev/null
query "$catalog" >"$cluster_root/after.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/after.catalog"
printf 'Empty monthly rollback restores exact prior function catalog and ACLs.\n'
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090028_recurring_responsibilities.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090028_recurring_responsibilities.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090032_responsibility_month_evidence.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/recurring-responsibilities-schema.sql" >/dev/null
# Retain fictional history only in this owned disposable cluster, then execute
# the actual inverse. Its refusal must preserve both rows and function catalog.
psql "${psql_args[@]}" --set=responsibility_meter_retain=1 --file="$repo_root/tests/recurring-responsibilities-schema.sql" >/dev/null
query "select business_workspace_id||'|'||month||'|'||encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') from public.responsibility_meter_months order by 1" >"$cluster_root/retained-before.rows"
query "$catalog" >"$cluster_root/retained-before.catalog"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090032_responsibility_month_evidence.sql" >"$cluster_root/guard.log" 2>&1; then
 printf 'Monthly rollback erased immutable history\n' >&2; exit 1
fi
rg -q responsibility_month_evidence_preservation_required "$cluster_root/guard.log"
query "select business_workspace_id||'|'||month||'|'||encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') from public.responsibility_meter_months order by 1" >"$cluster_root/retained-after.rows"
query "$catalog" >"$cluster_root/retained-after.catalog"
cmp "$cluster_root/retained-before.rows" "$cluster_root/retained-after.rows"
cmp "$cluster_root/retained-before.catalog" "$cluster_root/retained-after.catalog"
printf 'Actual populated rollback refuses immutable monthly evidence before DDL.\n'
query "begin read only;select public.read_responsibility_month_evidence('99100000-0000-4000-8000-000000000011','99100000-0000-4000-8000-000000000001','rr-owner@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '2 months')::date)->>'availability';rollback" | rg -q '^partial$'
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql" >/dev/null
# Controlled sessions admit a monthly snapshot, then pause before its immutable
# insert. Current owner/identity changes must wait for its already-held locks.
wait_sql(){ for ((attempt=0;attempt<200;attempt++));do if [[ "$(query "$1")" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
query "create schema monthly_race_fixture;create function monthly_race_fixture.pause_insert() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(2990032);return new;end\$\$;create trigger monthly_race_timing before insert on public.responsibility_meter_months for each row execute function monthly_race_fixture.pause_insert()" >/dev/null
owner='99100000-0000-4000-8000-000000000001'
business='99100000-0000-4000-8000-000000000011'
offset=4
for case_name in membership identity; do
 snapshot="select public.snapshot_responsibility_meter('$business','$owner','rr-owner@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '$offset months')::date)"
 query "set application_name='monthly_race_barrier';select pg_advisory_lock(2990032);select pg_sleep(20)" >"$cluster_root/barrier.log" 2>&1 & barrier_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_barrier' and wait_event='PgSleep')"
 query "set application_name='monthly_race_snapshot';$snapshot" >"$cluster_root/snapshot.log" 2>&1 & snapshot_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_snapshot' and wait_event='advisory')"
 if [[ "$case_name" == membership ]];then challenge="update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner'";else challenge="update public.users set verified_at=null where id='$owner'";fi
 query "set application_name='monthly_race_challenge';$challenge" >"$cluster_root/challenge.log" 2>&1 & challenge_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_challenge' and wait_event_type='Lock')"
 query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='monthly_race_barrier'" >/dev/null
 wait "$barrier_pid" || true
 wait "$snapshot_pid"
 wait "$challenge_pid"
 if query "$snapshot" >"$cluster_root/denied.log" 2>&1;then printf 'Stale monthly actor accepted\n' >&2;exit 1;fi
 if [[ "$case_name" == membership ]];then
  rg -q responsibility_membership_denied "$cluster_root/denied.log"
  query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null
 else
  rg -q responsibility_actor_unverified "$cluster_root/denied.log"
  query "update public.users set verified_at=now() where id='$owner'" >/dev/null
 fi
 printf 'Monthly-first %s race serializes; committed actor loss denies replay.\n' "$case_name"
 offset=$((offset+1))
done
query "drop trigger monthly_race_timing on public.responsibility_meter_months;drop schema monthly_race_fixture cascade" >/dev/null
# Loss-first: delayed snapshot cannot rely on the membership read before lock.
query "set application_name='monthly_race_lossfirst';begin;update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner';select pg_sleep(0.7);commit" >"$cluster_root/loss.log" 2>&1 & loss_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_lossfirst' and wait_event='PgSleep')"
query "set application_name='monthly_race_candidate';select public.snapshot_responsibility_meter('$business','$owner','rr-owner@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '6 months')::date)" >"$cluster_root/loss-snapshot.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_candidate' and wait_event_type='Lock')"
wait "$loss_pid"
if wait "$candidate_pid";then printf 'Stale owner monthly snapshot accepted\n' >&2;exit 1;fi
rg -q responsibility_membership_denied "$cluster_root/loss-snapshot.log"
[[ "$(query "select not exists(select 1 from public.responsibility_meter_months where business_workspace_id='$business' and month=(date_trunc('month',now() at time zone 'UTC')-interval '6 months')::date)")" == t ]]
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null
printf 'Owner-loss-first race denies delayed monthly capture without creating receipt.\n'
# Assigned provider uses the exact new historical path. Its verification lock
# must serialize with the real append-only verification command.
agency_actor='99100000-0000-4000-8000-000000000002'
agency='99100000-0000-4000-8000-000000000012'
agency_snapshot="select public.snapshot_responsibility_meter('$business','$agency_actor','rr-agency@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '7 months')::date)"
query "create schema monthly_provider_race;create function monthly_provider_race.pause_insert() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(2990032);return new;end\$\$;create trigger monthly_provider_timing before insert on public.responsibility_meter_months for each row execute function monthly_provider_race.pause_insert()" >/dev/null
query "set application_name='monthly_race_barrier';select pg_advisory_lock(2990032);select pg_sleep(20)" >"$cluster_root/provider-barrier.log" 2>&1 & barrier_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_race_barrier' and wait_event='PgSleep')"
query "set application_name='monthly_provider_snapshot';$agency_snapshot" >"$cluster_root/provider-snapshot.log" 2>&1 & snapshot_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_provider_snapshot' and wait_event='advisory')"
query "set application_name='monthly_provider_revoke';select public.record_agency_verification('rr-other@example.test','$agency','email','unverified','{}','Fictional race loss')" >"$cluster_root/provider-revoke.log" 2>&1 & revoke_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_provider_revoke' and wait_event='advisory')"
query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='monthly_race_barrier'" >/dev/null
wait "$barrier_pid" || true
wait "$snapshot_pid"
wait "$revoke_pid"
if query "$agency_snapshot" >"$cluster_root/provider-replay-denied.log" 2>&1;then printf 'Unqualified provider replay accepted\n' >&2;exit 1;fi
rg -q responsibility_provider_unqualified "$cluster_root/provider-replay-denied.log"
if query "begin read only;select public.read_responsibility_month_evidence('$business','$agency_actor','rr-agency@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '7 months')::date);rollback" >"$cluster_root/provider-reader-denied.log" 2>&1;then printf 'Unqualified provider read accepted\n' >&2;exit 1;fi
rg -q responsibility_provider_unqualified "$cluster_root/provider-reader-denied.log"
query "drop trigger monthly_provider_timing on public.responsibility_meter_months;drop schema monthly_provider_race cascade;select public.record_agency_verification('rr-other@example.test','$agency','email','verified','{\"note\":\"Fictional restore\"}',null)" >/dev/null
printf 'Qualified provider capture-first verification race serializes; subsequent read and replay deny.\n'
query "set application_name='monthly_provider_lossfirst';begin;select public.record_agency_verification('rr-other@example.test','$agency','email','unverified','{}','Fictional loss-first');select pg_sleep(0.7);commit" >"$cluster_root/provider-lossfirst.log" 2>&1 & loss_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_provider_lossfirst' and wait_event='PgSleep')"
query "set application_name='monthly_provider_candidate';select public.snapshot_responsibility_meter('$business','$agency_actor','rr-agency@example.test',(date_trunc('month',now() at time zone 'UTC')-interval '8 months')::date)" >"$cluster_root/provider-loss-capture.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='monthly_provider_candidate' and wait_event='advisory')"
wait "$loss_pid"
if wait "$candidate_pid";then printf 'Unqualified delayed provider capture accepted\n' >&2;exit 1;fi
rg -q responsibility_provider_unqualified "$cluster_root/provider-loss-capture.log"
[[ "$(query "select not exists(select 1 from public.responsibility_meter_months where business_workspace_id='$business' and month=(date_trunc('month',now() at time zone 'UTC')-interval '8 months')::date)")" == t ]]
query "select public.record_agency_verification('rr-other@example.test','$agency','email','verified','{\"note\":\"Fictional restore\"}',null)" >/dev/null
printf 'Provider verification-loss-first denies delayed monthly capture with no receipt.\n'
printf 'Recurring monthly evidence migration, native history, authority, READ ONLY and rollback/reapply fixtures passed.\n'
