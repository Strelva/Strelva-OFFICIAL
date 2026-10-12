#!/usr/bin/env bash
set -euo pipefail

# Fresh ordered schema plus focused contracts. This is separate from the full
# historical upgrade/rollback rehearsal; passing it cannot clear that gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-creator-apps-sql strelva-creator-apps-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)"
  --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null

rollback_reapply=false
if [[ "${1:-}" == --rollback-reapply ]]; then rollback_reapply=true;shift;fi

early_lead_migration="20261005090000_tenant_leads.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == "$early_lead_migration" ]]; then continue; fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$early_lead_migration" >/dev/null
  fi
  if [[ "$migration_name" == 20261020090021_creator_packages.sql && "$rollback_reapply" == true ]]; then
    psql "${psql_args[@]}" --command="create table public.creator_baseline_routines as select p.oid::regprocedure::text as signature,md5(pg_get_functiondef(p.oid)) as definition_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';" >/dev/null
  fi
  printf 'Applying %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done

if [[ "$#" == 0 ]]; then set -- tests/creator-packages-schema.sql; fi
for fixture in "$@"; do
  if [[ "$fixture" != tests/*.sql || "$fixture" == *'..'* || ! -f "$repo_root/$fixture" ]]; then
    printf 'Invalid focused fixture: %s\n' "$fixture" >&2
    exit 1
  fi
  printf 'Checking %s\n' "$fixture"
  psql "${psql_args[@]}" --file="$repo_root/$fixture"
done
printf 'Focused SQL contracts passed; full historical upgrade proof remains separate.\n'

if [[ "$rollback_reapply" == true ]]; then
  # Execute the actual rollback with retained review policy: reject before DDL,
  # and let the failed transaction roll back the fictional guard fixture.
  guard_log="$cluster_data/creator-rollback-guard.log"
  if psql "${psql_args[@]}" >"$guard_log" 2>&1 <<SQL
begin;
insert into public.users(id,email,verified_at) values('cf000000-0000-4000-8000-000000000001','rollback-guard@example.test',now());
insert into public.system_revision_reviewers(user_id,policy_version) values('cf000000-0000-4000-8000-000000000001','fictional-retained-policy');
\i $repo_root/supabase/migrations/rollback-20261020090021_creator_packages.sql
SQL
  then printf 'Rollback incorrectly removed retained qualification authority\n' >&2;exit 1;fi
  if ! rg -q 'rollback_creator_qualification_in_use' "$guard_log";then cat "$guard_log" >&2;exit 1;fi
  printf 'Actual creator rollback refused retained reviewer policy before DDL.\n'
  for rollback in "$repo_root"/supabase/migrations/rollback-20261020090030_money_export_readonly_authority.sql "$repo_root"/supabase/migrations/rollback-20261020090029_calendar_revoke_compatibility.sql "$repo_root"/supabase/migrations/rollback-20261020090028_recurring_responsibilities.sql "$repo_root"/supabase/migrations/rollback-20261020090027_bundle_native_lifecycle.sql "$repo_root"/supabase/migrations/rollback-20261020090026_package_readonly_authority.sql "$repo_root"/supabase/migrations/rollback-20261020090025_system_bundles.sql "$repo_root"/supabase/migrations/rollback-20261020090024_package_management.sql "$repo_root"/supabase/migrations/rollback-20261020090023_offering_source_versions.sql "$repo_root"/supabase/migrations/rollback-20261020090022_package_install_scope.sql "$repo_root"/supabase/migrations/rollback-20261020090021_creator_packages.sql; do
    psql "${psql_args[@]}" --file="$rollback" >/dev/null
  done
  psql "${psql_args[@]}" <<'SQL'
do $$ declare drift text; begin
 select string_agg(b.signature,',') into drift from public.creator_baseline_routines b where to_regprocedure(b.signature) is null or md5(pg_get_functiondef(to_regprocedure(b.signature)))<>b.definition_hash;
 if drift is not null then raise exception 'Creator rollback routine drift: %',drift; end if;
 if to_regclass('public.system_revision_qualifications') is not null or to_regclass('public.offering_package_sources') is not null or to_regclass('public.system_package_install_grants') is not null then raise exception 'Creator rollback table remains';end if;
end $$;
SQL
  psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql" >/dev/null
  for migration in "$repo_root"/supabase/migrations/2026102009002[1-9]_*.sql "$repo_root"/supabase/migrations/20261020090030_money_export_readonly_authority.sql; do psql "${psql_args[@]}" --file="$migration" >/dev/null;done
  for fixture in "$@"; do psql "${psql_args[@]}" --file="$repo_root/$fixture" >/dev/null;done
  printf 'Creator ordered rollback restored baseline routine hashes; reapply plus all focused fixtures passed.\n'
fi
