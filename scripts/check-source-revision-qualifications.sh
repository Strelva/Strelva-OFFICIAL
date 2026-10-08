#!/usr/bin/env bash
# Preparatory #327: reuse the complete disposable agency migration/authority
# job, then prove the additive evidence contract on the same final schema.
# No remote connection is accepted; temp-postgres clears inherited PG variables.
set -euo pipefail
qualification_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$qualification_repo_root/scripts/check-agency-workflow-sql.sh"
psql "${psql_args[@]}" --set=qualification_keep_fixture=true --file="$repo_root/tests/system-revision-qualifications.sql"
qualification_rows="select md5(coalesce(jsonb_agg(to_jsonb(q) order by id),'[]')::text) from public.system_revision_qualifications q"
psql "${psql_args[@]}" -Atc "$qualification_rows" >"$cluster_root/qualification-before.hash"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261019111000_system_revision_qualifications.sql"
psql "${psql_args[@]}" -Atc "select not has_function_privilege('service_role','public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb)','EXECUTE') and has_function_privilege('service_role','public.read_system_revision_qualifications(uuid,text,uuid)','EXECUTE')" | grep -qx t
psql "${psql_args[@]}" -Atc "$qualification_rows" >"$cluster_root/qualification-rolled-back.hash"
cmp "$cluster_root/qualification-before.hash" "$cluster_root/qualification-rolled-back.hash"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261019111000_system_revision_qualifications.sql"
psql "${psql_args[@]}" -Atc "select has_function_privilege('service_role','public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb)','EXECUTE')" | grep -qx t
psql "${psql_args[@]}" -Atc "$qualification_rows" >"$cluster_root/qualification-reapplied.hash"
cmp "$cluster_root/qualification-before.hash" "$cluster_root/qualification-reapplied.hash"
# Reader must work in an actual read-only transaction, without touching history.
psql "${psql_args[@]}" <<'SQL'
begin read only;
set local role service_role;
select 1 / (jsonb_array_length(public.read_system_revision_qualifications('bc327000-0000-4000-8000-000000000001','qualification-creator@example.test','bc327000-0000-4000-8000-000000000031'))=2)::int;
rollback;
SQL
printf 'Source revision qualification passed: bound evidence, pending human review, actor/read isolation, stale rejection, append-only replay, preserved rollback and read-only reads.\n'
