#!/usr/bin/env bash
set -euo pipefail

# Fresh ordered schema plus focused contracts. This is separate from the full
# historical upgrade/rollback rehearsal; passing it cannot clear that gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-agent-channel-sql strelva-agent-channel-socket
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
  if [[ "$migration_name" == "$early_lead_migration" ]]; then continue; fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$early_lead_migration" >/dev/null
  fi
  printf 'Applying %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done

if [[ "$#" == 0 ]]; then set -- tests/agent-confirmed-provenance-schema.sql tests/agent-channel-schema.sql tests/agent-channel-abuse-schema.sql tests/agent-booking-admission-schema.sql tests/agent-oauth-connection-schema.sql tests/agent-oauth-renewable-schema.sql tests/agent-oauth-renewable-rollback-schema.sql tests/agent-website-tools-schema.sql; fi
for fixture in "$@"; do
  if [[ "$fixture" != tests/*.sql || "$fixture" == *'..'* || ! -f "$repo_root/$fixture" ]]; then
    printf 'Invalid focused fixture: %s\n' "$fixture" >&2
    exit 1
  fi
  printf 'Checking %s\n' "$fixture"
  psql "${psql_args[@]}" --file="$repo_root/$fixture"
done
printf 'Focused SQL contracts passed; full historical upgrade proof remains separate.\n'

# Optional composed HTTP -> service-role RPC -> real disposable PostgreSQL proof.
# No credential or production target is accepted; the cluster above owns these values.
if [[ "${STRELVA_MCP_HTTP_SQL_PROOF:-0}" == 1 ]]; then
  PGHOST="$cluster_socket" PGPORT="$cluster_port" PGUSER="$(id -un)" PGDATABASE=postgres \
    node "$repo_root/scripts/check-mcp-http-sql.mjs"
fi
