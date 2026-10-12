#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-creator-concurrency strelva-creator-concurrency-socket
cluster_port="$((62000 + ($$ % 2000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  name="$(basename "$migration")"
  if [[ "$name" == 20261005090000_tenant_leads.sql ]]; then continue; fi
  if [[ "$name" == 20261001120000_website_documents.sql ]]; then psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null; fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done
# The same native install/release fixture is committed only inside this disposable cluster.
python3 - "$repo_root/tests/creator-packages-schema.sql" "$cluster_data/fixture.sql" <<'PY'
import sys
s=open(sys.argv[1]).read();s=s[:s.index('select public.revoke_system_package_install')]+"commit;\n";open(sys.argv[2],'w').write(s)
PY
psql "${psql_args[@]}" --file="$cluster_data/fixture.sql" >/dev/null
for scenario in grant_revocation agency_demotion owner_demotion delegation_revocation; do
  # Every contender targets the authority rows actually read by the Version writer.
  case "$scenario" in
    grant_revocation) contender="update public.system_package_install_grants set status='revoked' where command_id='ce000000-0000-4000-8000-000000000031';" ;;
    agency_demotion) contender="update public.workspace_memberships set role='member' where workspace_id='ce000000-0000-4000-8000-000000000010' and user_id='ce000000-0000-4000-8000-000000000001';" ;;
    owner_demotion) contender="update public.workspace_memberships set role='admin' where workspace_id='ce000000-0000-4000-8000-000000000011' and user_id='ce000000-0000-4000-8000-000000000002';" ;;
    delegation_revocation) contender="update public.workspace_delegations set status='revoked' where customer_workspace_id='ce000000-0000-4000-8000-000000000011' and agency_workspace_id='ce000000-0000-4000-8000-000000000010';" ;;
  esac
  psql "${psql_args[@]}" --command="begin; select public.save_system_version('ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test',v.id,v.row_revision,jsonb_set(public.system_version_json(v,'full','ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test'),'{overrides}',jsonb_build_array(jsonb_build_object('path','title','value','\"Local draft\"'::jsonb,'setBy','ce000000-0000-4000-8000-000000000001','setAt',now())))) from public.system_versions v join public.systems s on s.id=v.version_system_id where s.command_id='ce000000-0000-4000-8000-000000000031'; select pg_sleep(2); commit;" >"$cluster_data/writer-$scenario.log" 2>&1 &
  writer_pid=$!
  # Confirm the real writer is holding its transaction, instead of relying on an arbitrary delay.
  for ((attempt=0; attempt<100; attempt++)); do
    sleeping="$(psql "${psql_args[@]}" --tuples-only --no-align --command="select exists(select 1 from pg_stat_activity where pid<>pg_backend_pid() and state='active' and wait_event='PgSleep');")"
    if [[ "$sleeping" == t ]]; then break; fi
    sleep 0.02
  done
  if [[ "$sleeping" != t ]]; then cat "$cluster_data/writer-$scenario.log"; exit 1; fi
  result="$(psql "${psql_args[@]}" --command="begin; set local lock_timeout='200ms'; $contender commit;" 2>&1 || true)"
  if [[ "$result" != *'lock timeout'* ]]; then printf 'Authority race %s did not block: %s\n' "$scenario" "$result" >&2; exit 1; fi
  wait "$writer_pid"
  # Once the Version transaction commits, the contender can change authority and the next write is denied.
  psql "${psql_args[@]}" --command="$contender" >/dev/null
  result="$(psql "${psql_args[@]}" --command="select public.system_actor_scope('ce000000-0000-4000-8000-000000000011','ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test',true);" 2>&1 || true)"
  denied="$(psql "${psql_args[@]}" --command="select public.save_system_version('ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test',v.id,v.row_revision,jsonb_set(public.system_version_json(v,'full','ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test'),'{localData}','{\"probe\":true}')) from public.system_versions v join public.systems s on s.id=v.version_system_id where s.command_id='ce000000-0000-4000-8000-000000000031';" 2>&1 || true)"
  if [[ "$denied" != *'business_record_access_denied'* ]]; then printf 'Next real Version write after %s was not denied: %s\n' "$scenario" "$denied" >&2; exit 1; fi
  # A bare delegated relationship can retain read reach; assert exact write grant has disappeared.
  active="$(psql "${psql_args[@]}" --tuples-only --no-align --command="select public.system_package_install_grant_active(g,'ce000000-0000-4000-8000-000000000001','creator-package-creator@example.test') from public.system_package_install_grants g where command_id='ce000000-0000-4000-8000-000000000031';")"
  if [[ "$active" != f ]]; then printf 'Authority remained active after %s\n' "$scenario" >&2; exit 1; fi
  psql "${psql_args[@]}" --command="update public.system_package_install_grants set status='active' where command_id='ce000000-0000-4000-8000-000000000031'; update public.workspace_memberships set role='owner' where user_id='ce000000-0000-4000-8000-000000000001' and workspace_id='ce000000-0000-4000-8000-000000000010'; update public.workspace_memberships set role='owner' where user_id='ce000000-0000-4000-8000-000000000002' and workspace_id='ce000000-0000-4000-8000-000000000011'; update public.workspace_delegations set status='active' where customer_workspace_id='ce000000-0000-4000-8000-000000000011' and agency_workspace_id='ce000000-0000-4000-8000-000000000010';" >/dev/null
  printf 'Concurrent Version writer blocks %s; next grant check rejects changed authority.\n' "$scenario"
done
