#!/usr/bin/env bash
# Dedupe-flows migrations (owner_decisions policy rows and the v3 provider
# client queue): contracts on the full ordered schema, an exact rollback to the
# prior catalog, and a clean reapply. Local throwaway cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-dedupe-flows strelva-dedupe-flows-socket
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
  for contract in "$repo_root"/tests/dedupe-flows-*-schema.sql; do psql "${psql_args[@]}" --file="$contract" >/dev/null; done
}

psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
ordered=$(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | awk -F/ '{print $NF"\t"$0}' | sort | cut -f2)
forwards=$(printf '%s\n' $ordered | grep -E '_dedupe_flows_|_provider_client_queue_v3')
first_forward="$(basename "$(printf '%s\n' $forwards | head -n 1)")"
for migration in $ordered; do
  if [[ "$(basename "$migration")" < "$first_forward" ]]; then apply "$migration"; fi
done
fingerprint before
for forward in $forwards; do apply "$forward"; done
run_contracts
fingerprint after
for forward in $(printf '%s\n' $forwards | sort -r); do apply "$(dirname "$forward")/rollback-$(basename "$forward")"; done
fingerprint rolled-back
diff -u "$cluster_root/before.txt" "$cluster_root/rolled-back.txt" >&2 || { printf 'Dedupe flows rollback did not restore the prior catalog.\n' >&2; exit 1; }
for forward in $forwards; do apply "$forward"; done
fingerprint reapplied
diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt" >&2 || { printf 'Dedupe flows reapply differs from the first apply.\n' >&2; exit 1; }
run_contracts
for migration in $ordered; do
  if [[ "$(basename "$migration")" > "$(basename "$(printf '%s\n' $forwards | tail -n 1)")" ]]; then apply "$migration"; fi
done
printf 'Dedupe flows SQL contract passed (forward, exact rollback, reapply).\n'
