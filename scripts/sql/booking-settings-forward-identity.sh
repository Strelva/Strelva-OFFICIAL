#!/usr/bin/env bash
# Root-owned prepared disposable cluster only. Starts no daemon. Run with the
# target RPC absent; each hostile default privilege attempt must roll back.
run_booking_settings_forward_identity() (
  set -euo pipefail
  umask 077
  source "$repo_root/scripts/sql/booking-owned-cluster.sh"
  verify_booking_settings_owned_cluster || exit 1
  local target='public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)'
  local forward="$repo_root/supabase/migrations/20261022182000_booking_settings_atomic_patch.sql"
  bs_forward_query() { bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "$1"; }
  local before current mutation name
  [[ "$(bs_forward_query "select to_regprocedure('$target') is null")" == t ]] || { printf 'Expected RPC absent before forward admission probes.\n' >&2; exit 1; }
  before="$(bs_forward_query "select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]'::jsonb)::text) from pg_default_acl d where d.defaclrole=(select oid from pg_roles where rolname=current_user)")" || exit 1
  for name in extra_executor service_grant_option owner_revoke; do
    case "$name" in
      extra_executor) mutation='alter default privileges in schema public grant execute on functions to pg_monitor with grant option;';;
      service_grant_option) mutation='alter default privileges in schema public grant execute on functions to service_role with grant option;';;
      owner_revoke) mutation='do $probe$ begin execute format($sql$alter default privileges revoke execute on functions from %I$sql$,current_user);end $probe$;';;
    esac
    verify_booking_settings_owned_cluster || exit 1
    {
      printf '\\set ON_ERROR_STOP on\nbegin;\n%s\n' "$mutation"
      printf "\\ir '%s'\n" "$forward"
    } >"$cluster_root/booking-settings-forward-$name.sql"
    if bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc --file="$cluster_root/booking-settings-forward-$name.sql" >"$cluster_root/booking-settings-forward-$name.log" 2>&1; then
      printf 'Forward unexpectedly admitted %s default privileges.\n' "$name" >&2; exit 1
    fi
    rg -q booking_settings_atomic_create_authority_drift "$cluster_root/booking-settings-forward-$name.log" || { printf 'Unexpected forward failure for %s.\n' "$name" >&2; exit 1; }
    [[ "$(bs_forward_query "select to_regprocedure('$target') is null")" == t ]] || { printf 'Failed forward left primary RPC after %s.\n' "$name" >&2; exit 1; }
    current="$(bs_forward_query "select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.oid),'[]'::jsonb)::text) from pg_default_acl d where d.defaclrole=(select oid from pg_roles where rolname=current_user)")" || exit 1
    [[ "$current" == "$before" ]] || { printf 'Failed forward left altered default privileges for %s.\n' "$name" >&2; exit 1; }
    printf 'PASS forward %s default privileges refused; no RPC or default ACL mutation survived.\n' "$name"
  done
)
