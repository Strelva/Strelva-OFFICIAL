#!/usr/bin/env bash
# The complete agency job on a throwaway PostgreSQL cluster. No production
# connection, Supabase credentials, provider writes, or sent email.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql shasum; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
# This reviewed successor replaces the owner-link bodies. Its presence changes
# the recovery proof to a precise refusal, never permission to skip a rollback.
owner_runtime_successor="$repo_root/supabase/migrations/20261018131000_owner_decision_runtime_authority.sql"
owner_runtime_installed=false
if [[ -f "$owner_runtime_successor" ]]; then
  successor_digest="$(shasum -a 256 "$owner_runtime_successor")"
  [[ "${successor_digest%% *}" == "748efe03138425400405087f66972d481cbe2b77b1425bd974b5f9d90b11176a" ]] || {
    printf 'Owner runtime successor source digest differs; review the changed recovery proof.\n' >&2; exit 1;
  }
fi
create_temp_postgres strelva-agency-workflow strelva-agency-workflow-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
migration_count=0
owner_link_fingerprint_query="select target,md5(pg_get_functiondef(target::regprocedure)) from unnest(array['public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)','public.assert_owner_decision_link(uuid,uuid,uuid,text,text)','public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text)']) target order by target"
while IFS= read -r migration; do
  if [[ "$(basename "$migration")" == "20261015120000_owner_link_provider_identity.sql" ]]; then
    psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-before.hashes"
  fi
  if [[ "$(basename "$migration")" == "20261017120000_owner_decision_operator_refusal.sql" ]]; then
    psql "${psql_args[@]}" -Atc "select md5(pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure))" >"$cluster_root/owner-boundary-before.hash"
  fi
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2
    cat "$cluster_root/migration.log" >&2
    exit 1
  fi
  migration_count=$((migration_count + 1))
  if [[ "$migration" == "$owner_runtime_successor" ]]; then owner_runtime_installed=true; fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-after.hashes"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-workflow-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/website-owner-agency-publish-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/owner-link-provider-seat-schema.sql" >/dev/null
if [[ "$owner_runtime_installed" == true ]]; then
  # Match the installed successor's entire captured function scope, including
  # each final body. Claimant authority is outside this seven-function scope.
  successor_holds="$(psql "${psql_args[@]}" -Atc "select count(*)=7 and bool_and(after_hash is not null and after_hash=md5(pg_get_functiondef(signature::regprocedure))) and count(*) filter (where signature='public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)')=0 from release_rollback_baseline.owner_decision_runtime_authority")"
  [[ "$successor_holds" == t ]] || { printf 'Owner runtime successor scope/body drift.\n' >&2; exit 1; }
  function_catalog_query="select p.oid::regprocedure::text,p.oid,p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))::text,md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by p.oid::regprocedure::text"
  psql "${psql_args[@]}" -Atc "$function_catalog_query" >"$cluster_root/owner-link-successor-before.catalog"
  if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261015120000_owner_link_provider_identity.sql" >"$cluster_root/owner-link-refusal.log" 2>&1; then
    printf 'Legacy owner-link rollback overwrote its security successor.\n' >&2; exit 1;
  fi
  if ! grep -Fq 'rollback_wrong_order_or_function_drift: owner link provider identity' "$cluster_root/owner-link-refusal.log"; then
    cat "$cluster_root/owner-link-refusal.log" >&2; exit 1;
  fi
  psql "${psql_args[@]}" -Atc "$function_catalog_query" >"$cluster_root/owner-link-successor-after.catalog"
  cmp "$cluster_root/owner-link-successor-before.catalog" "$cluster_root/owner-link-successor-after.catalog"
  printf 'Legacy owner-link rollback refused its exact security successor; final function catalog unchanged.\n'
else
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261015120000_owner_link_provider_identity.sql" >/dev/null
  psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-rolled-back.hashes"
  cmp "$cluster_root/owner-link-before.hashes" "$cluster_root/owner-link-rolled-back.hashes"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261015120000_owner_link_provider_identity.sql" >/dev/null
  psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-reapplied.hashes"
  cmp "$cluster_root/owner-link-after.hashes" "$cluster_root/owner-link-reapplied.hashes"
fi
psql "${psql_args[@]}" --file="$repo_root/tests/operator-owner-decisions-schema.sql" >/dev/null
# The actor-RPC correction is additive to the earlier packet. Exercise native
# anonymous/authenticated denial and preserved service application/AI authority
# whenever that correction is in the ordered schema under test.
if [[ -f "$repo_root/supabase/migrations/20261019100000_actor_rpc_service_boundary.sql" ]]; then
  psql "${psql_args[@]}" --file="$repo_root/tests/actor-rpc-service-boundary-schema.sql" >/dev/null
fi
owner_boundary_query="select md5(pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure))"
psql "${psql_args[@]}" -Atc "$owner_boundary_query" >"$cluster_root/owner-boundary-after.hash"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261017120000_owner_decision_operator_refusal.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$owner_boundary_query" >"$cluster_root/owner-boundary-rollback.hash"
cmp "$cluster_root/owner-boundary-before.hash" "$cluster_root/owner-boundary-rollback.hash"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261017120000_owner_decision_operator_refusal.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$owner_boundary_query" >"$cluster_root/owner-boundary-reapplied.hash"
cmp "$cluster_root/owner-boundary-after.hash" "$cluster_root/owner-boundary-reapplied.hash"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-owner-decisions-schema.sql" >/dev/null
# The contract rolls back every fictional row, including the immutable history.
remaining="$(psql "${psql_args[@]}" -Atc "select count(*) from public.users where email like 'aw-%@%.example.test'")"
[[ "$remaining" == 0 ]] || { printf 'Agency workflow left fictional users behind.\n' >&2; exit 1; }
printf 'Agency workflow SQL passed on %s ordered migrations: add client, seat-only draft, owner claim/approval, guarded publish, readback receipt, isolation, revocation, stale revisions and replay.\n' "$migration_count"
