#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260905190000_release_one_workspaces.sql"
schema_test="$repo_root/tests/workspace-schema.sql"
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/strelva-workspace-sql.XXXXXX")"
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
  printf 'Workspace SQL cluster preserved at: %s\n' "$cluster_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required PostgreSQL command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$migration" || ! -f "$schema_test" ]]; then
  printf 'Workspace migration or SQL test fixture is missing.\n' >&2
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

# This deliberately creates only the identity columns and database roles the
# additive workspace migration references. It does not apply another migration.
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

psql "${psql_args[@]}" --file="$migration"
psql "${psql_args[@]}" --file="$schema_test"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260908120000_workspace_result_recovery.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-recovery-schema.sql"

printf 'Workspace SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
