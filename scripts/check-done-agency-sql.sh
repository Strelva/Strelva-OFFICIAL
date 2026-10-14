#!/usr/bin/env bash
# Complete-agency contracts on disposable local Postgres only. No providers/Auth/mail.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-done-agency strelva-done-agency-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$migration" >&2; cat "$cluster_root/migration.log" >&2; exit 1
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
for fixture in done-agency-signup-systems-schema.sql done-agency-client-systems-schema.sql done-agency-claim-email-schema.sql done-agency-website-decisions-schema.sql agency-qualification-independent-review-schema.sql; do
  psql "${psql_args[@]}" --file="$repo_root/tests/$fixture"
done
# Every fixture rolls back. Empty inverse/reapply does not prove populated recovery.
while IFS= read -r forward; do
  psql "${psql_args[@]}" --file="$(dirname "$forward")/rollback-$(basename "$forward")"
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '2026102513*.sql' | sort -r)
while IFS= read -r forward; do psql "${psql_args[@]}" --file="$forward"; done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '2026102513*.sql' | sort)
printf 'Agency contracts and empty inverse/reapply passed locally. Populated recovery, Auth, browser and hosted delivery remain separate.\n'
