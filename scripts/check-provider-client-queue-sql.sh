#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-provider-queue strelva-pq-socket
mkdir -p "$cluster_socket"
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done
# #257: service-only read-only agency projection, exact rollback/reapply.
psql "${psql_args[@]}" --file="$repo_root/tests/provider-client-queue-schema.sql"
psql "${psql_args[@]}" -Atc "select md5(pg_get_functiondef('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)'::regprocedure))" >"$cluster_root/provider-client-queue-forward.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021094000_provider_client_queue.sql"
psql "${psql_args[@]}" -Atc "select to_regprocedure('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)') is null" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021094000_provider_client_queue.sql"
diff -u "$cluster_root/provider-client-queue-forward.txt" <(psql "${psql_args[@]}" -Atc "select md5(pg_get_functiondef('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)'::regprocedure))")
psql "${psql_args[@]}" --file="$repo_root/tests/provider-client-queue-reapply-schema.sql"
printf 'Provider queue exact rollback/reapply passed.\n'
psql "${psql_args[@]}" --file="$repo_root/tests/provider-client-queue-race.sql"
if psql "${psql_args[@]}" -c "begin; alter function public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer) cost 101;" --file="$repo_root/supabase/migrations/rollback-20261021094000_provider_client_queue.sql" >"$cluster_root/provider-client-queue-rollback-refusal.log" 2>&1; then
  printf 'Provider queue rollback removed a changed successor.\n' >&2
  exit 1
fi
grep -q 'provider_client_queue_rollback_successor_conflict' "$cluster_root/provider-client-queue-rollback-refusal.log"
printf 'Provider queue rollback refused a changed successor.\n'
# Restore staffing after the race for the final retained-row checks.
psql "${psql_args[@]}" -c "select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',true)" >/dev/null
awk '/^commit;$/ { print "do $$ begin raise exception '\''provider_queue_injected_rollback_failure'\''; end $$;" } { print }' "$repo_root/supabase/migrations/rollback-20261021094000_provider_client_queue.sql" >"$cluster_root/injected-rollback.sql"
if psql "${psql_args[@]}" --file="$cluster_root/injected-rollback.sql" >"$cluster_root/injected-rollback.log" 2>&1; then exit 1; fi
grep -q provider_queue_injected_rollback_failure "$cluster_root/injected-rollback.log"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-client-queue-reapply-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021094000_provider_client_queue.sql" >/dev/null
awk '/^commit;$/ { print "do $$ begin raise exception '\''provider_queue_injected_forward_failure'\''; end $$;" } { print }' "$repo_root/supabase/migrations/20261021094000_provider_client_queue.sql" >"$cluster_root/injected-forward.sql"
if psql "${psql_args[@]}" --file="$cluster_root/injected-forward.sql" >"$cluster_root/injected-forward.log" 2>&1; then exit 1; fi
grep -q provider_queue_injected_forward_failure "$cluster_root/injected-forward.log"
psql "${psql_args[@]}" -Atc "select to_regprocedure('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)') is null and to_regclass('public.provider_client_queue_catalog_guard') is null" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021094000_provider_client_queue.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/provider-client-queue-reapply-schema.sql" >/dev/null
printf 'Provider queue forward/rollback injected failures are atomic, final reapply retains records.\n'
