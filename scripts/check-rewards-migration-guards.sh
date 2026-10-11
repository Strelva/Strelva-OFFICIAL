#!/usr/bin/env bash
set -euo pipefail
# Prepared only: parent-qualified disposable current 1750 schema, empty receipts.
# Uses exact migration bytes to prove atomic default-ACL refusal and inverse drift.
[[ "${STRELVA_REWARDS_DISPOSABLE_PROOF:-}" == 1 ]] || exit 2
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proof_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/strelva-rewards-guards.XXXXXX")"
psql_args=("$@" --no-psqlrc --set=ON_ERROR_STOP=1)
forward="$repo_root/supabase/migrations/20261022175000_reward_durable_mutations.sql"
inverse="$repo_root/supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql"
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
[[ "$(query 'select count(*) from public.tenant_reward_mutations')" == 0 ]] || exit 2
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/baseline-catalog.log"
probe_inverse(){
 local label="$1" mutation="$2" reason="$3"
 if psql "${psql_args[@]}" >"$proof_dir/$label.log" 2>&1 <<SQL
begin;
$mutation
\i $inverse
SQL
 then printf 'Inverse admitted %s drift.\n' "$label" >&2;exit 1;fi
 rg -q "$reason" "$proof_dir/$label.log"
 # Failed inverse rolls back the injected drift and preserves every object.
 psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/$label-preserved.log"
}
probe_inverse body "alter function public.mutate_tenant_reward_record(text,text,jsonb) stable;" rewards_function_catalog_drift
probe_inverse grant-option "grant execute on function public.mutate_tenant_reward_record(text,text,jsonb) to service_role with grant option;" rewards_function_acl_drift
probe_inverse unknown-role "create role reward_acl_probe;grant execute on function public.reward_record_canonical_json(jsonb) to reward_acl_probe;" rewards_function_acl_drift
probe_inverse table-column "alter table public.tenant_reward_mutations add column unexplained text;" rewards_table_columns_drift
probe_inverse trigger "alter table public.tenant_client_records disable trigger reward_record_native_fence;" rewards_trigger_catalog_drift
# Remove only this empty exact schema through its reviewed inverse.
psql "${psql_args[@]}" -f "$inverse" >"$proof_dir/empty-inverse.log"
query 'create role reward_default_acl_probe;' >/dev/null
for kind in function table;do
 if [[ "$kind" == function ]];then
  grant_sql='grant execute on functions';revoke_sql='revoke execute on functions';reason=rewards_function_acl_drift
 else
  grant_sql='grant select on tables';revoke_sql='revoke select on tables';reason=rewards_table_acl_drift
 fi
 query "alter default privileges in schema public $grant_sql to reward_default_acl_probe;" >/dev/null
 if psql "${psql_args[@]}" -f "$forward" >"$proof_dir/default-$kind.log" 2>&1;then printf 'Forward admitted unknown %s default grant.\n' "$kind" >&2;exit 1;fi
 rg -q "$reason" "$proof_dir/default-$kind.log"
 [[ "$(query "select to_regclass('public.tenant_reward_mutations') is null and to_regprocedure('public.mutate_tenant_reward_record(text,text,jsonb)') is null and to_regprocedure('public.reward_record_native_fence()') is null and to_regprocedure('public.reward_record_canonical_json(jsonb)') is null and not exists(select 1 from pg_trigger where tgrelid='public.tenant_client_records'::regclass and tgname='reward_record_native_fence')")" == t ]]
 query "alter default privileges in schema public $revoke_sql from reward_default_acl_probe;" >/dev/null
done
query 'drop role reward_default_acl_probe;' >/dev/null
psql "${psql_args[@]}" -f "$forward" >"$proof_dir/reapply.log"
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/reapply-catalog.log"
printf 'GREEN exact inverse drift/default grants/atomic refusal/reapply. Evidence: %s\n' "$proof_dir"
