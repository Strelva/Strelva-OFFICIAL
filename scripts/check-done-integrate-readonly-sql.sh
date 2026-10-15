#!/usr/bin/env bash
# Additive reader successor and exact guarded inverse on an owned local PG18 cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-done-readonly strelva-done-readonly-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
query() { psql "${psql_args[@]}" -Atc "$1"; }
forward="$repo_root/supabase/migrations/20261025170000_done_integrate_readonly_authorization.sql"
inverse="$repo_root/supabase/migrations/rollback-20261025170000_done_integrate_readonly_authorization.sql"
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$migration" == "$forward" ]] && continue
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
fingerprint() { psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql"; }
writer_catalog="select p.oid::regprocedure,md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,'')) from pg_proc p where p.oid=any(array['public.agency_directory_assert_manager(uuid,uuid,text)'::regprocedure,'public.inquiry_forwarding_actor(uuid,uuid,text,boolean)'::regprocedure,'public.service_request_assert_agency_client(uuid,uuid,uuid,boolean,text)'::regprocedure]) order by 1"
fingerprint >"$cluster_root/before.catalog"
query "$writer_catalog" >"$cluster_root/writers.before"
psql "${psql_args[@]}" -f "$forward" >/dev/null
query "$writer_catalog" >"$cluster_root/writers.after"
cmp "$cluster_root/writers.before" "$cluster_root/writers.after"
psql "${psql_args[@]}" -f "$inverse" >/dev/null
fingerprint >"$cluster_root/inverse.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/done-integrate-readonly-authorization-schema.sql" >/dev/null
# Reader ACL drift and private helper drift must both stop inverse.
query 'grant execute on function public.read_agency_proposals(uuid,text,uuid) to anon' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/acl-refusal.log" 2>&1; then echo 'Inverse erased later ACL.' >&2; exit 1; fi
rg -q done_integrate_readonly_rollback_later_reader_or_helper "$cluster_root/acl-refusal.log"
query 'revoke execute on function public.read_agency_proposals(uuid,text,uuid) from anon' >/dev/null
query 'alter function public.agency_directory_assert_manager_readonly(uuid,uuid,text) volatile' >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/helper-refusal.log" 2>&1; then echo 'Inverse erased later helper.' >&2; exit 1; fi
rg -q done_integrate_readonly_rollback_later_reader_or_helper "$cluster_root/helper-refusal.log"
query 'alter function public.agency_directory_assert_manager_readonly(uuid,uuid,text) stable' >/dev/null
query "create function public.done_readonly_fixture_later_caller() returns void language plpgsql as \$\$ begin perform public.agency_directory_assert_manager_readonly(null,null,null);end \$\$" >/dev/null
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/caller-refusal.log" 2>&1; then echo 'Inverse orphaned later caller.' >&2; exit 1; fi
rg -q done_integrate_readonly_rollback_later_caller "$cluster_root/caller-refusal.log"
query 'drop function public.done_readonly_fixture_later_caller()' >/dev/null
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
echo 'PASS: READ ONLY proposal, forwarding and agency-name reads; identity/role/staffing denials; unchanged writer locks; exact inverse/reapply; later ACL/helper/caller refusal.'
