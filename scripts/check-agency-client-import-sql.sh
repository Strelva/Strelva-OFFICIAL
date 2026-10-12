#!/usr/bin/env bash
# Import clients and per-agency add limits (20261024200000): the contract on
# the full ordered schema, an exact catalog restore on an empty rollback, the
# rollback stop point once an operator set limits, and reapply. Local
# throwaway cluster only.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-agency-client-import strelva-client-import-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
migration_name="20261024200000_agency_client_import.sql"
migration="$repo_root/supabase/migrations/$migration_name"
rollback="$repo_root/supabase/migrations/rollback-$migration_name"
contract="$repo_root/tests/agency-client-import-schema.sql"

initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
catalog_fingerprint() {
  psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql"
}

psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for earlier in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  [[ "$(basename "$earlier")" < "$migration_name" ]] || break
  psql "${psql_args[@]}" --file="$earlier" >"$cluster_root/earlier.log" 2>&1 || { printf 'Earlier migration failed: %s\n' "$earlier" >&2; cat "$cluster_root/earlier.log" >&2; exit 1; }
done
catalog_fingerprint >"$cluster_root/catalog-before.txt"

psql "${psql_args[@]}" --file="$migration" >/dev/null
psql "${psql_args[@]}" --file="$contract" >/dev/null

# Empty rollback restores the catalog exactly, then the migration reapplies.
psql "${psql_args[@]}" --file="$rollback" >/dev/null
catalog_fingerprint >"$cluster_root/catalog-after-rollback.txt"
if ! diff -u "$cluster_root/catalog-before.txt" "$cluster_root/catalog-after-rollback.txt"; then
  printf 'Agency client import rollback did not restore the public catalog.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" --file="$migration" >/dev/null
psql "${psql_args[@]}" --file="$contract" >/dev/null

# Once an operator has set an agency's limits, rollback refuses and keeps them.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id, email, verified_at) values
  ('c2000000-0000-4000-8000-000000000001', 'rollback-owner@import-agency.example.test', now()),
  ('c2000000-0000-4000-8000-000000000002', 'rollback-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('c2000000-0000-4000-8000-000000000002', 'rollback-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('c2000000-0000-4000-8000-000000000020', 'agency', 'Rollback Import Agency', 'c2000000-0000-4000-8000-000000000001');
select public.set_agency_client_add_limits('rollback-operator@strelva.example.test', 'c2000000-0000-4000-8000-000000000020', 60, 200, 'Rollback fixture', 0);
SQL
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Agency client import rollback discarded operator-set limits.\n' >&2
  exit 1
fi
grep -q 'agency_client_import_rollback_requires_data_preservation' "$cluster_root/rollback-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "select count(*) from public.agency_client_add_limit_overrides")" == "1" ]]
printf 'Agency client import SQL passed: default unchanged, operator-only per-agency limits with history, per-agency enforcement, import preview isolation, replay without quota, rollback restore/refusal and reapply.\n'
