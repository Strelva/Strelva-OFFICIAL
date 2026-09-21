#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_migration="20260729180000_org_layer_phase0_accounts.sql"
upgrade_migration="20260905190000_release_one_workspaces.sql"
schema_test="$repo_root/tests/workspace-upgrade-schema.sql"
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/strelva-workspace-upgrade.XXXXXX")"
cluster_data="$cluster_root/data"
cluster_socket="$(mktemp -d /tmp/strelva-upgrade-socket.XXXXXX)"
cluster_log="$cluster_root/postgres.log"
cluster_port="$((61000 + ($$ % 3000)))"
cluster_started=0

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "$cluster_started" -eq 1 ]]; then
    pg_ctl -D "$cluster_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$cluster_socket"
  printf 'Workspace upgrade cluster preserved at: %s\n' "$cluster_root"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required PostgreSQL command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$schema_test" || ! -f "$repo_root/supabase/migrations/$baseline_migration" || ! -f "$repo_root/supabase/migrations/$upgrade_migration" ]]; then
  printf 'Upgrade baseline, migration, or SQL test fixture is missing.\n' >&2
  exit 1
fi

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

# Supabase owns auth.users and auth.uid(). The compatibility shim is local-only;
# the public schema itself starts from the repository's real historical migrations.
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz
);
create function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL

for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" > "$baseline_migration" ]]; then
    break
  fi
  printf 'Applying documented prior schema: %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done

# Representative rows exist before the workspace/recovery additions. The
# identity and tenant migrations above create the same columns/triggers used by
# this fixture; later migrations must preserve these rows and their mirrors.
psql "${psql_args[@]}" <<'SQL'
insert into public.users (id, email, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@upgrade.example', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'unverified@upgrade.example', null);
insert into public.tenants (id, site_name, active)
  values ('upgrade-site', 'Upgrade Fixture Site', true);
insert into public.memberships (user_id, tenant_id, role)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'upgrade-site', 'owner');
insert into public.content (tenant_id, section, data)
  values ('upgrade-site', 'hero', '{"headline":"Before the workspace upgrade"}'::jsonb);
SQL

tail_started=0
for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  migration_name="$(basename "$migration")"
  if [[ "$tail_started" -eq 0 ]]; then
    if [[ "$migration_name" != "$upgrade_migration" ]]; then
      continue
    fi
    tail_started=1
  fi
  printf 'Applying ordered workspace/recovery migration: %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done

if [[ "$tail_started" -ne 1 ]]; then
  printf 'Workspace/recovery migration boundary was not found.\n' >&2
  exit 1
fi

# A second application of the first workspace migration must fail atomically.
# Run it in a transaction so a failed rerun cannot leave a partial schema behind.
rerun_log="$cluster_root/rerun.log"
if psql "${psql_args[@]}" --single-transaction --file="$repo_root/supabase/migrations/$upgrade_migration" >"$rerun_log" 2>&1; then
  printf 'The workspace migration unexpectedly ran twice.\n' >&2
  exit 1
fi
if ! rg -q "already exists|duplicate" "$rerun_log"; then
  cat "$rerun_log" >&2
  printf 'The expected migration rerun failure was not observed.\n' >&2
  exit 1
fi
workspace_table_exists="$(psql "${psql_args[@]}" --tuples-only --no-align --command="select to_regclass('public.workspaces') is not null;")"
if [[ "$workspace_table_exists" != "t" ]]; then
  printf 'The failed rerun removed the workspace table.\n' >&2
  exit 1
fi
printf 'Expected migration rerun rejection preserved the applied schema.\n'

psql "${psql_args[@]}" --file="$schema_test"
printf 'Workspace full-schema upgrade rehearsal passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
