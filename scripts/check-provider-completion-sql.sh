#!/usr/bin/env bash
set -euo pipefail
# Local native SQL and actual concurrent sessions. No external policy or provider operation.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-provider-completion strelva-provider-completion-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
assert_sql(){ local answer;answer="$(query "$1")" || exit 1;if [[ "$answer" != t ]];then printf 'Assertion failed: %s (%s)\n' "$1" "$answer";exit 1;fi; }
wait_sql(){ local answer;for ((attempt=0;attempt<250;attempt++));do answer="$(query "$1")" || exit 1;if [[ "$answer" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1";exit 1; }
forward="$repo_root/supabase/migrations/20261020090037_provider_completion_cleanup.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090037_provider_completion_cleanup.sql"
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$migration" == "$forward" ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
catalog="select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',p.prosrc,'security',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
query "$catalog" > "$cluster_root/before.json"
psql "${psql_args[@]}" -f "$forward" >/dev/null
# Bind all public wrappers and private predecessors, including ACL/security/config.
assert_sql "select count(*)=21 from public.provider_completion_rollback_state"
expect_drift(){
 if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/drift-$1.log" 2>&1;then printf 'Function drift erased: %s\n' "$1";exit 1;fi
 rg -q provider_completion_rollback_wrong_order "$cluster_root/drift-$1.log"
}
restore_function(){ query "do \$\$begin execute(select definition from public.provider_completion_rollback_state where signature='$1');end\$\$" >/dev/null; }
query "create or replace function public.cancel_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as \$\$begin return public.cancel_provider_change_before_completion_cleanup(p_request_id,p_user_id,p_verified_email);end\$\$" >/dev/null
expect_drift public-body
restore_function 'cancel_provider_change(uuid,uuid,text)'
query "grant execute on function public.cancel_provider_change(uuid,uuid,text) to anon" >/dev/null
expect_drift public-acl
query "revoke execute on function public.cancel_provider_change(uuid,uuid,text) from anon" >/dev/null
query "grant execute on function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) to service_role" >/dev/null
expect_drift private-acl
query "revoke execute on function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) from service_role" >/dev/null
query "do \$\$begin execute replace((select definition from public.provider_completion_rollback_state where signature='cancel_provider_change_before_completion_cleanup(uuid,uuid,text)'), 'begin', E'begin\\n-- later private predecessor drift');end\$\$" >/dev/null
expect_drift private-body
restore_function 'cancel_provider_change_before_completion_cleanup(uuid,uuid,text)'
query "alter function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) security invoker" >/dev/null
expect_drift private-security
restore_function 'cancel_provider_change_before_completion_cleanup(uuid,uuid,text)'
query "alter function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) set search_path=public" >/dev/null
expect_drift private-config
restore_function 'cancel_provider_change_before_completion_cleanup(uuid,uuid,text)'
printf 'Full rollback fingerprints refuse public/private body, ACL, security and configuration drift.\n'
psql "${psql_args[@]}" -f "$rollback" >/dev/null
query "$catalog" > "$cluster_root/after.json"
cmp "$cluster_root/before.json" "$cluster_root/after.json"
assert_sql "select to_regclass('public.provider_completion_rollback_state') is null and to_regclass('public.provider_completion_cleanup_receipts') is null and to_regclass('public.provider_exit_completion_permissions') is null and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_attribution_endings' and column_name='workspace_exit_request_id')"
printf '37 empty rollback restores exact prior public function source/security/ACL and ending schema.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
# Inverse-first holds table locks through its guard; a real command cannot insert.
# Separate owned template clone keeps fixture-only selected policy out of all other tests.
query "create database provider_completion_inverse_fixture template postgres" >/dev/null
psql_args[3]=--dbname=provider_completion_inverse_fixture
sed 's/b2840000/b2843700/g;s/attribution-/inverse-/g' "$repo_root/tests/support/business-attribution-fixture.sql" > "$cluster_root/inverse-seed.sql"
psql "${psql_args[@]}" -f "$cluster_root/inverse-seed.sql" >/dev/null
inverse_business=b2843700-0000-4000-8000-000000000010
inverse_owner=b2843700-0000-4000-8000-000000000001
query "insert into public.provider_change_policy values('fixture-inverse-zero',0,'$inverse_owner',now())" >/dev/null
inverse_request="$(query "select public.request_provider_change('$inverse_business','$inverse_owner','inverse-owner@example.test','b2843700-0000-4000-8000-000000000021','fixture-inverse-first',null)->>'id'")"
query "select public.acknowledge_provider_change_notice('$inverse_request','b2843700-0000-4000-8000-000000000002','inverse-agency@example.test')" >/dev/null
python3 - "$rollback" "$cluster_root/inverse-first.sql" <<'PY2'
from pathlib import Path
import sys
s=Path(sys.argv[1]).read_text().replace('end $$;','end $$;\nset application_name=\'inverse_after_guard\';select pg_sleep(0.7);',1)
Path(sys.argv[2]).write_text(s)
PY2
psql "${psql_args[@]}" -f "$cluster_root/inverse-first.sql" > "$cluster_root/inverse-first.log" 2>&1 & inverse_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='inverse_after_guard' and wait_event='PgSleep')"
query "set application_name='writer_after_inverse';set lock_timeout='200ms';select public.complete_provider_change('$inverse_request','$inverse_owner','inverse-owner@example.test')" > "$cluster_root/writer-after-inverse.log" 2>&1 & blocked_writer_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='writer_after_inverse' and wait_event_type='Lock')"
if wait "$blocked_writer_pid";then printf 'Writer entered inverse locked tables\n';exit 1;fi
rg -q 'lock timeout' "$cluster_root/writer-after-inverse.log"
wait "$inverse_pid"
assert_sql "select to_regclass('public.provider_completion_cleanup_receipts') is null"
assert_sql "select status='notified' from public.provider_change_requests where id='$inverse_request'"
# Inverse completion restores every prior function exactly even with real seed rows.
query "$catalog" > "$cluster_root/inverse-first-after.json"
cmp "$cluster_root/before.json" "$cluster_root/inverse-first-after.json"
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql_args[3]=--dbname=postgres
query "drop database provider_completion_inverse_fixture" >/dev/null
printf 'Inverse-first blocks actual provider completion before receipt insertion and restores the exact catalog.\n'
psql "${psql_args[@]}" -f "$repo_root/tests/support/provider-completion-other-business.sql" >/dev/null
for fixture in provider-completion-website-schema provider-completion-application-schema provider-completion-exit-schema business-attributions-schema money-apps-payer-connect-schema;do
 psql "${psql_args[@]}" -f "$repo_root/tests/$fixture.sql"
done
# Exact 31 cancellation vs 33 completion order, on a current original AOR.
psql "${psql_args[@]}" -f "$repo_root/tests/support/business-attribution-fixture.sql" >/dev/null
business=b2840000-0000-4000-8000-000000000010
owner=b2840000-0000-4000-8000-000000000001
email=attribution-owner@example.test
old_agency=b2840000-0000-4000-8000-000000000020
new_agency=b2840000-0000-4000-8000-000000000021
old_provider="$(query "select id from public.workspace_providers where customer_workspace_id='$business' and status='active'")"
query "select public.record_business_attribution('$business','$owner','$email','$new_agency','referral','{\"kind\":\"owner_statement\",\"reference\":\"fictional original bringer before switch\"}','b2840000-0000-4000-8000-000000000071','$old_provider')" >/dev/null
request_id="$(query "select public.request_provider_change('$business','$owner','$email','$new_agency','fixture-completion-lock-order',null)->>'id'")"
start_barrier(){ query "set application_name='completion_barrier';select pg_advisory_lock(160293001);select pg_sleep(20)" > "$cluster_root/barrier.log" 2>&1 & barrier_pid=$!;wait_sql "select exists(select 1 from pg_stat_activity where application_name='completion_barrier' and wait_event='PgSleep')"; }
release_barrier(){ query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='completion_barrier'" >/dev/null;wait "$barrier_pid" || true; }
start_barrier
# Stage precisely the owner/workspace premise locks that actual completion uses.
query "set application_name='completion_first';begin;select public.provider_seat_assert_owner('$business','$owner','$email');select pg_advisory_xact_lock(160293001);select public.complete_provider_change('$request_id','$owner','$email');commit" > "$cluster_root/complete-order.log" 2>&1 & complete_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='completion_first' and wait_event='advisory')"
query "set application_name='cancel_second';select public.cancel_provider_change('$request_id','$owner','$email')" > "$cluster_root/cancel-order.log" 2>&1 & cancel_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_second' and wait_event='advisory')"
release_barrier
if wait "$complete_pid";then printf 'Undecided notice completion succeeded\n';exit 1;fi
wait "$cancel_pid"
rg -q provider_response_window_open "$cluster_root/complete-order.log"
if rg -q 'deadlock detected' "$cluster_root/complete-order.log" "$cluster_root/cancel-order.log";then exit 1;fi
assert_sql "select status='cancelled' from public.provider_change_requests where id='$request_id'"
assert_sql "select count(*)=0 from public.business_attribution_endings"
assert_sql "select count(*)=0 from public.provider_completion_cleanup_receipts"
printf 'GREEN prior lock reversal: cancellation waits before q, then succeeds after premature completion denies; no deadlock or ending.\n'
# Actual cancellation-first barrier before immutable receipt insert.
query "create schema provider_completion_fixture;create function provider_completion_fixture.pause() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(160293001);return new;end\$\$;create trigger completion_cancel_timing before insert on public.provider_change_cancellations for each row execute function provider_completion_fixture.pause()" >/dev/null
second_id="$(query "select public.request_provider_change('$business','$owner','$email','$new_agency','fixture-cancel-wins',null)->>'id'")"
start_barrier
query "set application_name='cancel_first';select public.cancel_provider_change('$second_id','$owner','$email')" > "$cluster_root/cancel-first.log" 2>&1 & cancel_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_first' and wait_event='advisory')"
query "set application_name='complete_second';select public.complete_provider_change('$second_id','$owner','$email')" > "$cluster_root/complete-second.log" 2>&1 & complete_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='complete_second' and wait_event='advisory')"
release_barrier
wait "$cancel_pid";if wait "$complete_pid";then exit 1;fi
rg -q provider_response_window_open "$cluster_root/complete-second.log"
assert_sql "select count(*)=0 from public.business_attribution_endings"
query "drop trigger completion_cancel_timing on public.provider_change_cancellations" >/dev/null
printf 'Cancellation-first serializes with completion and preserves original AOR/operating provider.\n'
# Fixture-only zero window, actual notice ack; never an adopted default.
query "insert into public.provider_change_policy values('fixture-completion-zero',0,'$owner',now())" >/dev/null
third_id="$(query "select public.request_provider_change('$business','$owner','$email','$new_agency','fixture-complete-wins',null)->>'id'")"
query "select public.acknowledge_provider_change_notice('$third_id','b2840000-0000-4000-8000-000000000002','attribution-agency@example.test');create trigger completion_cleanup_timing before insert on public.provider_completion_cleanup_receipts for each row execute function provider_completion_fixture.pause()" >/dev/null
start_barrier
query "set application_name='complete_first';select public.complete_provider_change('$third_id','$owner','$email')" > "$cluster_root/complete-first.log" 2>&1 & complete_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='complete_first' and wait_event='advisory')"
query "set application_name='cancel_wait';select public.cancel_provider_change('$third_id','$owner','$email')" > "$cluster_root/cancel-wait.log" 2>&1 & cancel_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='cancel_wait' and wait_event='advisory')"
query "begin read only;set local role service_role;select public.read_business_attributions('$business','$owner','$email');select public.read_provider_change_requests('$business','$owner','$email');commit" >/dev/null
# A rollback arriving after this real writer waits for its provider/receipt locks.
PGAPPNAME=inverse_after_writer psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/inverse-after-writer.log" 2>&1 & inverse_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='inverse_after_writer' and wait_event_type='Lock')"
release_barrier
wait "$complete_pid";if wait "$cancel_pid";then exit 1;fi
if wait "$inverse_pid";then printf 'Writer-first receipt erased\n';exit 1;fi
rg -q provider_completion_receipts_require_preservation "$cluster_root/inverse-after-writer.log"
printf 'Writer-first genuine completion commits; inverse refuses and preserves cleanup/ending.\n'
rg -q provider_change_stale "$cluster_root/cancel-wait.log"
assert_sql "select count(*)=1 from public.business_attribution_endings"
assert_sql "select count(*)=1 from public.provider_completion_cleanup_receipts"
printf 'Completion-first serializes cancellation; exact AOR ending and cleanup are durable, readers stay READ ONLY.\n'
# Exit revocation current-owner role loss: lock-first withdrawal must deny.
query "set application_name='exit_revoke_first';begin;update public.workspace_memberships set role='admin' where workspace_id='$business' and user_id='$owner';select pg_sleep(0.7);commit" > "$cluster_root/exit-role.log" 2>&1 & demote_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='exit_revoke_first' and wait_event='PgSleep')"
exit_command="select public.complete_workspace_exit('$business','$owner','$email','cancel','revoke','{\"kind\":\"stop\"}','fixture-owned-exit',repeat('f',64))"
query "set application_name='exit_candidate';$exit_command" > "$cluster_root/exit-denied.log" 2>&1 & exit_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='exit_candidate' and wait_event_type='Lock')"
wait "$demote_pid";if wait "$exit_pid";then exit 1;fi
rg -q workspace_exit_denied "$cluster_root/exit-denied.log"
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null
new_provider="$(query "select id from public.workspace_providers where customer_workspace_id='$business' and status='active'")"
query "select public.record_business_attribution('$business','$owner','$email','$old_agency','signup','{\"kind\":\"owner_statement\",\"reference\":\"explicit later statement before exit\"}','b2840000-0000-4000-8000-000000000072','$new_provider')" >/dev/null
start_barrier
query "set application_name='exit_first';$exit_command" > "$cluster_root/exit-first.log" 2>&1 & exit_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='exit_first' and wait_event='advisory')"
query "set application_name='exit_demotion';update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner'" > "$cluster_root/exit-demotion.log" 2>&1 & demote_pid=$!
query "set application_name='exit_verification';update public.users set verified_at=null where id='$owner'" > "$cluster_root/exit-verification.log" 2>&1 & verify_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='exit_demotion' and wait_event_type='Lock') and exists(select 1 from pg_stat_activity where application_name='exit_verification' and wait_event_type='Lock')"
query "begin read only;set local role service_role;select public.read_business_attributions('$business','$owner','$email');commit" >/dev/null
PGAPPNAME=inverse_after_exit psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/inverse-after-exit.log" 2>&1 & inverse_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='inverse_after_exit' and wait_event_type='Lock')"
release_barrier
wait "$exit_pid";wait "$demote_pid";wait "$verify_pid"
if wait "$inverse_pid";then printf 'Genuine exit ending erased\n';exit 1;fi
rg -q provider_completion_receipts_require_preservation "$cluster_root/inverse-after-exit.log"
printf 'Writer-first genuine exit commits; inverse refuses and preserves its real-origin ending.\n'
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner';update public.users set verified_at=now() where id='$owner';drop trigger completion_cleanup_timing on public.provider_completion_cleanup_receipts;drop schema provider_completion_fixture cascade" >/dev/null
assert_sql "select count(*)=2 from public.business_attribution_endings"
assert_sql "select count(*)=2 from public.provider_completion_cleanup_receipts"
assert_sql "select count(*)=0 from public.workspace_providers where customer_workspace_id='$business' and status='active'"
assert_sql "select count(*)=0 from public.provider_exit_completion_permissions"
query "begin read only;set local role service_role;select public.read_business_attributions('$business','$owner','$email');commit" >/dev/null
query "select public.read_business_attributions('$business','$owner','$email')" > "$cluster_root/history.json"
node --import tsx -e 'const fs=require("node:fs"); const {businessAttributionHistorySchema}=require(process.argv[1]); businessAttributionHistorySchema.parse(JSON.parse(fs.readFileSync(process.argv[2],"utf8"))); process.stdout.write("Actual native change/exit history passes the same strict API receipt schema.\n");' "$repo_root/src/platform/connect/attributions.ts" "$cluster_root/history.json"
printf 'Owner exit-revoke is genuine, identity/membership remain locked through effects; original bringer gets exact exit ending.\n'
if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/populated-rollback.log" 2>&1;then printf 'Populated cleanup erased\n';exit 1;fi
rg -q provider_completion_receipts_require_preservation "$cluster_root/populated-rollback.log"
assert_sql "select count(*)=2 from public.provider_completion_cleanup_receipts"
assert_sql "select not has_table_privilege('service_role','public.provider_completion_rollback_state','SELECT') and not has_table_privilege('service_role','public.provider_exit_completion_permissions','INSERT') and not has_function_privilege('service_role','public.complete_workspace_exit_before_completion_cleanup(uuid,uuid,text,text,text,jsonb,text,text,text)','EXECUTE')"
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
printf 'Literal provider completion/exit cleanup, cancellation races, private ACL, READ ONLY and guarded rollback proof passed.\n'
