#!/usr/bin/env bash
# The complete agency job on a throwaway PostgreSQL cluster. No production
# connection, Supabase credentials, provider writes, or sent email.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
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
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2
    cat "$cluster_root/migration.log" >&2
    exit 1
  fi
  migration_count=$((migration_count + 1))
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-after.hashes"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-workflow-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/website-owner-agency-publish-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/owner-link-provider-seat-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261015120000_owner_link_provider_identity.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-rolled-back.hashes"
cmp "$cluster_root/owner-link-before.hashes" "$cluster_root/owner-link-rolled-back.hashes"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261015120000_owner_link_provider_identity.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$owner_link_fingerprint_query" >"$cluster_root/owner-link-reapplied.hashes"
cmp "$cluster_root/owner-link-after.hashes" "$cluster_root/owner-link-reapplied.hashes"
# The contract rolls back every fictional row, including the immutable history.
remaining="$(psql "${psql_args[@]}" -Atc "select count(*) from public.users where email like 'aw-%@%.example.test'")"
[[ "$remaining" == 0 ]] || { printf 'Agency workflow left fictional users behind.\n' >&2; exit 1; }
printf 'Agency workflow SQL passed on %s ordered migrations: add client, seat-only draft, owner claim/approval, guarded publish, readback receipt, isolation, revocation, stale revisions and replay.\n' "$migration_count"
