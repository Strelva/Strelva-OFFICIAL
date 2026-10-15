#!/usr/bin/env bash
# Disposable ordered schema proof. Never reads repository env or connects remotely.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-conn-google strelva-conn-google-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
forward="$repo_root/supabase/migrations/20261026110000_conn_google_agency_oauth.sql"
inverse="$repo_root/supabase/migrations/rollback-20261026110000_conn_google_agency_oauth.sql"
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$(basename "$migration")" > "$(basename "$forward")" || "$migration" == "$forward" ]] && continue
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
psql "${psql_args[@]}" -f "$forward"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth.sql"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth-populated.sql"
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then echo 'Inverse discarded retained OAuth evidence' >&2; exit 1; fi
rg -q conn_google_populated_rollback_refused "$cluster_root/populated-refusal.log"
psql "${psql_args[@]}" -c "delete from public.conn_google_agency_oauth_attempts where id='ec110000-0000-4000-8000-000000000093'"
psql "${psql_args[@]}" -f "$inverse"
psql "${psql_args[@]}" -f "$forward"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth.sql"
echo 'PASS: ordered Google agency OAuth schema, client ACL refusal, populated refusal, empty inverse and reapply (local only).'
