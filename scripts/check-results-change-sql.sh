#!/usr/bin/env bash
# Results' "The change that mattered" from a real What changed row: apply every
# migration to a throwaway cluster, decide one owner decision, read it back
# with read_strelva_handled (the RPC the Results page reads through), then
# render Results from those rows in Vitest. Never touches production.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
export LC_ALL=en_US.UTF-8
create_temp_postgres strelva-results-change strelva-results-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# The same order check-owner-decision-effects-sql.sh uses: tenant leads before website documents.
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  name="$(basename "$migration")"
  [[ "$name" == '20261005090000_tenant_leads.sql' ]] && continue
  [[ "$name" == '20261001120000_website_documents.sql' ]] && psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done
handled="$cluster_root/handled.json"; empty="$cluster_root/handled-empty.json"
psql "${psql_args[@]}" --set=handled_out="$handled" --set=empty_out="$empty" --file="$repo_root/tests/results-change-handled.sql" >/dev/null
printf 'What changed rows read from Postgres.\n'
cd "$repo_root"
STRELVA_RESULTS_HANDLED_JSON="$handled" STRELVA_RESULTS_HANDLED_EMPTY_JSON="$empty" pnpm -s vitest run src/__tests__/results-change-sql.test.tsx
printf 'Results renders the change that mattered from a real What changed row, and the quiet case.\n'
