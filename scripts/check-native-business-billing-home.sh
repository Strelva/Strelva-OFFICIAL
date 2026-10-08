#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-native-business-home strelva-home-socket
mkdir -p "$cluster_socket"
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --set=ON_ERROR_STOP=1 --no-psqlrc)
new_migration="$repo_root/supabase/migrations/20261021095000_native_business_billing_home.sql"
migration_files=()
while IFS= read -r migration;do migration_files+=("$migration");done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
for database in home_fresh home_upgrade;do
 psql "${psql_args[@]}" --dbname=postgres -c "create database $database" >/dev/null
 if [[ "$database" == home_fresh ]];then
  psql "${psql_args[@]}" --dbname="$database" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
 else
  # Roles belong to this owned cluster, while auth/schema/default grants belong
  # to each database. Reuse the exact roles rather than weakening any grant.
  sed '/^create role /d' "$repo_root/scripts/sql/local-supabase-shim.sql" > "$cluster_root/upgrade-shim.sql"
  psql "${psql_args[@]}" --dbname="$database" --file="$cluster_root/upgrade-shim.sql" >/dev/null
 fi
 for migration in "${migration_files[@]}";do
  [[ "$database" != home_upgrade || "$migration" != "$new_migration" ]] || continue
  psql "${psql_args[@]}" --dbname="$database" --file="$migration" >/dev/null
 done
 if [[ "$database" == home_upgrade ]];then
  psql "${psql_args[@]}" --dbname="$database" --file="$repo_root/tests/native-business-billing-home-upgrade.sql" >/dev/null
  psql "${psql_args[@]}" --dbname="$database" --file="$new_migration" >/dev/null
  psql "${psql_args[@]}" --dbname="$database" --file="$repo_root/tests/native-business-billing-home-post-upgrade.sql" >/dev/null
 fi
 psql "${psql_args[@]}" --dbname="$database" --file="$repo_root/tests/native-business-billing-home-schema.sql" >/dev/null
 # Actual conversion preserves payment/provenance/receipts; known unlink refusal retained.
 psql "${psql_args[@]}" --dbname="$database" --file="$repo_root/tests/native-business-billing-conversion-schema.sql" >/dev/null
 node "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///$database?host=$cluster_socket&port=$cluster_port"
 echo "PASS $database: both native creation RPCs, unpriced party/line, conversion and read-only graph."
done
# Two real concurrent sessions exercise both lock orderings against a missing
# legacy home. All fixtures are disposable; no runtime grants are relaxed.
for first in ensure accept;do
 psql "${psql_args[@]}" --dbname=home_upgrade -q <<'SQL'
delete from public.accounts where workspace_id='7f000000-0000-4000-8000-000000000012';
select public.workspace_payer_transition_command('{"action":"propose","workspaceId":"7f000000-0000-4000-8000-000000000012","successorAgencyWorkspaceId":"7f000000-0000-4000-8000-000000000020"}','7f000000-0000-4000-8000-000000000001','home-owner@example.test');
SQL
 ensure="select public.ensure_native_business_billing_home('7f000000-0000-4000-8000-000000000012');"
 accept="select public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',id),'7f000000-0000-4000-8000-000000000002','home-agency@example.test') from public.workspace_payer_transitions where workspace_id='7f000000-0000-4000-8000-000000000012' and status='pending';"
 if [[ "$first" == ensure ]];then one="$ensure";two="$accept";else one="$accept";two="$ensure";fi
 psql "${psql_args[@]}" --dbname=home_upgrade -q > "$cluster_root/race-first.log" 2>&1 <<SQL &
begin;
$one
select 'race-lock-held';
select pg_sleep(2);
commit;
SQL
 race_pid=$!
 for _ in $(seq 1 100);do rg -q race-lock-held "$cluster_root/race-first.log" && break;sleep 0.02;done
 rg -q race-lock-held "$cluster_root/race-first.log" || { cat "$cluster_root/race-first.log" >&2;exit 1; }
 PGAPPNAME=native-home-second psql "${psql_args[@]}" --dbname=home_upgrade -q -c "$two" > "$cluster_root/race-second.log" 2>&1 &
 second_pid=$!
 blocked=0
 for _ in $(seq 1 100);do
  if [[ "$(psql "${psql_args[@]}" --dbname=home_upgrade -Atc "select count(*) from pg_stat_activity where application_name='native-home-second' and wait_event='advisory'")" == 1 ]];then blocked=1;break;fi
  sleep 0.02
 done
 [[ "$blocked" == 1 ]] || { echo 'Second session was not observed waiting on the payer advisory boundary.' >&2;exit 1; }
 wait "$race_pid"
 wait "$second_pid"
 psql "${psql_args[@]}" --dbname=home_upgrade -q <<'SQL'
select proof_home.assert((select count(*)=1 and bool_and(payer_kind='agency' and payer_workspace_id='7f000000-0000-4000-8000-000000000020' and monthly_cents is null) from public.accounts where workspace_id='7f000000-0000-4000-8000-000000000012'),'concurrent accepted party converges once');
select proof_home.assert((select count(*)=1 and bool_and(line_state='active' and amount_cents is null) from public.subscription_items where business_workspace_id='7f000000-0000-4000-8000-000000000012'),'race retains exactly one unpriced line');
SQL
 echo "PASS concurrency: $first first, native accepted party and one unpriced line."
done
psql "${psql_args[@]}" --dbname=home_upgrade -q <<'SQL'
update proof_home.snapshots set body=(select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a) where name='provisioned';
insert into proof_home.snapshots select 'lines',jsonb_agg(to_jsonb(i) order by i.id) from public.subscription_items i;
SQL
# A future function body retaining the old metadata must stop the inverse.
cat > "$cluster_root/successor-guard.sql" <<SQL
begin;
create or replace function public.ensure_native_business_billing_home(p_workspace_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as \$\$ begin raise exception 'future_successor';end \$\$;
\i $repo_root/supabase/migrations/rollback-20261021095000_native_business_billing_home.sql
SQL
if psql "${psql_args[@]}" --dbname=home_upgrade --file="$cluster_root/successor-guard.sql" > "$cluster_root/successor-guard.log" 2>&1;then
 echo 'Rollback unexpectedly removed a future function successor.' >&2;exit 1
fi
rg -q native_business_billing_rollback_conflict "$cluster_root/successor-guard.log"
echo 'PASS inverse guard refuses a later function definition; probe transaction rolled back.'
psql "${psql_args[@]}" --dbname=home_upgrade --file="$repo_root/supabase/migrations/rollback-20261021095000_native_business_billing_home.sql" >/dev/null
psql "${psql_args[@]}" --dbname=home_upgrade -q <<'SQL'
select proof_home.assert((select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a)=(select body from proof_home.snapshots where name='provisioned'),'rollback preserves every account byte');
select proof_home.assert((select jsonb_agg(to_jsonb(i) order by i.id) from public.subscription_items i)=(select body from proof_home.snapshots where name='lines'),'rollback preserves every client line byte');
select proof_home.assert(to_regprocedure('public.ensure_native_business_billing_home(uuid)') is null,'rollback stops native provisioner');
SQL
psql "${psql_args[@]}" --dbname=home_upgrade --file="$new_migration" >/dev/null
psql "${psql_args[@]}" --dbname=home_upgrade -q <<'SQL'
select proof_home.assert((select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a)=(select body from proof_home.snapshots where name='provisioned'),'reapply does not rewrite retained accounts');
SQL
echo 'PASS data-preserving rollback/reapply; no accounts, history or client lines erased.'
