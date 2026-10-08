#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-audit-append strelva-audit-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# Include actual Supabase defaults for service_role. The shared shim currently
# omits them; omitting them here would make an ACL repair falsely pass.
psql "${psql_args[@]}" -c 'alter default privileges in schema public grant all on tables to service_role;' >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done
psql "${psql_args[@]}" --file="$repo_root/tests/audit-service-role-append-only-schema.sql"
repair="$repo_root/supabase/migrations/20261020111000_audit_service_role_append_only.sql"
psql "${psql_args[@]}" -c 'grant update(action) on public.audit_logs to service_role;' >/dev/null
psql "${psql_args[@]}" --file="$repair" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/audit-service-role-append-only-schema.sql"

# Real inherited privileges cannot be fixed by revoking the child's direct ACL.
# Refuse atomically, preserving the pre-attempt catalog rather than half-applying.
psql "${psql_args[@]}" -c 'create role audit528_parent nologin; grant update on public.audit_logs to audit528_parent; grant audit528_parent to service_role;' >/dev/null
audit_acl="select coalesce(relacl::text,'') from pg_class where oid='public.audit_logs'::regclass"
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/inherited-refusal.log" 2>&1; then
  printf 'Inherited audit mutation grant was accepted.\n' >&2; exit 1
fi
grep -q 'audit_service_role_inherited_mutation_privilege' "$cluster_root/inherited-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" -c 'revoke audit528_parent from service_role; revoke update on public.audit_logs from audit528_parent; drop role audit528_parent;' >/dev/null

psql "${psql_args[@]}" -c 'grant select(action) on public.audit_logs to authenticated;' >/dev/null
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/browser-refusal.log" 2>&1; then
  printf 'Browser audit column access drift was accepted.\n' >&2; exit 1
fi
grep -q 'audit_browser_privilege_drift' "$cluster_root/browser-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" -c 'revoke select(action) on public.audit_logs from authenticated;' >/dev/null

# Table ownership confers immutable implicit rights. Refuse that unexpected
# target rather than report success after revoking only its explicit ACL.
psql "${psql_args[@]}" -c 'alter table public.audit_logs owner to service_role;' >/dev/null
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/owner-refusal.log" 2>&1; then
  printf 'Service-owned audit table was accepted.\n' >&2; exit 1
fi
grep -q 'audit_service_role_inherited_mutation_privilege' "$cluster_root/owner-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" --set=fixture_owner="$(id -un)" <<'SQL'
alter table public.audit_logs owner to :"fixture_owner";
SQL
psql "${psql_args[@]}" --file="$repair" >/dev/null
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020111000_audit_service_role_append_only.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Audit tampering rollback was accepted.\n' >&2; exit 1
fi
grep -q 'audit_append_only_security_rollback_refused' "$cluster_root/rollback-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" --file="$repair" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/audit-service-role-append-only-schema.sql"
printf 'Audit append-only: column repair, inherited/browser/owner atomic refusals and forward-only recovery passed.\n'
