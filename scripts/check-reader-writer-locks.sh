#!/usr/bin/env bash
set -euo pipefail
# Requires migrated disposable schema, only fictional rows owned by this check.
database_url="${1:?Pass the disposable local database URL}"
node -e 'const u=new URL(process.argv[1]),h=u.searchParams.get("host"),a=u.searchParams.get("hostaddr"); if (!["localhost","127.0.0.1"].includes(u.hostname) || (h && !h.startsWith("/") && !["localhost","127.0.0.1"].includes(h)) || (a && a!=="127.0.0.1")) throw Error("Local database required")' "$database_url"
psql_args=("$database_url" -X -q -v ON_ERROR_STOP=1)
race_logs="$(mktemp -d "${TMPDIR:-/tmp}/reader-writer-locks.XXXXXX")"
trap 'rm -rf -- "$race_logs"' EXIT
psql "${psql_args[@]}" <<'SQL' >/dev/null
insert into public.users(id,email,verified_at) values
 ('13240000-0000-4000-8000-000000000001','rw-staff@example.test',now()),
 ('13240000-0000-4000-8000-000000000002','rw-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('13240000-0000-4000-8000-000000000010','agency','Reader/writer lock agency','13240000-0000-4000-8000-000000000001'),
 ('13240000-0000-4000-8000-000000000011','customer','Reader/writer lock client','13240000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('13240000-0000-4000-8000-000000000010','13240000-0000-4000-8000-000000000001','owner','13240000-0000-4000-8000-000000000001'),
 ('13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000002','owner','13240000-0000-4000-8000-000000000002');
select public.choose_business_provider('13240000-0000-4000-8000-000000000002','rw-owner@example.test','13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000010');
select public.set_agency_client_staff('13240000-0000-4000-8000-000000000001','rw-staff@example.test','13240000-0000-4000-8000-000000000010','13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000001',true);
SQL
wait_for_activity() {
  local app_name="$1" event="$2" ready=0
  for attempt in $(seq 1 100); do
    if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='$app_name' and wait_event_type='$event')")" == t ]]; then ready=1; break; fi
    sleep 0.025
  done
  [[ "$ready" == 1 ]] || { printf 'Reader/writer race did not reach %s (%s).\n' "$app_name" "$event" >&2; exit 1; }
}
patch_one="select public.patch_business_record('13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000001','rw-staff@example.test','owner',0,'{\"facts\":{\"phone\":{\"value\":\"555-0100\"}}}','13240000-0000-4000-8000-000000000020',repeat('a',64));"
end_seat="select public.end_provider_seat('13240000-0000-4000-8000-000000000002','rw-owner@example.test','13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000010','Local writer lock proof');"
# Writer gets authority first. Actual mutation locks the seat through commit.
PGAPPNAME=rr-write-first psql "${psql_args[@]}" -c "begin; set local statement_timeout='10s'; $patch_one select pg_sleep(1.5); commit;" >"$race_logs/write-first.log" 2>&1 &
writer_pid=$!
wait_for_activity rr-write-first Timeout
PGAPPNAME=rr-revoke-after psql "${psql_args[@]}" -c "set statement_timeout='10s'; $end_seat" >"$race_logs/revoke-after.log" 2>&1 &
revoker_pid=$!
wait_for_activity rr-revoke-after Lock
wait "$writer_pid"
wait "$revoker_pid"
[[ "$(psql "${psql_args[@]}" -Atc "select value='\"555-0100\"'::jsonb from public.business_record_facts where workspace_id='13240000-0000-4000-8000-000000000011' and fact_key='phone'")" == t ]]
# Owner grants a fresh seat and staff row before the inverse race.
psql "${psql_args[@]}" -c "select public.choose_business_provider('13240000-0000-4000-8000-000000000002','rw-owner@example.test','13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000010'); select public.set_agency_client_staff('13240000-0000-4000-8000-000000000001','rw-staff@example.test','13240000-0000-4000-8000-000000000010','13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000001',true);" >/dev/null
PGAPPNAME=rr-revoke-first psql "${psql_args[@]}" -c "begin; set local statement_timeout='10s'; $end_seat select pg_sleep(1.5); commit;" >"$race_logs/revoke-first.log" 2>&1 &
revoker_pid=$!
wait_for_activity rr-revoke-first Timeout
patch_two="select public.patch_business_record('13240000-0000-4000-8000-000000000011','13240000-0000-4000-8000-000000000001','rw-staff@example.test','owner',1,'{\"facts\":{\"phone\":{\"value\":\"555-0200\"}}}','13240000-0000-4000-8000-000000000021',repeat('b',64));"
PGAPPNAME=rr-write-after psql "${psql_args[@]}" -c "set statement_timeout='10s'; $patch_two" >"$race_logs/write-after.log" 2>&1 &
writer_pid=$!
wait_for_activity rr-write-after Lock
wait "$revoker_pid"
if wait "$writer_pid"; then printf 'Revoked provider mutated the record.\n' >&2; exit 1; fi
rg -q 'business_record_access_denied' "$race_logs/write-after.log"
[[ "$(psql "${psql_args[@]}" -Atc "select value='\"555-0100\"'::jsonb from public.business_record_facts where workspace_id='13240000-0000-4000-8000-000000000011' and fact_key='phone'")" == t ]]
printf 'Writer locks proven: writer-first blocks revocation; revocation-first denies mutation and preserves the record.\n'
