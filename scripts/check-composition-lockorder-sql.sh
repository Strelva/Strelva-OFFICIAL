#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-lockorder strelva-lockorder-socket
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 if [[ "$(basename "$migration")" == '20261021096000_agency_release_flag_lock_order.sql' ]]; then continue; fi
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 printf 'Applied %s\n' "$(basename "$migration")"
done
if [[ "${1:-}" != '--red' ]]; then
 python3 "$repo_root/scripts/check-composition-lockorder.py" catalog "$repo_root" "${psql_args[@]}"
fi
psql "${psql_args[@]}" -Atc "select encode(sha256(convert_to(prosrc,'UTF8')),'hex') original_agency_body_sha256 from pg_proc where oid='public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text)'::regprocedure"
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/agency-release-flags-schema.sql"
mode=green
[[ "${1:-}" != '--red' ]] || mode=red
if [[ "$mode" == green ]]; then
 psql "${psql_args[@]}" -c 'create database composition_authority_races template postgres' >/dev/null
 python3 "$repo_root/scripts/check-agency-release-flag-races.py" "${psql_args[@]}" --dbname=composition_authority_races
 psql "${psql_args[@]}" -c "begin read only; set local role service_role; select public.read_agency_release_flags('25600000-0000-4000-8000-000000000020','25600000-0000-4000-8000-000000000010','25600000-0000-4000-8000-000000000003','flags-agency@example.test'); rollback;"
fi
python3 "$repo_root/scripts/check-composition-lockorder.py" "$mode" "$repo_root" "${psql_args[@]}"
if [[ "$mode" == green ]]; then
 psql "${psql_args[@]}" --file="$repo_root/tests/native-business-billing-home-schema.sql"
fi
printf 'Actual composition lock-order %s proof passed; owned cluster cleanup follows.\n' "$mode"
