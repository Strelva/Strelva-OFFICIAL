#!/usr/bin/env bash
# Claim review (20261024300000): found facts, pre-claim Prepare and the owner's
# per-area claim on the full ordered schema, the rollback stop point once
# anything was staged, an exact catalog restore on an empty rollback, and
# reapply. Local throwaway cluster; nothing is sent and nothing calls Google.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-claim-review strelva-claim-review-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
migration_name="20261024300000_claim_review.sql"
migration="$repo_root/supabase/migrations/$migration_name"
rollback="$repo_root/supabase/migrations/rollback-$migration_name"
contract="$repo_root/tests/claim-review-schema.sql"

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
  printf 'Claim review rollback did not restore the public catalog.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" --file="$migration" >/dev/null 2>&1
psql "${psql_args[@]}" --file="$contract" >/dev/null

# Once anything was staged before a claim, rollback refuses and keeps it.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id, email, verified_at) values ('c7100000-0000-4000-8000-000000000001', 'cr-rollback@agency.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('c7100000-0000-4000-8000-000000000020', 'agency', 'Rollback Agency', 'c7100000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('c7100000-0000-4000-8000-000000000020', 'c7100000-0000-4000-8000-000000000001', 'owner', 'c7100000-0000-4000-8000-000000000001');
select public.stage_agency_client_found_facts('c7100000-0000-4000-8000-000000000001', 'cr-rollback@agency.example.test',
  'c7100000-0000-4000-8000-000000000020',
  ((public.agency_add_client('c7100000-0000-4000-8000-000000000001', 'cr-rollback@agency.example.test',
    'c7100000-0000-4000-8000-000000000020', '{"name":"Rollback Client"}', 'c7100000-0000-4000-8000-0000000000c1', repeat('a', 64)))->>'customerWorkspaceId')::uuid,
  '[]');
SQL
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Claim review rollback discarded pre-claim grants.\n' >&2
  exit 1
fi
grep -q 'claim_review_rollback_refused' "$cluster_root/rollback-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "select count(*) from public.agency_scope_grants where basis = 'pre_claim'")" == "5" ]]
printf 'Claim review SQL passed: staged found facts with sources, pre-claim Prepare decides nothing, second agency sees nothing, per-area consent at claim, owner-only rights, replay, rollback restore/refusal and reapply.\n'
