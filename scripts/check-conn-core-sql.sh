#!/usr/bin/env bash
# Coordinator-only execution: disposable full ordered SQL, inverse/reapply and refusal.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-conn-core strelva-conn-core-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff rg; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
migration_name="20261026100000_conn_core_holders.sql"
forward="$repo_root/supabase/migrations/$migration_name"
inverse="$repo_root/supabase/migrations/rollback-$migration_name"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
query() { psql "${psql_args[@]}" -Atc "$1"; }
apply() { psql "${psql_args[@]}" --file="$1" >/dev/null; }
fingerprint() { psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql"; }
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
for earlier in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$(basename "$earlier")" < "$migration_name" ]] || break
 [[ "$(basename "$earlier")" == 20261005090000_tenant_leads.sql ]] && continue
 if [[ "$(basename "$earlier")" == 20261001120000_website_documents.sql ]]; then apply "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql"; fi
 apply "$earlier"
done
fingerprint >"$cluster_root/before.catalog"
apply "$forward"
apply "$repo_root/tests/conn-core-schema.sql"
apply "$inverse"
fingerprint >"$cluster_root/inverse.catalog"
diff -u "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
apply "$forward"
apply "$repo_root/tests/conn-core-schema.sql"
# Later ACL or callers refuse inverse without dropping earlier metadata or helpers.
query 'grant execute on function public.read_connection_holders(uuid) to anon' >/dev/null
if apply "$inverse" >"$cluster_root/acl-refusal.log" 2>&1; then printf 'Inverse erased ACL drift.\n' >&2; exit 1; fi
rg -q conn_core_rollback_successor "$cluster_root/acl-refusal.log"
query 'revoke execute on function public.read_connection_holders(uuid) from anon' >/dev/null
query 'create function public.conn_core_later_caller() returns jsonb language sql as '\''select public.read_connection_holders(null::uuid)'\''' >/dev/null
if apply "$inverse" >"$cluster_root/caller-refusal.log" 2>&1; then printf 'Inverse erased later caller.\n' >&2; exit 1; fi
rg -q conn_core_rollback_later_caller "$cluster_root/caller-refusal.log"
query 'drop function public.conn_core_later_caller()' >/dev/null
# Commit a fictional holder, prove READ ONLY actor access, then refuse destructive inverse.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id,email,verified_at) values ('c2000000-0000-4000-8000-000000000001','conn-rollback@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('c2000000-0000-4000-8000-000000000010','customer','Harbor Dental','c2000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('c2000000-0000-4000-8000-000000000010','c2000000-0000-4000-8000-000000000001','owner','c2000000-0000-4000-8000-000000000001');
select public.record_connection_holder('c2000000-0000-4000-8000-000000000010','c2000000-0000-4000-8000-000000000001','conn-rollback@example.test','resend:c2000000-0000-4000-8000-000000000010','resend','{"kind":"platform"}','{"kind":"platform"}','c2000000-0000-4000-8000-000000000020',repeat('a',64));
begin read only;
select public.read_connection_actor_scope('c2000000-0000-4000-8000-000000000010','c2000000-0000-4000-8000-000000000001','conn-rollback@example.test');
select public.read_system_version_connection_owner('c2000000-0000-4000-8000-000000000001','conn-rollback@example.test','resend:c2000000-0000-4000-8000-000000000010');
commit;
SQL
if apply "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then printf 'Inverse discarded a holder.\n' >&2; exit 1; fi
rg -q conn_core_rollback_retained_holders "$cluster_root/populated-refusal.log"
[[ "$(query 'select count(*) from public.connection_holders')" == 1 ]]
printf 'PASS: Connections core ordered SQL, holder replay/conflict, scope/area/seat denial, binding owner isolation, private ACL/RLS, READ ONLY readers, exact inverse/reapply and retained-holder/successor refusals.\n'
