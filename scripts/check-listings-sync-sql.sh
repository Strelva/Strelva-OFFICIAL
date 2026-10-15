#!/usr/bin/env bash
# Listings in sync on disposable local Postgres: grants, queue, claim, fixes, numbered
# Releases, access and both rollbacks. No Auth, provider, mail or network.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-listings-sync strelva-ls-socket
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2; cat "$cluster_root/migration.log" >&2; exit 1
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/listings-sync-schema.sql" >/dev/null

# No stable function of this lane may reach a row lock (PostgREST runs those read-only).
readonly_log="$cluster_root/readonly.log"
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port" >"$readonly_log" 2>&1 || true
if grep -Eq 'listing_sync|read_listing_sync' "$readonly_log"; then cat "$readonly_log" >&2; printf 'A Listings function reaches a row lock\n' >&2; exit 1; fi

# Rollback refuses while Releases exist, then drops everything and the flag rolls back too.
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261028100300_listings_sync_store.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Rollback discarded recorded Releases\n' >&2; exit 1
fi
grep -q 'listing_sync_rollback_has_data' "$cluster_root/rollback-refusal.log"
psql "${psql_args[@]}" --command="set listing_sync.allow_drop = '1'" --file="$repo_root/supabase/migrations/rollback-20261028100300_listings_sync_store.sql" >/dev/null
if psql "${psql_args[@]}" --command="select 1 from public.listing_sync_checks" >/dev/null 2>&1; then printf 'Rollback left the checks behind\n' >&2; exit 1; fi
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261028100200_listings_sync_flag.sql" >/dev/null
psql "${psql_args[@]}" --command="select (select not ('listings_sync' = any(public.workspace_release_flag_names())))::int as gone" --tuples-only | grep -q '1'
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261028100200_listings_sync_flag.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261028100300_listings_sync_store.sql" >/dev/null
printf 'Listings in sync: grants, queue, claim, fixes, numbered Releases, access, due list and both rollbacks passed.\n'
