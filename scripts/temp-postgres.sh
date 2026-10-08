#!/usr/bin/env bash
# Shared lifecycle for disposable SQL checks. Source before allocating anything.
# PostgreSQL 18 on macOS needs a valid process locale even with initdb --locale=C.
# libpq accepts PGHOSTADDR in preference to an explicit Unix --host. Strip
# every inherited PostgreSQL setting before initdb/pg_ctl/psql can run; tests
# may explicitly set PGOPTIONS afterwards for a particular local race.
for postgres_env_name in "${!PG@}"; do
  unset "$postgres_env_name"
done
unset postgres_env_name
export LC_ALL=C
cluster_root=''
cluster_data=''
cluster_socket=''
cluster_postmaster_pid=''

cleanup_temp_postgres() {
  local status=$?
  trap - EXIT INT TERM
  # Read again on exit: pg_ctl can start Postgres and then fail before returning.
  if [[ -n "$cluster_data" && -f "$cluster_data/postmaster.pid" ]]; then
    read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid" || true
    if ! pg_ctl -D "$cluster_data" -m fast -w stop >/dev/null 2>&1; then
      pg_ctl -D "$cluster_data" -m immediate -w stop >/dev/null 2>&1 || true
    fi
    if [[ "$cluster_postmaster_pid" =~ ^[0-9]+$ ]] && kill -0 "$cluster_postmaster_pid" 2>/dev/null; then
      printf 'Unable to stop owned PostgreSQL PID %s; retained cluster: %s\n' "$cluster_postmaster_pid" "$cluster_root" >&2
      exit 1
    fi
  fi
  [[ -z "$cluster_socket" ]] || rm -rf -- "$cluster_socket"
  [[ -z "$cluster_root" ]] || rm -rf -- "$cluster_root"
  exit "$status"
}
trap cleanup_temp_postgres EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

create_temp_postgres() {
  cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/$1.XXXXXX")"
  cluster_data="$cluster_root/data"
  cluster_socket="$cluster_root/socket"
  cluster_log="$cluster_root/postgres.log"
  if [[ -n "${2:-}" ]]; then
    # The upgrade socket needs a short path for macOS's Unix socket limit.
    cluster_socket="$(mktemp -d "/tmp/$2.XXXXXX")"
  fi
}
