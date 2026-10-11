#!/usr/bin/env bash
set -euo pipefail
# #287: actual fictional maintenance commands, retained history and controlled
# sessions. No commercial rates selected; no provider calls or shared database.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-maintenance-identity strelva-maintenance-identity-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
forward="$repo_root/supabase/migrations/20261020090035_creator_maintenance_identity.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090035_creator_maintenance_identity.sql"
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
wait_sql(){ for ((attempt=0;attempt<200;attempt++));do if [[ "$(query "$1")" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$migration" == "$forward" ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
# Before the new wrapper, exercise and retain the original approved takeover /
# bounded tapered terms, native installation/source, payer, prior/loss receipts.
psql "${psql_args[@]}" --set=creator_maintenance_retain=1 -f "$repo_root/tests/money-apps-creator-quote-ledger-schema.sql" >/dev/null
catalog="select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1"
rows="select id||'|'||md5(to_jsonb(t)::text) from public.creator_royalty_terms t order by 1"
query "$catalog" >"$cluster_root/before.catalog"
query "$rows" >"$cluster_root/before.rows"
provenance="select 'listing|'||id||'|'||md5(to_jsonb(t)::text) from public.creator_listings t union all select 'install|'||id||'|'||md5(to_jsonb(t)::text) from public.offering_installations t union all select 'split|'||id||'|'||md5(to_jsonb(t)::text) from public.revenue_splits t union all select 'payer-source|'||invoice_line_id||'|'||md5(to_jsonb(t)::text) from public.invoice_split_sources t order by 1"
query "$provenance" >"$cluster_root/before.provenance"
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >/dev/null
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
# Rehearse actual inverse refusal for ACL drift without persisting the drift.
if psql "${psql_args[@]}" >"$cluster_root/acl-guard.log" 2>&1 <<SQL
begin;
grant execute on function public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz) to service_role;
\i $rollback
SQL
then printf 'Rollback accepted private helper ACL drift\n' >&2;exit 1;fi
rg -q creator_maintenance_identity_function_drift "$cluster_root/acl-guard.log"
printf 'GREEN actual inverse refuses private helper ACL drift before DDL.\n'
psql "${psql_args[@]}" -f "$rollback" >/dev/null
query "$catalog" >"$cluster_root/rollback.catalog"
query "$rows" >"$cluster_root/rollback.rows"
cmp "$cluster_root/before.catalog" "$cluster_root/rollback.catalog"
cmp "$cluster_root/before.rows" "$cluster_root/rollback.rows"
printf 'GREEN populated baseline rollback restores exact prior function catalog/ACL and original maintenance history.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
query "create schema maintenance_race_fixture;create function maintenance_race_fixture.pause_insert() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(2870035);return new;end\$\$;create trigger maintenance_race_timing before insert on public.creator_royalty_terms for each row execute function maintenance_race_fixture.pause_insert()" >/dev/null
actor='cd161600-0000-4000-8000-000000000003'
agency='cd161600-0000-4000-8000-000000000020'
listing="$(query "select id from public.creator_listings where definition_id='private_staff_requests'")"
effective="$(query "select now()+interval '10 days'")"
command="select public.record_creator_royalty_maintenance('$listing','$actor','mcq-operator@example.test','creator','fictional-seam-royalty','fictional-seam-rate-reference','$effective')"
# Writer first: the admission must hold both verified identity and manager seat
# until the immutable INSERT (or exact replay) completes.
for case_name in identity membership;do
 query "set application_name='maintenance_race_barrier';select pg_advisory_lock(2870035);select pg_sleep(20)" >"$cluster_root/barrier.log" 2>&1 & barrier_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='maintenance_race_barrier' and wait_event='PgSleep')"
 query "set application_name='maintenance_race_writer';$command" >"$cluster_root/writer.log" 2>&1 & writer_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='maintenance_race_writer' and wait_event='advisory')"
 if [[ "$case_name" == identity ]];then loss="update public.users set verified_at=null where id='$actor'";else loss="update public.workspace_memberships set role='member' where workspace_id='$agency' and user_id='$actor'";fi
 query "set application_name='maintenance_race_loss';$loss" >"$cluster_root/loss.log" 2>&1 & loss_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='maintenance_race_loss' and wait_event_type='Lock')"
 query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='maintenance_race_barrier'" >/dev/null
 wait "$barrier_pid" || true
 wait "$writer_pid"
 wait "$loss_pid"
 if query "$command" >"$cluster_root/replay-denied.log" 2>&1;then printf 'Maintenance replay admitted lost %s\n' "$case_name" >&2;exit 1;fi
 rg -q connect_denied "$cluster_root/replay-denied.log"
 if [[ "$case_name" == identity ]];then query "update public.users set verified_at=now() where id='$actor'" >/dev/null;else query "update public.workspace_memberships set role='owner' where workspace_id='$agency' and user_id='$actor'" >/dev/null;fi
 printf 'GREEN writer-first %s race waits; committed loss denies exact replay.\n' "$case_name"
