#!/usr/bin/env bash
# #308: actual ordered migrations, public claims, privacy and exact rollback.
# Throwaway local Postgres only, no credentials or provider calls.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-public-verification strelva-verification-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2
    cat "$cluster_root/migration.log" >&2; exit 1
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/public-business-verification-schema.sql" >/dev/null
# The additive function must be the only catalog change across undo/reapply.
catalog="select p.oid::regprocedure::text,p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))::text,md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.oid<>'public.read_public_business_verification(text,text)'::regprocedure order by p.oid::regprocedure::text"
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/before.catalog"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261018132000_public_business_verification.sql" >/dev/null
psql "${psql_args[@]}" -Atc "select to_regprocedure('public.read_public_business_verification(text,text)') is null" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261018132000_public_business_verification.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$catalog" >"$cluster_root/after.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/after.catalog"
psql "${psql_args[@]}" --file="$repo_root/tests/public-business-verification-schema.sql" >/dev/null
printf 'Public verification: ordered migrations, confirmation/privacy/revocation, READ ONLY and exact rollback/reapply passed.\n'
