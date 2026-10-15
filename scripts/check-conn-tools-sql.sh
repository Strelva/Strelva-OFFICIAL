#!/usr/bin/env bash
# Disposable local authority, safe metadata and guarded inverse/reapply proof.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-conn-tools strelva-conn-tools-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
query() { psql "${psql_args[@]}" -Atc "$1"; }
apply() { psql "${psql_args[@]}" -f "$1" >/dev/null; }
forward="$repo_root/supabase/migrations/20261026120100_conn_tools_installer.sql"
inverse="$repo_root/supabase/migrations/rollback-20261026120100_conn_tools_installer.sql"
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$(basename "$migration")" > "$(basename "$forward")" || "$migration" == "$forward" ]] && continue
 apply "$migration"
done
fingerprint() { psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql"; }
fingerprint >"$cluster_root/before.catalog"
apply "$forward"
apply "$repo_root/tests/conn-tools-installer-schema.sql"
query "begin read only; set local role service_role; select public.read_connected_site_connection_metadata('bc120000-0000-4000-8000-000000000011'); rollback" >/dev/null
apply "$inverse"
fingerprint >"$cluster_root/inverse.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
apply "$forward"
apply "$repo_root/tests/conn-tools-installer-schema.sql"
query 'grant execute on function public.read_connected_site_installer(uuid,uuid,text) to anon' >/dev/null
if apply "$inverse" >"$cluster_root/acl-refusal.log" 2>&1; then echo 'Inverse erased later ACL.' >&2; exit 1; fi
rg -q conn_tools_installer_rollback_function_drift "$cluster_root/acl-refusal.log"
query 'revoke execute on function public.read_connected_site_installer(uuid,uuid,text) from anon' >/dev/null
query 'alter function public.read_connected_site_installer(uuid,uuid,text) stable' >/dev/null
if apply "$inverse" >"$cluster_root/function-refusal.log" 2>&1; then echo 'Inverse erased later function change.' >&2; exit 1; fi
rg -q conn_tools_installer_rollback_function_drift "$cluster_root/function-refusal.log"
query 'alter function public.read_connected_site_installer(uuid,uuid,text) volatile' >/dev/null
query 'create function public.conn_tools_later_caller() returns jsonb language sql as $$ select public.read_connected_site_connection_metadata(null) $$' >/dev/null
if apply "$inverse" >"$cluster_root/caller-refusal.log" 2>&1; then echo 'Inverse orphaned later caller.' >&2; exit 1; fi
rg -q conn_tools_installer_rollback_later_caller "$cluster_root/caller-refusal.log"
query 'drop function public.conn_tools_later_caller()' >/dev/null
apply "$inverse"
echo 'PASS: connected-site installer verified identity/roles/seat/staff/website authority, ambiguity and revocation refusals, atomic holder check, safe metadata ACLs, exact inverse/reapply and successor refusals.'
