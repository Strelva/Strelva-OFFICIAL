#!/usr/bin/env bash
# ADR 0015 two doors (20261023140000): the agency-addressed entry and failed
# plan contract on the full ordered schema. Local throwaway cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-two-doors strelva-two-doors-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# TWO_DOORS_EXTRA_MIGRATIONS: extra held prerequisites (space-separated paths),
# applied in name order with the tree, for local runs before they land.
for migration in $( { find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql'; for extra in ${TWO_DOORS_EXTRA_MIGRATIONS:-}; do printf '%s\n' "$extra"; done; } | awk -F/ '{print $NF"\t"$0}' | sort | cut -f2); do
  psql "${psql_args[@]}" --file="$migration" >/dev/null 2>"$cluster_root/migration.err" || { printf 'Migration failed: %s\n' "$migration" >&2; cat "$cluster_root/migration.err" >&2; exit 1; }
done
for contract in "$repo_root"/tests/two-doors-*-schema.sql; do
  psql "${psql_args[@]}" --file="$contract" >/dev/null
done
printf 'Two doors SQL contract passed.\n'
