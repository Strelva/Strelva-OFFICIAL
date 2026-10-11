#!/usr/bin/env bash
# Agency adds a client (#259, 20261015100000): the contract on the full
# ordered schema, the rollback stop point once a client exists, an exact
# catalog restore on an empty rollback, and reapply. Local throwaway cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-agency-add-client strelva-add-client-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
migration_name="20261015100000_agency_add_client.sql"
migration="$repo_root/supabase/migrations/$migration_name"
rollback="$repo_root/supabase/migrations/rollback-$migration_name"
contract="$repo_root/tests/agency-add-client-schema.sql"

initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
catalog_fingerprint() {
  psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql"
}

psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# Every earlier migration, in file order, so the contract runs against the
# real seat, record, prospect and connected-site functions it depends on.
for earlier in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  [[ "$(basename "$earlier")" < "$migration_name" ]] || break
  psql "${psql_args[@]}" --file="$earlier" >/dev/null 2>&1 || { printf 'Earlier migration failed: %s\n' "$earlier" >&2; exit 1; }
done
catalog_fingerprint >"$cluster_root/catalog-before.txt"

psql "${psql_args[@]}" --file="$migration" >/dev/null 2>&1
psql "${psql_args[@]}" --file="$contract" >/dev/null

# Empty rollback restores the catalog exactly, then the migration reapplies.
psql "${psql_args[@]}" --file="$rollback" >/dev/null 2>&1
catalog_fingerprint >"$cluster_root/catalog-after-rollback.txt"
if ! diff -u "$cluster_root/catalog-before.txt" "$cluster_root/catalog-after-rollback.txt"; then
  printf 'Agency add client rollback did not restore the public catalog.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" --file="$migration" >/dev/null 2>&1
psql "${psql_args[@]}" --file="$contract" >/dev/null

# Once an agency has added a client, rollback refuses and keeps everything.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id, email, verified_at) values ('ad000000-0000-4000-8000-000000000001', 'rollback-owner@agency.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('ad000000-0000-4000-8000-000000000020', 'agency', 'Rollback Agency', 'ad000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ad000000-0000-4000-8000-000000000020', 'ad000000-0000-4000-8000-000000000001', 'owner', 'ad000000-0000-4000-8000-000000000001');
select public.agency_add_client('ad000000-0000-4000-8000-000000000001', 'rollback-owner@agency.example.test',
  'ad000000-0000-4000-8000-000000000020', '{"name":"Rollback Client"}', 'ad000000-0000-4000-8000-0000000000c1', repeat('a', 64));
SQL
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Agency add client rollback discarded an added client.\n' >&2
  exit 1
fi
grep -q 'agency_add_client_rollback_requires_data_preservation' "$cluster_root/rollback-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "select count(*) from public.agency_client_additions")" == "1" ]]
printf 'Agency add client SQL passed: seat not membership, isolation, unconfirmed facts, limits, owner claim, rollback restore/refusal and reapply.\n'
