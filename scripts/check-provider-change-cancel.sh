#!/usr/bin/env bash
set -euo pipefail

# Fresh ordered schema plus focused contracts. This is separate from the full
# historical upgrade/rollback rehearsal; passing it cannot clear that gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-provider-cancel strelva-provider-cancel-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)"
  --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null

forward="$repo_root/supabase/migrations/20261020090031_provider_change_cancel.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090031_provider_change_cancel.sql"
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_sql(){ for ((attempt=0;attempt<200;attempt++));do if [[ "$(query "$1")" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$migration" == "$forward" ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
catalog="select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1"
query "$catalog" >"$cluster_root/before.catalog"
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/provider-change-cancel-schema.sql" >/dev/null
psql "${psql_args[@]}" -f "$rollback" >/dev/null
query "$catalog" >"$cluster_root/rollback.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/rollback.catalog"
[[ "$(query "select to_regclass('public.provider_change_cancellations') is null")" == t ]]
printf 'GREEN empty rollback restores exact prior public function catalog and ACLs.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" --set=provider_cancel_retain=1 -f "$repo_root/tests/provider-change-cancel-schema.sql" >/dev/null
query "$catalog" >"$cluster_root/used-before.catalog"
if psql "${psql_args[@]}" -f "$rollback" >"$cluster_root/guard.log" 2>&1;then printf 'Rollback deleted retained cancellation history\n' >&2;exit 1;fi
rg -q rollback_provider_change_cancellation_in_use "$cluster_root/guard.log"
query "$catalog" >"$cluster_root/used-after.catalog"
cmp "$cluster_root/used-before.catalog" "$cluster_root/used-after.catalog"
printf 'GREEN actual rollback refuses retained cancellation history before DDL.\n'
query "begin read only;select public.read_provider_change_requests('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','joint-owner@example.test')->0->>'status';rollback" | rg -q '^cancelled$'
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >/dev/null
# Controlled real sessions pause cancellation after owner/current request locks.
query "create schema cancel_race_fixture;create function cancel_race_fixture.pause_cancel() returns trigger language plpgsql as \$\$begin if new.status='cancelled' and old.status<>'cancelled' then perform pg_advisory_xact_lock(2930031);end if;return new;end\$\$;create trigger cancel_race_timing before update on public.provider_change_requests for each row execute function cancel_race_fixture.pause_cancel()" >/dev/null
owner="d2940000-0000-4000-8000-000000000001"
business="d2940000-0000-4000-8000-000000000010"
old_agency="d2940000-0000-4000-8000-000000000020"
new_agency="d2940000-0000-4000-8000-000000000021"
for case_name in membership identity payer completion;do
 request_id="$(query "select public.request_provider_change('$business','$owner','joint-owner@example.test','$old_agency','race-$case_name')->>'id'")"
 cancel="select public.cancel_provider_change('$request_id','$owner','joint-owner@example.test')"
 query "set application_name='cancel_race_barrier';select pg_advisory_lock(2930031);select pg_sleep(20)" >"$cluster_root/barrier.log" 2>&1 & barrier_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_barrier' and wait_event='PgSleep')"
 query "set application_name='cancel_race_cancel';$cancel" >"$cluster_root/cancel.log" 2>&1 & cancel_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_cancel' and wait_event='advisory')"
 case "$case_name" in
 membership) challenge="update public.workspace_memberships set role='admin' where workspace_id='$business' and user_id='$owner'";;
 identity) challenge="update public.users set verified_at=null where id='$owner'";;
 payer) challenge="select * from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','$business','successorKind','business'),'$owner','joint-owner@example.test')";;
 completion) challenge="select public.complete_provider_change('$request_id','$owner','joint-owner@example.test')";;
 esac
 query "set application_name='cancel_race_challenge';$challenge" >"$cluster_root/challenge.log" 2>&1 & challenge_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_challenge' and wait_event_type='Lock')"
 query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='cancel_race_barrier'" >/dev/null
 wait "$barrier_pid" || true
 wait "$cancel_pid"
 if [[ "$case_name" == completion ]];then
  if wait "$challenge_pid";then printf 'Completion resurrected cancelled request\n' >&2;exit 1;fi
  rg -q provider_response_window_open "$cluster_root/challenge.log"
 else wait "$challenge_pid";fi
 [[ "$(query "select status='cancelled' from public.provider_change_requests where id='$request_id'")" == t ]]
 if [[ "$case_name" == membership ]];then query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null;fi
 if [[ "$case_name" == identity ]];then query "update public.users set verified_at=now() where id='$owner'" >/dev/null;fi
 printf 'GREEN cancellation-first %s race serialized; current request stayed cancelled.\n' "$case_name"
done
query "drop trigger cancel_race_timing on public.provider_change_requests;drop schema cancel_race_fixture cascade" >/dev/null
# Loss of current owner commits first: the delayed command must recheck the row.
request_id="$(query "select public.request_provider_change('$business','$owner','joint-owner@example.test','$old_agency','race-loss-first')->>'id'")"
query "set application_name='cancel_race_lossfirst';begin;update public.workspace_memberships set role='admin' where workspace_id='$business' and user_id='$owner';select pg_sleep(0.7);commit" >"$cluster_root/loss.log" 2>&1 & loss_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_lossfirst' and wait_event='PgSleep')"
query "set application_name='cancel_race_candidate';select public.cancel_provider_change('$request_id','$owner','joint-owner@example.test')" >"$cluster_root/loss-cancel.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_candidate' and wait_event_type='Lock')"
wait "$loss_pid"
if wait "$candidate_pid";then printf 'Stale owner cancellation accepted\n' >&2;exit 1;fi
rg -q provider_seat_owner_required "$cluster_root/loss-cancel.log"
[[ "$(query "select status='awaiting_policy' from public.provider_change_requests where id='$request_id'")" == t ]]
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null
printf 'GREEN owner-loss-first race denied delayed cancellation.\n'
# A policy is fictional only in this disposable cluster. Acknowledgement wins
# the request lock, so recovery must refuse the already clocked notice.
query "insert into public.provider_change_policy values('fictional-cancel-race',60,'$owner',now())" >/dev/null
query "set application_name='cancel_race_ackfirst';begin;select public.acknowledge_provider_change_notice('$request_id','d2940000-0000-4000-8000-000000000004','joint-new-agency-owner@example.test');select pg_sleep(0.7);commit" >"$cluster_root/ack.log" 2>&1 & ack_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_ackfirst' and wait_event='PgSleep')"
query "set application_name='cancel_race_candidate';select public.cancel_provider_change('$request_id','$owner','joint-owner@example.test')" >"$cluster_root/ack-cancel.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_race_candidate' and wait_event_type='Lock')"
wait "$ack_pid"
if wait "$candidate_pid";then printf 'Cancellation bypassed acknowledged notice\n' >&2;exit 1;fi
rg -q provider_change_stale "$cluster_root/ack-cancel.log"
[[ "$(query "select status='notified' and respond_by is not null from public.provider_change_requests where id='$request_id'")" == t ]]
printf 'GREEN acknowledgement-first race retains notice clock and rejects cancellation.\n'
printf 'Provider cancellation native, replay, READ ONLY, ACL, rollback/reapply and concurrency checks passed.\n'
