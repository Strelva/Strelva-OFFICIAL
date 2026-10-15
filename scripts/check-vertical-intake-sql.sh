#!/usr/bin/env bash
# Dental intake on disposable local Postgres: the vertical_intake flag, the insurance_accepted fact
# (validator wrap, re-pointed CHECK constraints, 17-key list), the intake tables and RPCs, and the inverses.
# No Auth, provider, mail or network.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-vertical-intake strelva-vi-socket
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
while IFS= read -r migration; do
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$(basename "$migration")" >&2; cat "$cluster_root/migration.log" >&2; exit 1
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/vertical-intake-schema.sql" >/dev/null
# The inverses. The fixture rolled back, so nothing is committed yet. Commit one Release and one
# insurance fact: both rollbacks must refuse to discard them.
dir="$repo_root/supabase/migrations"
psql "${psql_args[@]}" >/dev/null <<'SQL'
insert into public.users(id, email, verified_at) values ('28100501-0000-4000-8000-000000000001', 'vi-keep@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values ('28100501-0000-4000-8000-000000000010', 'customer', 'Keep Dental', '28100501-0000-4000-8000-000000000001');
insert into public.app_intake_installs(id, workspace_id, app_id, created_by) values ('28100501-0000-4000-8000-0000000000a1', '28100501-0000-4000-8000-000000000010', 'dental_intake', '28100501-0000-4000-8000-000000000001');
insert into public.app_intake_releases(install_id, number, definition_version, config, draft_revision, owner_decision_id, made_live_by)
  values ('28100501-0000-4000-8000-0000000000a1', 1, 1, '{}', 1, '28100501-0000-4000-8000-0000000000d1', '28100501-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values ('28100501-0000-4000-8000-000000000010', '28100501-0000-4000-8000-000000000001', 'owner', '28100501-0000-4000-8000-000000000001');
select public.patch_business_record('28100501-0000-4000-8000-000000000010', '28100501-0000-4000-8000-000000000001', 'vi-keep@example.test', 'owner', 0,
  '{"facts":{"insurance_accepted":{"value":{"carriers":["Cigna"]},"verified":true}}}', gen_random_uuid(), repeat('a', 64));
SQL
if psql "${psql_args[@]}" --file="$dir/rollback-20261028100700_vertical_intake.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Rollback discarded a Release\n' >&2; exit 1
fi
grep -q 'app_intake_rollback_has_releases' "$cluster_root/rollback-refusal.log"
psql "${psql_args[@]}" --command="delete from public.app_intake_installs" >/dev/null
psql "${psql_args[@]}" --file="$dir/rollback-20261028100700_vertical_intake.sql" >/dev/null
psql "${psql_args[@]}" --command="select (to_regclass('public.app_intake_installs') is null and to_regclass('public.app_intake_sensitive') is null)::int" --tuples-only | grep -q '1'
if psql "${psql_args[@]}" --file="$dir/rollback-20261028100600_business_record_insurance_fact.sql" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Rollback discarded an insurance fact\n' >&2; exit 1
fi
grep -q 'insurance_accepted facts exist' "$cluster_root/rollback-refusal.log"
psql "${psql_args[@]}" --command="delete from public.business_record_facts where fact_key = 'insurance_accepted'" >/dev/null 2>&1 \
  || psql "${psql_args[@]}" --command="set session_replication_role = replica; delete from public.business_record_facts where fact_key = 'insurance_accepted'" >/dev/null
psql "${psql_args[@]}" --file="$dir/rollback-20261028100600_business_record_insurance_fact.sql" >/dev/null
psql "${psql_args[@]}" --command="select (not exists (select 1 from pg_proc where proname = 'business_record_fact_valid_before_insurance'))::int" --tuples-only | grep -q '1'
psql "${psql_args[@]}" --command="select (not exists (select 1 from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid_before_insurance(%') and (select count(*) from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) like '%business_record_fact_valid(%') >= 2 and (select pg_get_constraintdef(oid) from pg_constraint where conname = 'business_record_facts_fact_key_check') not like '%insurance_accepted%')::int" --tuples-only | grep -q '1'
psql "${psql_args[@]}" --file="$dir/rollback-20261028100500_vertical_intake_flag.sql" >/dev/null
psql "${psql_args[@]}" --command="select (not ('vertical_intake' = any(public.workspace_release_flag_names())))::int" --tuples-only | grep -q '1'
for forward in 20261028100500_vertical_intake_flag 20261028100600_business_record_insurance_fact 20261028100700_vertical_intake; do
  psql "${psql_args[@]}" --file="$dir/$forward.sql" >/dev/null
done
psql "${psql_args[@]}" --file="$repo_root/tests/vertical-intake-schema.sql" >/dev/null
printf 'Dental intake: flag, insurance fact, grants, immutable Releases, submissions, sensitive values, visits, Events and all three inverses passed.\n'
