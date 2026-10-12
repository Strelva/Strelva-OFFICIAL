# Sourced only by disposable native PostgreSQL runners with psql_args.
psql "${psql_args[@]}" --file="$repo_root/tests/platform-operator-read-audit-schema.sql" >/dev/null
platform_read_catalog="select p.oid::regprocedure::text,p.proowner,p.proacl,md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('read_catalog_tool_notice_failures','read_catalog_tool_contact_conflicts','read_catalog_report_failures','read_operator_google_uncertainty','read_operator_queue_context_v2','read_effort_businesses','read_business_effort','read_outside_write_receipts','read_google_listing_readback_failures','read_google_listing_readback_failures_v2','read_operator_queue_context') order by p.oid::regprocedure::text"
psql "${psql_args[@]}" -Atc "$platform_read_catalog" >"$cluster_root/platform-read-pure-before.catalog"
# A committed fictional access must survive actual inverse/reapply, including
# account deletion. Its UUID has no FK; every runner owns and removes the DB.
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id,email,verified_at) values('20090039-0000-4000-8000-000000000091','platform-read-retained@example.test',now());
insert into public.super_admins(user_id,email) values('20090039-0000-4000-8000-000000000091','platform-read-retained@example.test');
set role service_role;
select public.read_audited_platform_operator_source('20090039-0000-4000-8000-000000000091','platform-read-retained@example.test','read_effort_businesses');
reset role;
delete from public.super_admins where user_id='20090039-0000-4000-8000-000000000091';
delete from public.users where id='20090039-0000-4000-8000-000000000091';
SQL
psql "${psql_args[@]}" -Atc "select id,actor_user_id,reader_name,scope,created_at from public.platform_operator_read_audit order by id" >"$cluster_root/platform-read-before.rows"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090039_platform_operator_read_audit.sql" >/dev/null
psql "${psql_args[@]}" -Atc "select not has_function_privilege('service_role','public.read_audited_platform_operator_source(uuid,text,text)','execute') and not has_function_privilege('service_role','public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer)','execute') and not has_function_privilege('service_role','public.authorize_platform_operator_read(uuid,text,text)','execute')" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090039_platform_operator_read_audit.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090039_platform_operator_read_audit.sql" >/dev/null
psql "${psql_args[@]}" -Atc "$platform_read_catalog" >"$cluster_root/platform-read-pure-after.catalog"
psql "${psql_args[@]}" -Atc "select id,actor_user_id,reader_name,scope,created_at from public.platform_operator_read_audit order by id" >"$cluster_root/platform-read-after.rows"
cmp "$cluster_root/platform-read-pure-before.catalog" "$cluster_root/platform-read-pure-after.catalog"
cmp "$cluster_root/platform-read-before.rows" "$cluster_root/platform-read-after.rows"
# Catalog drift refuses before permission changes; each failed transaction is
# abandoned with its private connection, restoring the deliberate drift.
for platform_read_drift in \
  "alter table public.platform_operator_read_audit add column alien text" \
  "grant select on public.platform_operator_read_audit to service_role" \
  "alter table public.platform_operator_read_audit disable trigger platform_operator_read_audit_rows_immutable" \
  "create or replace function public.read_audited_platform_operator_source(p_user_id uuid,p_verified_email text,p_reader_name text) returns jsonb language sql as 'select null::jsonb'"; do
  for platform_read_action in "rollback-20261020090039_platform_operator_read_audit.sql" "20261020090039_platform_operator_read_audit.sql"; do
    {
      printf 'begin;\n%s;\n' "$platform_read_drift"
      cat "$repo_root/supabase/migrations/$platform_read_action"
    } >"$cluster_root/platform-read-drift.sql"
    if psql "${psql_args[@]}" --file="$cluster_root/platform-read-drift.sql" >"$cluster_root/platform-read-drift.log" 2>&1; then
      printf 'Platform support read audit accepted catalog drift.\n' >&2; exit 1
    fi
    grep -Eq 'platform_operator_read_audit_(contract_drift|role_path)' "$cluster_root/platform-read-drift.log"
  done
