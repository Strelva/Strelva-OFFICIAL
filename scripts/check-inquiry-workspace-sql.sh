#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260911100000_inquiry_capability_workspace.sql"
schema_test="$repo_root/tests/inquiry-workspace-schema.sql"
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/strelva-inquiry-sql.XXXXXX")"
cluster_data="$cluster_root/data"
cluster_socket="$cluster_root/socket"
cluster_log="$cluster_root/postgres.log"
cluster_port="$((64000 + ($$ % 1000)))"
cluster_started=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$cluster_started" -eq 1 ]]; then
    pg_ctl -D "$cluster_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  printf 'Inquiry SQL cluster preserved at: %s\n' "$cluster_root"
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
  printf 'Inquiry migration or SQL test fixture is missing.\n' >&2
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

# Create only the tenant identity boundary and roles referenced by the additive
# inquiry migration. This cluster contains fictional rows and no production data.
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;

create table public.tenants (
  id text primary key,
  stable_id uuid not null unique
);

create or replace function public.set_tenant_stable_id() returns trigger
language plpgsql set search_path = public as $$
begin
  select stable_id into new.tenant_stable_id from public.tenants where id = new.tenant_id;
  if new.tenant_stable_id is null then
    raise exception 'tenant_stable_id_not_found';
  end if;
  return new;
end;
$$;
SQL

psql "${psql_args[@]}" --file="$migration"
psql "${psql_args[@]}" --file="$schema_test"

printf 'Inquiry SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
