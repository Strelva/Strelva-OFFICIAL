#!/usr/bin/env bash
# Only the owned disposable native cluster: no Docker or outside connection.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-provider-alerts strelva-provider-alerts-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
migration_count=0
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2
    cat "$cluster_root/migration.log" >&2
    exit 1
  fi
  migration_count=$((migration_count + 1))
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
function_catalog_query="select p.oid::regprocedure::text,p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))::text,md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by p.oid::regprocedure::text"
psql "${psql_args[@]}" -Atc "$function_catalog_query" >"$cluster_root/before.catalog"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-health-alerts-schema.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$function_catalog_query" >"$cluster_root/after.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/after.catalog"
# Empty-read rollback/reapply must reproduce every public definition/ACL.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020143000_provider_health_alerts.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020143000_provider_health_alerts.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$function_catalog_query" >"$cluster_root/reapplied.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/reapplied.catalog"
remaining="$(psql "${psql_args[@]}" -Atc "select count(*) from public.users where email like 'pa-%@example.test'")"
[[ "$remaining" == 0 ]] || { printf 'Provider alert fixture left fictional users behind.\n' >&2; exit 1; }
printf 'Provider health SQL passed on %s ordered migrations: current provider/seat/staff, verified actor, sanitized read-back/calendar alerts, revocation, ACL, rollback/reapply.\n' "$migration_count"