done
psql "${psql_args[@]}" --file="$repo_root/tests/platform-operator-read-audit-schema.sql" >/dev/null
printf 'Platform support reads: native actor/ACL/immutable/failure proof, preserving inverse/reapply, pure reader equality and catalog-drift refusal passed.\n'
# Dangerous role reachability must refuse even when INHERIT is false.
for platform_read_role_drift in \
  "create role platform_read_parent; grant select on public.platform_operator_read_audit to platform_read_parent; grant platform_read_parent to service_role with inherit false, set true" \
  "create role platform_read_parent; grant insert(actor_user_id) on public.platform_operator_read_audit to platform_read_parent; grant platform_read_parent to service_role with inherit false, set false, admin true" \
  "create role platform_read_parent superuser; grant platform_read_parent to service_role with inherit false, set true" \
  "create role platform_read_parent createrole; grant platform_read_parent to authenticated with inherit false, set true" \
  "create role platform_read_parent; grant \"$(id -un)\" to platform_read_parent; grant platform_read_parent to service_role with inherit false, set true" \
  "create role platform_read_parent; grant execute on function public.read_audited_platform_operator_source(uuid,text,text) to platform_read_parent; grant platform_read_parent to authenticated with inherit false, set true" \
  "create role platform_read_parent; grant execute on function public.authorize_platform_operator_read(uuid,text,text) to platform_read_parent; grant platform_read_parent to anon with inherit false, set true" \
  "create role platform_read_parent; grant execute on function public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer) to platform_read_parent; grant platform_read_parent to authenticated with inherit false, set true"; do
  for platform_read_action in "rollback-20261020090039_platform_operator_read_audit.sql" "20261020090039_platform_operator_read_audit.sql"; do
    {
      printf 'begin;\n%s;\n' "$platform_read_role_drift"
      cat "$repo_root/supabase/migrations/$platform_read_action"
    } >"$cluster_root/platform-read-role-drift.sql"
    if psql "${psql_args[@]}" --file="$cluster_root/platform-read-role-drift.sql" >"$cluster_root/platform-read-role-drift.log" 2>&1; then
      printf 'Platform support read audit accepted role privilege drift.\n' >&2; exit 1
    fi
    grep -q 'platform_operator_read_audit_role_path' "$cluster_root/platform-read-role-drift.log"
  done
done
# First-install inherited defaults must never become an accepted fingerprint.
# Only this private transaction removes owned test objects; failure rolls back
# all changes and retains the existing committed audit event byte-for-byte.
{
  cat <<'SQL'
begin;
drop table public.platform_operator_read_audit;
drop table release_rollback_baseline.platform_operator_read_audit;
drop function public.read_audited_platform_operator_source(uuid,text,text), public.platform_operator_read_audit_immutable(), public.platform_operator_read_audit_fingerprint(), public.platform_operator_read_audit_check_roles(), public.platform_operator_read_actor(uuid,text,text), public.read_audited_platform_operator_detail(uuid,text,text,date,uuid,text,uuid,integer), public.authorize_platform_operator_read(uuid,text,text);
create role platform_read_parent;
alter default privileges grant select on tables to platform_read_parent;
grant platform_read_parent to service_role with inherit false, set true;
SQL
  cat "$repo_root/supabase/migrations/20261020090039_platform_operator_read_audit.sql"
} >"$cluster_root/platform-read-first-install-drift.sql"
if psql "${psql_args[@]}" --file="$cluster_root/platform-read-first-install-drift.sql" >"$cluster_root/platform-read-first-install-drift.log" 2>&1; then
  printf 'Platform support read audit accepted inherited first-install defaults.\n' >&2; exit 1
fi
grep -q 'platform_operator_read_audit_role_path' "$cluster_root/platform-read-first-install-drift.log"
psql "${psql_args[@]}" -Atc "select id,actor_user_id,reader_name,scope,created_at from public.platform_operator_read_audit order by id" >"$cluster_root/platform-read-after-role-proof.rows"
cmp "$cluster_root/platform-read-before.rows" "$cluster_root/platform-read-after-role-proof.rows"
printf 'Platform support audit role graph: first-install inherited defaults and NOINHERIT SET/ADMIN/owner/SUPER/CREATEROLE/browser-execute drift refused.\n'
