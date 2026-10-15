#!/usr/bin/env bash
# Sites by code on disposable local Postgres: a coding agent lists and reports
# website Requests, the owner decides in Needs you. No Auth, provider, mail or deploy.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-sites-by-code strelva-sites-by-code-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2; cat "$cluster_root/migration.log" >&2; exit 1
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/sites-by-code-schema.sql"
# The rollback must restore the previous bodies and leave nothing behind.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261027120200_site_change_agent_tools.sql"
psql "${psql_args[@]}" --command="select 1/(case when to_regprocedure('public.agent_record_website_change(text,text,uuid,uuid,text,jsonb)') is null and to_regclass('sites_by_code_rollback.functions') is null and not exists(select 1 from information_schema.columns where table_name='website_change_receipts' and column_name='reported_by_connection') then 1 else 0 end)" >/dev/null
printf 'Sites by code (agent list, preview, owner decision, deploy, rollback) passed on local Postgres. No email, Auth, provider or deploy.\n'
