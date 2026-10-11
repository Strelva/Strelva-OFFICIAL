#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-agency-flags strelva-flags-socket
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 if [[ "$(basename "$migration")" == "20261021093000_agency_release_flag_ceiling.sql" ]]; then
  operator_before="$(psql "${psql_args[@]}" -Atc "select md5(pg_get_functiondef('public.set_workspace_release_flag(text,uuid,text,text,text,bigint)'::regprocedure)||coalesce(proacl::text,'')) from pg_proc where oid='public.set_workspace_release_flag(text,uuid,text,text,text,bigint)'::regprocedure")"
 fi
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 printf 'Applied %s\n' "$(basename "$migration")"
done
psql "${psql_args[@]}" --command="create database agency_flags_rollback_race template postgres" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/agency-release-flags-schema.sql"
# Empty rollback exactly restores the current approved-only operator path.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021093000_agency_release_flag_ceiling.sql"
operator_after="$(psql "${psql_args[@]}" -Atc "select md5(pg_get_functiondef('public.set_workspace_release_flag(text,uuid,text,text,text,bigint)'::regprocedure)||coalesce(proacl::text,'')) from pg_proc where oid='public.set_workspace_release_flag(text,uuid,text,text,text,bigint)'::regprocedure")"
[[ "$operator_after" == "$operator_before" ]] || { printf 'Operator definition/ACL rollback drift
' >&2; exit 1; }
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021093000_agency_release_flag_ceiling.sql"
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/agency-release-flags-schema.sql"
psql "${psql_args[@]}" --command="begin read only; set local role service_role; select public.read_agency_release_flags('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test'); select public.read_operator_agency_release_flags('25600000-0000-4000-8000-000000000001','flags-operator@example.test','25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010'); rollback;"
python3 "$repo_root/scripts/check-agency-release-flag-races.py" "${psql_args[@]}"
python3 "$repo_root/scripts/check-agency-release-flag-rollback-race.py" "$repo_root" "${psql_args[@]}" --dbname=agency_flags_rollback_race
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021093000_agency_release_flag_ceiling.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
 printf 'Rollback discarded retained permission/history\n' >&2; exit 1
fi
rg -q 'agency_release_flag_rollback_requires_data_preservation' "$cluster_root/rollback-refusal.log"
printf 'Ordered schema, native authority, READ ONLY, races and rollback guard passed.\n'
