#!/usr/bin/env bash
set -euo pipefail
connection="$1"
race_root="$(mktemp -d /tmp/strelva-ar-race.XXXXXX)"
trap 'rm -rf "$race_root"' EXIT
# Concurrent repeat revokes serialize on the native token and produce one receipt.
command_sql="select public.revoke_access_review_entry('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000002','ar-2@example.test',false,'agent_token','27500000-0000-4000-8000-000000000087');"
psql "$connection" -X -v ON_ERROR_STOP=1 -c "begin; $command_sql select pg_sleep(0.5); commit;" >"$race_root/first.log" 2>&1 &
first_pid=$!
psql "$connection" -X -v ON_ERROR_STOP=1 -c "$command_sql" >"$race_root/second.log" 2>&1 &
second_pid=$!
wait "$first_pid"; wait "$second_pid"
psql "$connection" -X -Atc "select count(*)=1 from public.customer_mapping_audit where record_type='agent_token' and record_id='27500000-0000-4000-8000-000000000087'" | grep -qx t
# Revoke waits behind removal of the actor's current membership, then denies.
psql "$connection" -X -v ON_ERROR_STOP=1 -c "begin; delete from public.workspace_memberships where workspace_id='27500000-0000-4000-8000-000000000041' and user_id='27500000-0000-4000-8000-000000000002'; select pg_sleep(1); commit;" >"$race_root/removal.log" 2>&1 &
remove_pid=$!
# Synchronize against the actual row lock rather than assuming a timer won.
observed_lock=false
for attempt in {1..100}; do
 if psql "$connection" -X -Atc "select exists(select 1 from pg_stat_activity where query like 'begin; delete from public.workspace_memberships%000000000002%pg_sleep%' and wait_event='PgSleep')" | grep -qx t; then observed_lock=true; break; fi
 sleep 0.01
done
[[ "$observed_lock" == true ]] || { printf 'Could not observe the actor-removal lock.\n' >&2; exit 1; }
if psql "$connection" -X -v ON_ERROR_STOP=1 -c "$command_sql" >"$race_root/denied.log" 2>&1; then printf 'Removed actor retained authority.\n' >&2; exit 1; fi
wait "$remove_pid"
grep -q access_review_denied "$race_root/denied.log"
printf 'Concurrent revoke has one receipt; concurrent actor removal denies revoke.\n'
