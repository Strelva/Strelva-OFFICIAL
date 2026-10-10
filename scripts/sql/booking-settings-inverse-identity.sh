#!/usr/bin/env bash
# Root-owned prepared disposable cluster only. Starts no daemon. Each drift
# attempt is transactional; an inverse refusal rolls its mutation back.
run_booking_settings_inverse_identity() (
  set -euo pipefail
  umask 077
  source "$repo_root/scripts/sql/booking-owned-cluster.sh"
  verify_booking_settings_owned_cluster || exit 1
  local target='public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)'
  local forward="$repo_root/supabase/migrations/20261022182000_booking_settings_atomic_patch.sql"
  local inverse="$repo_root/supabase/migrations/rollback-20261022182000_booking_settings_atomic_patch.sql"
  bs_inverse_query() { bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "$1"; }
  local before mutation expected name current
  before="$(bs_inverse_query "select md5(to_jsonb(p)::text||pg_get_functiondef(p.oid)) from pg_proc p where p.oid=to_regprocedure('$target')")" || exit 1
  [[ -n "$before" ]] || { printf 'Expected primary RPC absent.\n' >&2; exit 1; }
  for name in body owner acl metadata missing; do
    expected='booking_settings_atomic_rollback_authority_drift'
    case "$name" in
      body) mutation='create or replace function public.write_tenant_booking_settings_fields(p_tenant_id text,p_kind text,p_settings jsonb,p_initial_config jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$begin return null;end$$;'; expected='booking_settings_atomic_rollback_source_drift';;
      owner) mutation="alter function $target owner to authenticated;";;
      acl) mutation="grant execute on function $target to authenticated;";;
      metadata) mutation="alter function $target stable;";;
      missing) mutation="drop function $target;"; expected='booking_settings_atomic_rollback_source_drift';;
    esac
    # The inverse BEGIN is nested in this open transaction. Its guard must
    # error before its COMMIT, so closing the failed connection rolls back drift.
    verify_booking_settings_owned_cluster || exit 1
    {
      printf '\\set ON_ERROR_STOP on\nbegin;\n%s\n' "$mutation"
      printf "\\ir '%s'\n" "$inverse"
    } >"$cluster_root/booking-settings-inverse-$name.sql"
    if bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc --file="$cluster_root/booking-settings-inverse-$name.sql" >"$cluster_root/booking-settings-inverse-$name.log" 2>&1; then
      printf 'Inverse unexpectedly admitted %s drift.\n' "$name" >&2; exit 1
    fi
    rg -q "$expected" "$cluster_root/booking-settings-inverse-$name.log" || { printf 'Unexpected inverse failure for %s.\n' "$name" >&2; exit 1; }
    current="$(bs_inverse_query "select md5(to_jsonb(p)::text||pg_get_functiondef(p.oid)) from pg_proc p where p.oid=to_regprocedure('$target')")" || exit 1
    [[ "$current" == "$before" ]] || { printf 'Inverse %s probe changed original catalog identity.\n' "$name" >&2; exit 1; }
    printf 'PASS inverse %s drift refused; original catalog identity retained.\n' "$name"
  done
)
