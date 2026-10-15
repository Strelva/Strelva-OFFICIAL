#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-ai-controls strelva-aic-socket
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 psql "${psql_args[@]}" --file="$migration" >/dev/null
done
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/ai-controls-schema.sql"
# The inverse refuses while a control or a list-price hold is live, and is exact when empty.
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261026170000_ai_controls.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
 printf 'Rollback discarded an active control\n' >&2; exit 1
fi
grep -q 'ai_controls_rollback_has_active_controls' "$cluster_root/rollback-refusal.log"
psql "${psql_args[@]}" --command="delete from public.business_ai_controls; delete from public.business_ai_budget_reservations where ceiling_source = 'list_price'" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261026170000_ai_controls.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261026170000_ai_controls.sql" >/dev/null
printf 'Ordered schema, scope, admission, revision, history, grants and rollback guard passed.\n'
