#!/usr/bin/env bash
set -euo pipefail
# Independent all-forward-schema proof. Never loads repository env files.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-lifetime-kind strelva-kind-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)"
  --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
early_lead_migration=20261005090000_tenant_leads.sql
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == "$early_lead_migration" ]]; then continue; fi
  if [[ "$migration_name" == 20261001120000_website_documents.sql ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$early_lead_migration" >/dev/null
  fi
  if [[ "$migration_name" == 20261022183000_lifetime_system_kind.sql ]]; then
    source "$repo_root/scripts/sql/lifetime-system-kind-checks.sh"
    lifetime_system_kind_fingerprint >"$cluster_root/kind-predecessor.txt"
  fi
  # The existing 1751 creation guard deliberately refuses inherited named-role
  # defaults. Supply that explicit local precondition only for this migration;
  # preserve the shim's hostile defaults before and after it. No guard is skipped.
  # This is not hosted/Supabase default-ACL qualification; broad runners remain gates.
  if [[ "$migration_name" == 20261022175100_legacy_google_operation_authority.sql ]]; then
    psql "${psql_args[@]}" -c 'alter default privileges in schema public revoke all on tables from anon, authenticated; alter default privileges in schema public revoke execute on functions from anon, authenticated, service_role;' >/dev/null
  fi
  printf 'Applying %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
  if [[ "$migration_name" == 20261022175100_legacy_google_operation_authority.sql ]]; then
    psql "${psql_args[@]}" -c 'alter default privileges in schema public grant all on tables to anon, authenticated; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;' >/dev/null
  fi
done
check_lifetime_system_kind
psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql"
printf 'Lifetime-kind fully ordered local contract passed; broader workspace/upgrade gates remain separate.\n'
