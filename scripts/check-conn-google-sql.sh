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
 [[ "$(basename "$migration")" < "$(basename "$forward")" ]] || break
 [[ "$(basename "$migration")" == 20261005090000_tenant_leads.sql ]] && continue
 if [[ "$(basename "$migration")" == 20261001120000_website_documents.sql ]]; then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null; fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
fingerprint() { psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql"; }
fingerprint >"$cluster_root/before.catalog"
psql "${psql_args[@]}" -f "$forward"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth.sql"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth-populated.sql"
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then echo 'Inverse discarded retained OAuth evidence' >&2; exit 1; fi
rg -q conn_google_populated_rollback_refused "$cluster_root/populated-refusal.log"
psql "${psql_args[@]}" -c "delete from public.conn_google_agency_oauth_attempts where id='ec110000-0000-4000-8000-000000000093'"
psql "${psql_args[@]}" -f "$inverse"
fingerprint >"$cluster_root/inverse.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
psql "${psql_args[@]}" -f "$forward"
psql "${psql_args[@]}" -f "$repo_root/tests/conn-google-agency-oauth.sql"
psql "${psql_args[@]}" -c 'grant execute on function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb) to anon' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/acl-refusal.log" 2>&1; then echo 'Inverse erased later ACL.' >&2; exit 1; fi
rg -q conn_google_rollback_function_drift "$cluster_root/acl-refusal.log"
psql "${psql_args[@]}" -c 'revoke execute on function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb) from anon' >/dev/null
psql "${psql_args[@]}" -c 'create function public.conn_google_later_caller() returns jsonb language plpgsql as $$ begin return public.conn_google_agency_oauth(null,null,null,null,null,null); end $$' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/caller-refusal.log" 2>&1; then echo 'Inverse orphaned later caller.' >&2; exit 1; fi
rg -q conn_google_rollback_later_caller "$cluster_root/caller-refusal.log"
psql "${psql_args[@]}" -c 'drop function public.conn_google_later_caller()' >/dev/null
psql "${psql_args[@]}" -f "$inverse"
echo 'PASS: ordered Google agency OAuth schema, client ACL refusal, populated refusal, exact empty inverse/reapply and later ACL/caller refusal (local only).'
