#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_migration="20260802120000_report_snapshots.sql"
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

for command_name in initdb pg_ctl psql grep; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required upgrade-check command is unavailable: %s\n' "$command_name" >&2
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
insert into public.report_snapshots (tenant_id, period, metrics)
  values ('upgrade-site', '2026-08', '{"retained":true}'::jsonb);
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
  if [[ "$migration_name" == "20260920060000_content_version_request_id.sql" ]]; then
    # A reader must make the metadata change fail immediately, not queue an
    # exclusive lock that would hold up subsequent client requests.
    PGAPPNAME=strelva-column-holder psql "${psql_args[@]}" \
      -c 'begin; lock table public.content_versions in access share mode; select pg_sleep(2); rollback;' \
      > "$cluster_root/column-holder.log" 2>&1 &
    holder_pid=$!
    lock_ready=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='strelva-column-holder' and l.relation='public.content_versions'::regclass and l.granted);")" == t ]]; then lock_ready=1; break; fi
      sleep 0.025
    done
    [[ "$lock_ready" == 1 ]] || { printf 'Reader lock fixture failed.\n' >&2; exit 1; }
    if PGOPTIONS='-c statement_timeout=500ms' psql "${psql_args[@]}" --file="$migration" > "$cluster_root/column-contention.log" 2>&1; then
      printf 'Column migration incorrectly accepted a conflicting client lock.\n' >&2; exit 1
    fi
    grep -q 'could not obtain lock' "$cluster_root/column-contention.log"
    [[ "$(psql "${psql_args[@]}" -Atc "select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='content_versions' and column_name='request_id');")" == t ]]
    wait "$holder_pid"
    printf 'Column contention failed immediately and left the schema unchanged.\n'
  fi
  if [[ "$migration_name" == "20260920060100_content_version_request_index.sql" ]]; then
    # Simulate concurrent maintenance. The index may wait/fail, but a client
    # writer must still acquire its normal lock while that index is waiting.
    PGAPPNAME=strelva-index-holder psql "${psql_args[@]}" \
      -c 'begin; lock table public.content_versions in share update exclusive mode; select pg_sleep(3); rollback;' \
      > "$cluster_root/index-holder.log" 2>&1 &
    holder_pid=$!
    lock_ready=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='strelva-index-holder' and l.relation='public.content_versions'::regclass and l.granted);")" == t ]]; then lock_ready=1; break; fi
      sleep 0.025
    done
    [[ "$lock_ready" == 1 ]] || { printf 'Index lock fixture failed.\n' >&2; exit 1; }
    PGAPPNAME=strelva-waiting-index psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-contention.log" 2>&1 &
    index_pid=$!
    index_waiting=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='strelva-waiting-index' and wait_event_type='Lock');")" == t ]]; then index_waiting=1; break; fi
      sleep 0.025
    done
    [[ "$index_waiting" == 1 ]] || { printf 'Index did not reach the contention boundary.\n' >&2; exit 1; }
    psql "${psql_args[@]}" -c 'begin; lock table public.content_versions in row exclusive mode nowait; rollback;' >/dev/null
    if wait "$index_pid"; then printf 'Expected bounded index lock timeout was absent.\n' >&2; exit 1; fi
    grep -q 'lock timeout' "$cluster_root/index-contention.log"
    wait "$holder_pid"
    printf 'Client writer remained available during a bounded index lock wait.\n'
  fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
  if [[ "$migration_name" == "20260920060100_content_version_request_index.sql" ]]; then
    psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-retry.log" 2>&1
    psql "${psql_args[@]}" -c 'alter index public.content_versions_tenant_request_idx rename to content_versions_expected_idx; create index content_versions_tenant_request_idx on public.content_versions (request_id);' >/dev/null
    if psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-wrong-definition.log" 2>&1; then
      printf 'An incompatible existing index was incorrectly accepted.\n' >&2; exit 1
    fi
    grep -q 'content_version_request_index_not_ready' "$cluster_root/index-wrong-definition.log"
    psql "${psql_args[@]}" -c 'drop index public.content_versions_tenant_request_idx; alter index public.content_versions_expected_idx rename to content_versions_tenant_request_idx;' >/dev/null
    printf 'Valid index retry passed; incompatible index was rejected.\n'
  fi
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
if ! grep -Eq "already exists|duplicate" "$rerun_log"; then
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
psql "${psql_args[@]}" --file="$repo_root/tests/service-delivery-commitments-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/customer-business-entry-schema.sql"
printf 'Workspace full-schema upgrade rehearsal passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
