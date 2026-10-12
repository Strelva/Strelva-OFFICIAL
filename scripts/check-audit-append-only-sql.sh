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
audit_acl="select jsonb_build_object('table',relacl::text,'columns',
  (select jsonb_agg(jsonb_build_array(attname,attacl::text) order by attnum)
   from pg_attribute where attrelid=pg_class.oid and attnum>0 and not attisdropped))
  from pg_class where oid='public.audit_logs'::regclass"
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/inherited-refusal.log" 2>&1; then
  printf 'Inherited audit mutation grant was accepted.\n' >&2; exit 1
fi
grep -q 'audit_service_role_inherited_mutation_privilege' "$cluster_root/inherited-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" -c 'revoke audit528_parent from service_role; revoke update on public.audit_logs from audit528_parent; drop role audit528_parent;' >/dev/null

# NOINHERIT hides both SET ROLE and ADMIN-option paths from effective-ACL
# checks. Include a transitive membership; MEMBER must inspect the whole graph.
psql "${psql_args[@]}" <<'SQL' >/dev/null
create role audit528_mutator nologin;
create role audit528_bridge nologin;
grant update(action) on public.audit_logs to audit528_mutator;
grant audit528_mutator to audit528_bridge with inherit false, set true;
grant audit528_bridge to service_role with inherit false, set true;
-- Prove the original effective-privilege guard misses this path.
do $$ begin
  if has_any_column_privilege('service_role','public.audit_logs','UPDATE')
    or not pg_has_role('service_role','audit528_mutator','SET') then
    raise exception 'invalid NOINHERIT SET fixture';
  end if;
end $$;
set session authorization service_role;
set role audit528_mutator;
do $$ begin
  if not has_column_privilege(current_user,'public.audit_logs','action','UPDATE') then
    raise exception 'SET ROLE did not activate the fixture mutation privilege';
  end if;
end $$;
reset role;
reset session authorization;
SQL
expect_role_refusal() {
  local reason="$1" label="$2" before
  before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
  if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/$label-refusal.log" 2>&1; then
    printf '%s audit authority drift was accepted.\n' "$label" >&2; exit 1
  fi
  grep -q "$reason" "$cluster_root/$label-refusal.log"
  [[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
}
expect_role_refusal audit_service_role_inherited_mutation_privilege noninherited-set
psql "${psql_args[@]}" <<'SQL' >/dev/null
revoke audit528_bridge from service_role;
revoke audit528_mutator from audit528_bridge;
drop role audit528_bridge;
grant audit528_mutator to service_role with inherit false, set false, admin true;
-- Role ADMIN can reactivate the grant even with SET disabled.
set session authorization service_role;
grant audit528_mutator to service_role with inherit true;
do $$ begin
  if not has_any_column_privilege(current_user,'public.audit_logs','UPDATE') then
    raise exception 'ADMIN self-grant did not activate fixture mutation privilege';
  end if;
end $$;
-- Remove only the self-grant made by service_role; the administrator's
-- original NOINHERIT/NOSET membership remains for the refusal probe.
revoke audit528_mutator from service_role;
reset session authorization;
do $$ begin
  if has_any_column_privilege('service_role','public.audit_logs','UPDATE') then
    raise exception 'invalid NOINHERIT ADMIN fixture';
  end if;
end $$;
SQL
expect_role_refusal audit_service_role_inherited_mutation_privilege noninherited-admin
psql "${psql_args[@]}" <<'SQL' >/dev/null
revoke audit528_mutator from service_role cascade;
grant audit528_mutator to authenticated with inherit false, set true;
SQL
expect_role_refusal audit_browser_privilege_drift browser-noninherited-set
psql "${psql_args[@]}" <<'SQL' >/dev/null
revoke audit528_mutator from authenticated;
revoke update(action) on public.audit_logs from audit528_mutator;
drop role audit528_mutator;
alter role service_role createrole;
SQL
expect_role_refusal audit_service_role_inherited_mutation_privilege service-createrole
psql "${psql_args[@]}" -c 'alter role service_role nocreaterole superuser;' >/dev/null
expect_role_refusal audit_service_role_inherited_mutation_privilege service-superuser
psql "${psql_args[@]}" -c 'alter role service_role nosuperuser;' >/dev/null

psql "${psql_args[@]}" -c 'grant select(action) on public.audit_logs to authenticated;' >/dev/null
before="$(psql "${psql_args[@]}" -Atc "$audit_acl")"
if psql "${psql_args[@]}" --file="$repair" >"$cluster_root/browser-refusal.log" 2>&1; then
  printf 'Browser audit column access drift was accepted.\n' >&2; exit 1
fi
grep -q 'audit_browser_privilege_drift' "$cluster_root/browser-refusal.log"
[[ "$(psql "${psql_args[@]}" -Atc "$audit_acl")" == "$before" ]]
psql "${psql_args[@]}" -c 'revoke select(action) on public.audit_logs from authenticated;' >/dev/null

# Owning-role authority remains a bypass even through NOINHERIT membership.
psql "${psql_args[@]}" <<'SQL' >/dev/null
create role audit528_owner nologin;
alter table public.audit_logs owner to audit528_owner;
grant audit528_owner to service_role with inherit false, set true;
SQL
expect_role_refusal audit_service_role_inherited_mutation_privilege noninherited-owner
psql "${psql_args[@]}" --set=fixture_owner="$(id -un)" <<'SQL' >/dev/null
revoke audit528_owner from service_role;
alter table public.audit_logs owner to :"fixture_owner";
drop role audit528_owner;
SQL

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
printf 'Audit append-only: column repair, inherited/SET/ADMIN/browser/CREATEROLE/superuser/owner atomic refusals and forward-only recovery passed.\n'
