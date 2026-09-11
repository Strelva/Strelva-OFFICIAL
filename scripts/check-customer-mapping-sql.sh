#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace_migration="$repo_root/supabase/migrations/20260905190000_release_one_workspaces.sql"
customer_migration="$repo_root/supabase/migrations/20260908150000_enterprise_customers.sql"
schema_test="$repo_root/tests/customer-mapping-schema.sql"
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/strelva-customers-sql.XXXXXX")"
cluster_data="$cluster_root/data"
cluster_socket="$cluster_root/socket"
cluster_log="$cluster_root/postgres.log"
cluster_port="$((61000 + ($$ % 3000)))"
cluster_started=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$cluster_started" -eq 1 ]]; then
    pg_ctl -D "$cluster_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  printf 'Customer SQL cluster preserved at: %s\n' "$cluster_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required PostgreSQL command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$workspace_migration" || ! -f "$customer_migration" || ! -f "$schema_test" ]]; then
  printf 'Workspace migration, customer migration, or SQL test fixture is missing.\n' >&2
  exit 1
fi

mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" \
  -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" \
  -w start >/dev/null
cluster_started=1

psql_args=(
  --host="$cluster_socket"
  --port="$cluster_port"
  --username="$(id -un)"
  --dbname=postgres
  --set=ON_ERROR_STOP=1
  --no-psqlrc
)

# Keep the proof isolated and create only the identity/roles required by the
# workspace and customer migrations.  No application or production database is
# contacted by this runner.
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;
create table public.users (
  id uuid primary key,
  email text unique not null,
  verified_at timestamptz
);
SQL

psql "${psql_args[@]}" --file="$workspace_migration" >/dev/null
psql "${psql_args[@]}" --file="$customer_migration" >/dev/null
psql "${psql_args[@]}" --file="$schema_test"

printf 'Customer mapping SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
