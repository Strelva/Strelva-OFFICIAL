#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-recurring-sql strelva-recurring-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == "20261005090000_tenant_leads.sql" ]]; then continue; fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null
  fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
 done
sed '/-- A revoked accepted mandate/,$d' "$repo_root/tests/recurring-responsibilities-schema.sql" > "$cluster_data/maintenance-fixture.sql"
cat "$repo_root/tests/bundle-maintenance-schema.sql" >> "$cluster_data/maintenance-fixture.sql"
psql "${psql_args[@]}" --file="$cluster_data/maintenance-fixture.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090036_bundle_maintenance.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261020090036_bundle_maintenance.sql" >/dev/null
sed '$d' "$cluster_data/maintenance-fixture.sql" > "$cluster_data/maintenance-committed.sql"
cat >> "$cluster_data/maintenance-committed.sql" <<'SQL'
update public.service_requests set provider_acceptance='accepted',accepted_by='99100000-0000-4000-8000-000000000002',accepted_at=now() where id='99100000-0000-4000-8000-000000000021';
commit;
SQL
psql "${psql_args[@]}" --file="$cluster_data/maintenance-committed.sql" >/dev/null
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261020090036_bundle_maintenance.sql" > "$cluster_data/rollback-held.log" 2>&1; then
  printf 'FAIL: populated rollback erased evidence.\n'; exit 1
fi
rg -q 'bundle_maintenance_evidence_preservation_required' "$cluster_data/rollback-held.log"
# One native claim holds staff/mandate rows until it finishes; concurrent
# revocation waits, then the same transaction must refuse the current actor.
psql "${psql_args[@]}" -At -c "begin; select public.check_bundle_maintenance_event((select preparation_id from public.bundle_maintenance_event_links limit 1),'fictional-exact-event','99100000-0000-4000-8000-000000000011','99100000-0000-4000-8000-000000000201','location',(select draft from public.bundle_maintenance_preparations limit 1)); select pg_sleep(2); commit;" > "$cluster_data/claim-held.log" &
claim_pid=$!
for attempt in {1..40}; do
  if rg -q '^t$' "$cluster_data/claim-held.log"; then break; fi
  sleep 0.05
done
rg -q '^t$' "$cluster_data/claim-held.log"
psql "${psql_args[@]}" -At <<'SQL'
begin;
update public.agency_client_staff set status='ended',ended_at=clock_timestamp() where user_id='99100000-0000-4000-8000-000000000002';
do $$ begin
 begin
  perform public.check_bundle_maintenance_event((select preparation_id from public.bundle_maintenance_event_links limit 1),'fictional-exact-event','99100000-0000-4000-8000-000000000011','99100000-0000-4000-8000-000000000201','location',(select draft from public.bundle_maintenance_preparations limit 1));
 exception when others then
  if sqlerrm not like '%acting_provider_not_staffed%' then raise; end if;
  return;
 end;
 raise exception 'revoked_staff_was_allowed';
end $$;
rollback;
SQL
wait "$claim_pid"
printf 'Concurrent staff revocation serialized and current actor denied.\n'
STRELVA_MAINTENANCE_TEST_DATABASE_URL="postgresql:///postgres?host=$cluster_socket&port=$cluster_port" "$repo_root/node_modules/.bin/tsx" "$repo_root/scripts/bundle-maintenance-native-fixture.ts"
printf 'Bundle maintenance native admission, preserved rollback and stored execution seam passed.\n'
