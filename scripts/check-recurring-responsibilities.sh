#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-recurring-sql strelva-recurring-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == "20261005090000_tenant_leads.sql" ]]; then continue; fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null
  fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
 done
psql "${psql_args[@]}" --file="$repo_root/tests/recurring-responsibilities-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090028_recurring_responsibilities.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090028_recurring_responsibilities.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/recurring-responsibilities-schema.sql" >/dev/null
printf 'Recurring responsibility migration and authority/runtime fixtures passed.\n'