done
query "drop trigger maintenance_race_timing on public.creator_royalty_terms;drop schema maintenance_race_fixture cascade" >/dev/null
# Loss first: hold the updated current row; delayed exact replay waits and then
# observes the committed loss. No missing/deleted authority or super-admin bypass.
for case_name in identity membership;do
 if [[ "$case_name" == identity ]];then loss="update public.users set verified_at=null where id='$actor'";else loss="update public.workspace_memberships set role='member' where workspace_id='$agency' and user_id='$actor'";fi
 query "set application_name='maintenance_race_lossfirst';begin;$loss;select pg_sleep(0.7);commit" >"$cluster_root/lossfirst.log" 2>&1 & loss_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='maintenance_race_lossfirst' and wait_event='PgSleep')"
 query "set application_name='maintenance_race_replay';$command" >"$cluster_root/delayed.log" 2>&1 & replay_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='maintenance_race_replay' and wait_event_type='Lock')"
 wait "$loss_pid"
 if wait "$replay_pid";then printf 'Lost %s admitted delayed maintenance replay\n' "$case_name" >&2;exit 1;fi
 rg -q connect_denied "$cluster_root/delayed.log"
 if [[ "$case_name" == identity ]];then query "update public.users set verified_at=now() where id='$actor'" >/dev/null;else query "update public.workspace_memberships set role='owner' where workspace_id='$agency' and user_id='$actor'" >/dev/null;fi
 printf 'GREEN %s-loss-first delayed exact replay denied.\n' "$case_name"
done
[[ "$(query "select count(*)=1 from public.creator_royalty_terms where listing_id='$listing' and effective_from='$effective'")" == t ]]
query "$command" >/dev/null
# Private delegation cannot bypass the new service-only supplied-actor boundary.
[[ "$(query "select not has_function_privilege('service_role','public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)','execute') and not has_function_privilege('authenticated','public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz)','execute')")" == t ]]
query "$catalog" >"$cluster_root/used-before.catalog"
query "$rows" >"$cluster_root/used-before.rows"
if psql "${psql_args[@]}" -f "$rollback" >"$cluster_root/guard.log" 2>&1;then printf 'Rollback removed identity protection around new history\n' >&2;exit 1;fi
rg -q creator_maintenance_identity_history_preservation_required "$cluster_root/guard.log"
query "$catalog" >"$cluster_root/used-after.catalog"
query "$rows" >"$cluster_root/used-after.rows"
cmp "$cluster_root/used-before.catalog" "$cluster_root/used-after.catalog"
cmp "$cluster_root/used-before.rows" "$cluster_root/used-after.rows"
# All pre-wrapper terms are preserved byte for byte after every command/race.
[[ "$(query "select not exists(select 1 from release_rollback_baseline.creator_maintenance_identity_terms b left join public.creator_royalty_terms t on t.id=b.id where t.id is null or b.receipt_hash<>md5(to_jsonb(t)::text))")" == t ]]
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >/dev/null
query "$provenance" >"$cluster_root/after.provenance"
cmp "$cluster_root/before.provenance" "$cluster_root/after.provenance"
printf 'GREEN used rollback refuses new terms before DDL and keeps original creator/history and service-only ACLs.\n'
printf 'Creator maintenance exact identity, original future eligibility, READ ONLY, populated inverse/reapply and controlled race proof passed.\n'
