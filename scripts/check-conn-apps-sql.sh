#!/usr/bin/env bash
# Coordinator-only: disposable ordinary publication, retained legacy bytes,
# exact inverse/reapply, ACL/caller refusal and populated inverse refusal.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-conn-apps strelva-conn-apps-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
apply() { psql "${psql_args[@]}" -f "$1" >/dev/null; }
query() { psql "${psql_args[@]}" -Atc "$1"; }
forward="$repo_root/supabase/migrations/20261026130000_conn_apps_declarations.sql"
inverse="$repo_root/supabase/migrations/rollback-20261026130000_conn_apps_declarations.sql"
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$migration" == "$forward" ]] && continue
 # Retained historical ordering: tenant_leads precedes website_documents.
 [[ "$(basename "$migration")" == 20261005090000_tenant_leads.sql ]] && continue
 if [[ "$(basename "$migration")" == 20261001120000_website_documents.sql ]]; then apply "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql"; fi
 apply "$migration"
done
apply "$repo_root/tests/conn-apps-declarations-before.sql"
query "select md5(row_to_json(r)::text) from public.system_version_source_revisions r order by id" >"$cluster_root/revisions.before"
psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/before.catalog"
apply "$forward"
query "select md5(row_to_json(r)::text) from public.system_version_source_revisions r order by id" >"$cluster_root/revisions.after"
cmp "$cluster_root/revisions.before" "$cluster_root/revisions.after"
apply "$repo_root/tests/conn-apps-declarations-schema.sql"
apply "$inverse"
psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/inverse.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
apply "$forward"
query 'grant execute on function public.system_package_behavior(jsonb,text[]) to anon' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/acl-refusal.log" 2>&1; then echo 'Inverse erased later ACL.' >&2; exit 1; fi
rg -q conn_apps_rollback_later_function_or_acl "$cluster_root/acl-refusal.log"
query 'revoke execute on function public.system_package_behavior(jsonb,text[]) from anon' >/dev/null
query 'create function public.conn_apps_later_caller() returns void language plpgsql as $$ begin perform public.system_package_behavior_before_conn_apps(null,null);end $$' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/caller-refusal.log" 2>&1; then echo 'Inverse orphaned a later caller.' >&2; exit 1; fi
rg -q conn_apps_rollback_later_caller "$cluster_root/caller-refusal.log"
query 'drop function public.conn_apps_later_caller()' >/dev/null
apply "$repo_root/tests/conn-apps-declarations-populated.sql"
query "select md5(row_to_json(r)::text) from public.system_version_source_revisions r order by id" >"$cluster_root/populated.before"
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then echo 'Inverse removed a retained validator.' >&2; exit 1; fi
rg -q conn_apps_rollback_explicit_declarations_retained "$cluster_root/populated-refusal.log"
query "select md5(row_to_json(r)::text) from public.system_version_source_revisions r order by id" >"$cluster_root/populated.after"
cmp "$cluster_root/populated.before" "$cluster_root/populated.after"
echo 'PASS: actual SQL declaration qualification, unchanged legacy bytes, private helpers, exact inverse/reapply, later ACL/caller refusal and populated refusal.'
