#!/usr/bin/env bash
# ADR 0015 two doors (20261023140000+): the agency-addressed entry, failed plan
# and owner make_systems contracts on the full ordered schema, plus an exact
# rollback to the prior catalog and a clean reapply. Local throwaway cluster.
#
# TWO_DOORS_EXTRA_MIGRATIONS: extra held prerequisites (space-separated
# paths), applied in name order with the tree, for local runs before they land.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-two-doors strelva-two-doors-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
fingerprint() { psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.txt"; }
apply() { psql "${psql_args[@]}" --file="$1" >/dev/null 2>"$cluster_root/migration.err" || { printf 'Migration failed: %s\n' "$1" >&2; cat "$cluster_root/migration.err" >&2; exit 1; }; }
run_contracts() {
  for contract in "$repo_root"/tests/two-doors-*-schema.sql; do psql "${psql_args[@]}" --file="$contract" >/dev/null; done
  # The read-only cost report parses and runs on the real schema.
  psql "${psql_args[@]}" -v days=14 --file="$repo_root/scripts/sql/cost-per-business-report.sql" >/dev/null
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/funnel-report.sql" >/dev/null
}

psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
ordered=$( { find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql'; for extra in ${TWO_DOORS_EXTRA_MIGRATIONS:-}; do printf '%s\n' "$extra"; done; } | awk -F/ '{print $NF"\t"$0}' | sort | cut -f2)
forwards=$(printf '%s\n' $ordered | grep '_two_doors_')
# Rehearse this exact historical packet before applying any later wrappers.
# Later migrations may depend on its tables and capture its function bodies.
first_forward="$(basename "$(printf '%s\n' $forwards | head -n 1)")"
last_forward="$(basename "$(printf '%s\n' $forwards | tail -n 1)")"
for migration in $ordered; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" < "$first_forward" ]]; then apply "$migration"; fi
  if [[ "$migration_name" > "$first_forward" && "$migration_name" < "$last_forward" && "$migration" != *_two_doors_* ]]; then
    printf 'Unexpected migration inside two doors packet: %s\n' "$migration_name" >&2; exit 1
  fi
done
fingerprint before
for forward in $forwards; do apply "$forward"; done
run_contracts
fingerprint after
for forward in $(printf '%s\n' $forwards | sort -r); do apply "$(dirname "$forward")/rollback-$(basename "$forward")"; done
fingerprint rolled-back
diff -u "$cluster_root/before.txt" "$cluster_root/rolled-back.txt" >&2 || { printf 'Two doors rollback did not restore the prior catalog.\n' >&2; exit 1; }
for forward in $forwards; do apply "$forward"; done
fingerprint reapplied
diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt" >&2 || { printf 'Two doors reapply differs from the first apply.\n' >&2; exit 1; }
run_contracts
for migration in $ordered; do
  if [[ "$(basename "$migration")" > "$last_forward" ]]; then apply "$migration"; fi
done
printf 'Two doors SQL contract passed (forward, exact rollback, reapply, ordered UX successors).\n'
