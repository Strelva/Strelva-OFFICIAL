#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-payer-billing strelva-payer-socket
mkdir -p "$cluster_socket"
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
 psql "${psql_args[@]}" --file="$migration" >/dev/null
done
psql "${psql_args[@]}" --file="$repo_root/tests/payer-billing-completion-schema.sql"
printf 'Payer party and agency billing runtime verified in isolated PostgreSQL.\n'
