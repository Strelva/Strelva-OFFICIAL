# Caller owns a safely allocated local cluster, repo_root and psql_args.
lifetime_system_kind_fingerprint() {
  psql "${psql_args[@]}" -At <<'SQL'
select p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text,'')
from pg_proc p where p.oid in (
 'public.update_business_system(uuid,uuid,text,uuid,bigint,jsonb)'::regprocedure,
 'public.system_identity_guard()'::regprocedure,
 'public.system_actor_scope(uuid,uuid,text,boolean)'::regprocedure,
 'public.system_load(uuid,uuid,boolean,uuid[])'::regprocedure)
order by p.oid::regprocedure::text;
SQL
}

check_lifetime_system_kind() {
  local kind_forward="$repo_root/supabase/migrations/20261022183000_lifetime_system_kind.sql"
  local kind_inverse="$repo_root/supabase/migrations/rollback-20261022183000_lifetime_system_kind.sql"
  if [[ "$(psql "${psql_args[@]}" -Atc "select to_regprocedure('public.system_kind_guard()') is not null")" != t ]]; then
    lifetime_system_kind_fingerprint >"$cluster_root/kind-predecessor.txt"
    psql "${psql_args[@]}" --file="$kind_forward"
  fi
  lifetime_system_kind_fingerprint >"$cluster_root/kind-forward.txt"
  # Only the bounded update command changes; current authority/identity remain exact.
  diff -u <(rg -v '^update_business_system' "$cluster_root/kind-predecessor.txt") \
    <(rg -v '^update_business_system' "$cluster_root/kind-forward.txt")
  psql "${psql_args[@]}" --file="$repo_root/tests/lifetime-system-kind-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/scripts/sql/lifetime-system-kind-preflight.sql"

  # Exact empty-schema inverse/reapply uses a schema-only clone; no row is deleted.
  pg_dump --host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" \
    --dbname=postgres --schema-only --file="$cluster_root/kind-schema.sql"
  psql "${psql_args[@]}" -c 'create database lifetime_kind_empty template template0' >/dev/null
  local -a kind_original_args=("${psql_args[@]}")
  psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)"
    --dbname=lifetime_kind_empty --set=ON_ERROR_STOP=1 --no-psqlrc)
  psql "${psql_args[@]}" --file="$cluster_root/kind-schema.sql" >/dev/null
  psql "${psql_args[@]}" --file="$kind_inverse" >/dev/null
  lifetime_system_kind_fingerprint >"$cluster_root/kind-reversed.txt"
  diff -u "$cluster_root/kind-predecessor.txt" "$cluster_root/kind-reversed.txt"
  psql "${psql_args[@]}" --file="$kind_forward" >/dev/null
  lifetime_system_kind_fingerprint >"$cluster_root/kind-reapplied.txt"
  diff -u "$cluster_root/kind-forward.txt" "$cluster_root/kind-reapplied.txt"
  # Commit only this fictional populated fixture, then execute the actual inverse.
  psql "${psql_args[@]}" --file="$repo_root/tests/lifetime-system-kind-rollback-schema.sql" >/dev/null
  if psql "${psql_args[@]}" --file="$kind_inverse" >"$cluster_root/kind-rollback-refusal.log" 2>&1; then
    printf 'Lifetime-kind inverse reopened mutation beneath retained Systems.\n' >&2; return 1
  fi
  rg -q 'system_kind_rollback_requires_data_preservation' "$cluster_root/kind-rollback-refusal.log"
  lifetime_system_kind_fingerprint >"$cluster_root/kind-retained.txt"
  diff -u "$cluster_root/kind-forward.txt" "$cluster_root/kind-retained.txt"
  psql "${psql_args[@]}" -Atc "select count(*)=1 and bool_and(kind='proposal' and change_number=1) from public.systems" | rg -qx t
  psql_args=("${kind_original_args[@]}")
  psql "${psql_args[@]}" -c 'drop database lifetime_kind_empty' >/dev/null
  local kind_fixture native_failures=0
  for kind_fixture in scripts/sql/private-definition-versions-contract.sql tests/lifetime-system-kind-native-schema.sql tests/offering-source-versions-schema.sql; do
    printf 'Lifetime-kind native writer contract: %s\n' "$kind_fixture"
    if ! psql "${psql_args[@]}" --file="$repo_root/$kind_fixture"; then native_failures=$((native_failures + 1)); fi
  done
  [[ "$native_failures" == 0 ]] || { printf 'Lifetime-kind native fixture failures: %s\n' "$native_failures" >&2; return 1; }
  printf 'Lifetime-kind guard, legacy no-op, permitted updates, authority, history, preflight and inverse/reapply passed.\n'
}
