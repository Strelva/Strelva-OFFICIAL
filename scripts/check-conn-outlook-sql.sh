#!/usr/bin/env bash
# Coordinator-only execution: disposable full ordered SQL, inverse/reapply and populated refusal.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-conn-outlook strelva-conn-outlook-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql diff rg; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
migration_name="20261026150000_conn_outlook_calendar.sql"
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
apply "$repo_root/tests/conn-outlook-calendar.sql"
apply "$inverse"
fingerprint >"$cluster_root/inverse.catalog"
diff -u "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
apply "$forward"
apply "$repo_root/tests/conn-outlook-calendar.sql"
# A later function change refuses the inverse without replaying an older body over it.
query 'grant execute on function public.connection_provider_area(text) to anon' >/dev/null
if apply "$inverse" >"$cluster_root/drift-refusal.log" 2>&1; then printf 'Inverse erased function or ACL drift.\n' >&2; exit 1; fi
rg -q conn_outlook_rollback_function_drift "$cluster_root/drift-refusal.log"
query 'revoke execute on function public.connection_provider_area(text) from anon' >/dev/null
# Commit a fictional Outlook holder, then refuse the destructive inverse.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id,email,verified_at) values ('c4000000-0000-4000-8000-000000000001','outlook-rollback@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('c4000000-0000-4000-8000-000000000010','customer','Harbor Dental','c4000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('c4000000-0000-4000-8000-000000000010','c4000000-0000-4000-8000-000000000001','owner','c4000000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_connections(id,workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values ('c4000000-0000-4000-8000-000000000042','c4000000-0000-4000-8000-000000000010','outlook','harbor','Harbor','America/New_York','connected','c4000000-0000-4000-8000-000000000001');
select public.record_connection_holder('c4000000-0000-4000-8000-000000000010','c4000000-0000-4000-8000-000000000001','outlook-rollback@example.test','outlook_calendar:c4000000-0000-4000-8000-000000000042','outlook_calendar','{"kind":"business","workspaceId":"c4000000-0000-4000-8000-000000000010"}','{"kind":"platform"}','c4000000-0000-4000-8000-000000000020',repeat('a',64));
SQL
if apply "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then printf 'Inverse discarded an Outlook holder.\n' >&2; exit 1; fi
rg -q conn_outlook_rollback_populated "$cluster_root/populated-refusal.log"
[[ "$(query "select count(*) from public.connection_holders where provider='outlook_calendar'")" == 1 ]]
printf 'PASS: Outlook calendar ordered SQL, holder recording and refusal, source resolution, private ACLs, exact inverse/reapply, function-drift and populated refusals.\n'
