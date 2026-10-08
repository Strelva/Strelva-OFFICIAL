#!/usr/bin/env bash
# Fictional current identity, native audit FK writes and retained inverse proof.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-support-audit strelva-support-audit-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
forward="$repo_root/supabase/migrations/20261020090038_newsletter_backfill_audit.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090038_newsletter_backfill_audit.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  [[ "$migration" == "$forward" ]] && continue
  if ! psql "${psql_args[@]}" -f "$migration" >"$cluster_root/migration.log" 2>&1; then
    cat "$cluster_root/migration.log" >&2;exit 1
  fi
done
if psql "${psql_args[@]}" -f "$repo_root/tests/newsletter-backfill-audit-schema.sql" >"$cluster_root/old-writer-red.log" 2>&1; then
  printf 'Old repair unexpectedly recorded the new audit
' >&2;exit 1
fi
rg -q 'dry/apply audit names exact actor' "$cluster_root/old-writer-red.log"
printf 'RED old session-bound repair lacks operator audit.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >/dev/null
psql "${psql_args[@]}" --set=newsletter_audit_retain=1 -f "$repo_root/tests/newsletter-backfill-audit-schema.sql" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/operator-inquiry-audit-schema.sql" >/dev/null
retained="select 'workspace-audit|'||id||'|'||md5(to_jsonb(t)::text) from public.workspace_operator_audit_events t union all select 'tenant-audit|'||id||'|'||md5(to_jsonb(t)::text) from public.audit_logs t union all select 'contact|'||id||'|'||md5(to_jsonb(t)::text) from public.business_contacts t union all select 'sync|'||tenant_stable_id||'|'||email||'|'||md5(to_jsonb(t)::text) from public.newsletter_contact_sync t order by 1"
psql "${psql_args[@]}" -Atc "$retained" >"$cluster_root/before.rows"
psql "${psql_args[@]}" -f "$rollback" >/dev/null
psql "${psql_args[@]}" -Atc "$retained" >"$cluster_root/after.rows"
cmp "$cluster_root/before.rows" "$cluster_root/after.rows"
if psql "${psql_args[@]}" >"$cluster_root/inverse-denial.log" 2>&1 <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','e9000000-0000-4000-8000-000000000001',false);
select public.backfill_newsletter_contacts('backfill-identity-site','e9000000-0000-4000-8000-000000000010',true);
SQL
then printf 'Inverse left repair entry callable\n' >&2;exit 1;fi
rg -q 'permission denied for function backfill_newsletter_contacts' "$cluster_root/inverse-denial.log"
psql "${psql_args[@]}" -Atc "select not has_function_privilege('service_role','public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)','EXECUTE')" | rg -qx t
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -Atc "$retained" >"$cluster_root/reapplied.rows"
cmp "$cluster_root/before.rows" "$cluster_root/reapplied.rows"
psql "${psql_args[@]}" -f "$repo_root/tests/operator-inquiry-audit-schema.sql" >/dev/null
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
printf 'Operator support audit passed: native FK scopes, current actor denials, atomic audit failure, preserved inverse/reapply.\n'
