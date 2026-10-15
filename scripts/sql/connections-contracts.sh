#!/usr/bin/env bash
# Sourced only after the complete October 25 schema. The caller owns an isolated
# local cluster, psql_args and repo_root; this helper never reads environment files.
check_connections_contracts() {
  local migration_name
  for migration_name in \
    20261026100000_conn_core_holders.sql \
    20261026110000_conn_google_agency_oauth.sql \
    20261026120100_conn_tools_installer.sql; do
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$migration_name"
  done
  # Keep the retained immutable revision genuinely legacy before adding the
  # validator. Do not fabricate compatibility by rewriting its stored bytes.
  psql "${psql_args[@]}" --file="$repo_root/tests/conn-apps-declarations-before.sql"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261026130000_conn_apps_declarations.sql"
  for migration_name in conn-core-schema conn-google-agency-oauth conn-tools-installer-schema conn-apps-declarations-schema; do
    psql "${psql_args[@]}" --file="$repo_root/tests/$migration_name.sql"
  done
  psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql"
  node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
  printf 'Connections: four held forwards and all four native contracts on the final composed schema; client exposure and READ ONLY call paths checked. Local only.\n'
}
