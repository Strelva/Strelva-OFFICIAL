#!/usr/bin/env bash
set -euo pipefail

# Fresh ordered schema plus focused contracts. This is separate from the full
# historical upgrade/rollback rehearsal; passing it cannot clear that gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-creator-apps-sql strelva-creator-apps-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)"
  --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null

early_lead_migration="20261005090000_tenant_leads.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 migration_name="$(basename "$migration")"
 if [[ "$migration_name" == "$early_lead_migration" ]];then continue;fi
 if [[ "$migration_name" == "20261001120000_website_documents.sql" ]];then psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$early_lead_migration" >/dev/null;fi
 if [[ "$migration_name" == "20261020090021_creator_packages.sql" ]];then psql "${psql_args[@]}" --file="$repo_root/scripts/sql/creator-populated-before.sql" >/dev/null;fi
 printf 'Applying %s\n' "$migration_name"
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 if [[ "$migration_name" == "20261020090021_creator_packages.sql" ]];then
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/creator-populated-after.sql" >/dev/null
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090021_creator_packages.sql" >/dev/null
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/creator-populated-after.sql" >/dev/null
  psql "${psql_args[@]}" --file="$migration" >/dev/null
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/creator-populated-after.sql" >/dev/null
 fi
done
psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/offering-source-versions-schema.sql" >/dev/null
printf 'Creator populated native upgrade, rollback/reapply and offering adoption contracts passed.\n'
