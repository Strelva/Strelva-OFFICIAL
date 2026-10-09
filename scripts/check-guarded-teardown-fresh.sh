#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-guarded-teardown-fresh strelva-guarded-teardown-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql sort;do
 command -v "$command_name" >/dev/null || { printf 'Required command unavailable: %s\n' "$command_name" >&2;exit 1; }
done
[[ -f "$repo_root/tests/guarded-tenant-teardown-schema.sql" ]] || { printf 'Final teardown fixture is missing.\n' >&2;exit 1; }
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# Apply every actual forward migration exactly once, beginning at initial_schema.
# No fabricated legacy tables, inverse experiments or custom baseline precede it.
count=0
while IFS= read -r migration;do
 printf 'Fresh teardown predecessor: %s\n' "$(basename "$migration")"
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 count=$((count+1))
done < <(printf '%s\n' "$repo_root"/supabase/migrations/20*.sql | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/guarded-tenant-teardown-schema.sql"
printf 'PASS final guarded teardown against %s ordered actual forward migrations.\n' "$count"
