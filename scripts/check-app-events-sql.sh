#!/usr/bin/env bash
# Events Apps receive on disposable local Postgres: capture switch, source triggers,
# cursors, dead letters, replays, Webhook endpoints, the agent read, and both rollbacks.
# No Auth, provider, mail or network.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-app-events strelva-ae-socket
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
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/app-events-schema.sql" >/dev/null

# No stable function of this lane may reach a row lock (PostgREST runs those read-only).
# Findings in other lanes' functions are theirs; they are printed, not ours to fail on.
readonly_log="$cluster_root/readonly.log"
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port" >"$readonly_log" 2>&1 || true
if grep -Eq 'app_event|agent_read_app_events' "$readonly_log"; then cat "$readonly_log" >&2; printf 'An Events function reaches a row lock\n' >&2; exit 1; fi

# The inverses: sources first, then the outbox, which refuses while rows exist.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261028100100_app_event_sources.sql" >/dev/null
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261028100000_app_events.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Rollback discarded recorded events\n' >&2; exit 1
fi
grep -q 'app_events_rollback_has_data' "$cluster_root/rollback-refusal.log"
psql "${psql_args[@]}" --command="set app_events.allow_drop = '1'" --file="$repo_root/supabase/migrations/rollback-20261028100000_app_events.sql" >/dev/null
if psql "${psql_args[@]}" --command="select 1 from public.app_events" >/dev/null 2>&1; then printf 'Rollback left the outbox behind\n' >&2; exit 1; fi
psql "${psql_args[@]}" --command="select (select not ('app_events' = any(public.workspace_release_flag_names())))::int as gone" --tuples-only | grep -q '1'
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261028100000_app_events.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261028100100_app_event_sources.sql" >/dev/null
printf 'Events: grants, capture switch, 13 source triggers, ordering, delivery lifecycle, replays, scope, Webhooks, agent read, purge and both rollbacks passed.\n'
