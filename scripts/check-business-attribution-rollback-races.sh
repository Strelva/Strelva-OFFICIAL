#!/usr/bin/env bash
set -euo pipefail
# Real isolated PostgreSQL transactions; fictional owner receipts only.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-attribution-inverse strelva-attribution-inverse-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_sql(){ for ((attempt=0;attempt<250;attempt++));do if [[ "$(query "$1")" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 # Retire only this empty prefix; later34/37 must be retired before33.
 if [[ "$name" > "20261020090033_business_attributions.sql" ]];then continue;fi
 if [[ "$name" == 20261005090000_tenant_leads.sql ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
psql "${psql_args[@]}" -f "$repo_root/tests/support/business-attribution-fixture.sql" >/dev/null
query 'create database inverse_first template postgres' >/dev/null
provider="$(query "select id from public.workspace_providers where customer_workspace_id='b2840000-0000-4000-8000-000000000010' and status='active'")"
record="select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','referral','{\"kind\":\"owner_statement\",\"reference\":\"fictional inverse race\"}','b2840000-0000-4000-8000-000000000050','$provider')"
rollback="$repo_root/supabase/migrations/rollback-20261020090033_business_attributions.sql"
# A writer's uncommitted opening is invisible to an empty SELECT, but its table
# lock must keep the inverse waiting until the new receipt can be observed.
query "set application_name='attribution_inverse_writer';begin;$record;select pg_sleep(1.5);commit" >"$cluster_root/writer.log" 2>&1 & writer_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_inverse_writer' and wait_event='PgSleep')"
PGAPPNAME=attribution_inverse_guard psql "${psql_args[@]}" -f "$rollback" >"$cluster_root/inverse.log" 2>&1 & inverse_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_inverse_guard' and wait_event_type='Lock')"
wait "$writer_pid"
if wait "$inverse_pid";then printf 'FAIL: inverse erased the newly committed owner receipt after an empty check.\n' >&2;exit 1;fi
rg -q business_attribution_receipts_require_preservation "$cluster_root/inverse.log"
[[ "$(query "select count(*)=1 from public.business_attributions where command_id='b2840000-0000-4000-8000-000000000050'")" == t ]]
printf 'Writer-first inverse waits, then refuses and preserves the exact committed receipt.\n'
# In the cloned empty database, pause the exact inverse after its locks and
# before its guard. A newly admitted writer must wait, then fail after retirement.
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=inverse_first --set=ON_ERROR_STOP=1 --no-psqlrc)
python3 - "$rollback" "$cluster_root/paused-inverse.sql" <<'PY'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text()
assert s.count('do $$begin')==1
Path(sys.argv[2]).write_text(s.replace('do $$begin','select pg_advisory_xact_lock(2840033);\ndo $$begin',1))
PY
query "set application_name='attribution_inverse_barrier';select pg_advisory_lock(2840033);select pg_sleep(20)" >"$cluster_root/barrier.log" 2>&1 & barrier_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_inverse_barrier' and wait_event='PgSleep')"
PGAPPNAME=attribution_inverse_first psql "${psql_args[@]}" -f "$cluster_root/paused-inverse.sql" >"$cluster_root/inverse-first.log" 2>&1 & inverse_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_inverse_first' and wait_event='advisory')"
query "set application_name='attribution_inverse_candidate';$record" >"$cluster_root/candidate.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_inverse_candidate' and wait_event_type='Lock')"
query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='attribution_inverse_barrier'" >/dev/null
wait "$barrier_pid" || true
if ! wait "$inverse_pid";then cat "$cluster_root/inverse-first.log" >&2;cat "$cluster_root/candidate.log" >&2;exit 1;fi
if wait "$candidate_pid";then printf 'FAIL: retired attribution writer accepted a receipt.\n' >&2;exit 1;fi
if ! rg -q 'does not exist|cache lookup failed|could not open relation with OID' "$cluster_root/candidate.log";then cat "$cluster_root/candidate.log" >&2;exit 1;fi
[[ "$(query "select to_regclass('public.business_attributions') is null and to_regprocedure('public.record_business_attribution(uuid,uuid,text,uuid,text,jsonb,uuid,uuid)') is null")" == t ]]
printf 'Inverse-first excludes a concurrent writer and retires only the empty ledger.\n'
