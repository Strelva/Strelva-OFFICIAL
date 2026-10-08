#!/usr/bin/env bash
set -euo pipefail
# Owned disposable native database only. No external provider, conversion or policy selection.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-attribution strelva-attribution-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
assert_sql(){ local answer;answer="$(query "$1")" || { printf 'Assertion SQL failed: %s\n' "$1" >&2;exit 1; };if [[ "$answer" != t ]];then printf 'Assertion failed: %s (got %s)\n' "$1" "$answer" >&2;exit 1;fi; }
wait_sql(){ local answer;for ((attempt=0;attempt<250;attempt++));do answer="$(query "$1")" || exit 1;if [[ "$answer" == t ]];then return;fi;sleep 0.02;done;printf 'Barrier not reached: %s\n' "$1" >&2;exit 1; }
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
forward="$repo_root/supabase/migrations/20261020090033_business_attributions.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090033_business_attributions.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$migration" == "$forward" ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
sed -e 's/b2840000/b2830000/g' -e 's/attribution-/prior-attribution-/g' "$repo_root/tests/support/business-attribution-fixture.sql" > "$cluster_root/prior-provider.sql"
psql "${psql_args[@]}" -f "$cluster_root/prior-provider.sql" >/dev/null
# Source, signature, security, volatility, configuration and normalized complete ACL
# for every public function; empty rollback must restore the whole prior catalog.
catalog="select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',p.prosrc,'security',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
query "$catalog" > "$cluster_root/before.json"
psql "${psql_args[@]}" -f "$forward" >/dev/null
assert_sql "select count(*)=0 from public.business_attributions"
printf 'Populated prior operating provider upgraded without fabricated original attribution.\n'
# Deliberate later-wrapper drift must stop rollback, even when it still delegates.
query "create or replace function public.complete_provider_change(p_request_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as \$\$begin return public.complete_provider_change_before_attribution(p_request_id,p_user_id,p_verified_email);end\$\$" >/dev/null
if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/drift.log" 2>&1;then printf 'Rollback erased later wrapper\n' >&2;exit 1;fi
rg -q business_attribution_rollback_wrong_order "$cluster_root/drift.log"
# Restore just the owned exact wrapper from the migration; no deployed objects touched.
python3 - "$forward" "$cluster_root/wrapper.sql" <<'PY'
from pathlib import Path
import re,sys
s=Path(sys.argv[1]).read_text();body=re.search(r'create function public.complete_provider_change\(.*?\$\$;',s,re.S).group(0)
Path(sys.argv[2]).write_text(body.replace('create function','create or replace function',1))
PY
psql "${psql_args[@]}" -f "$cluster_root/wrapper.sql" >/dev/null
psql "${psql_args[@]}" -f "$rollback" >/dev/null
query "$catalog" > "$cluster_root/after.json"
cmp "$cluster_root/before.json" "$cluster_root/after.json"
assert_sql "select to_regclass('public.business_attributions') is null and to_regclass('public.business_attribution_endings') is null and to_regclass('public.business_attribution_change_permissions') is null"
printf 'Empty rollback restores every prior function source/security/ACL; wrapper drift rejected.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/business-attributions-schema.sql"
psql "${psql_args[@]}" -f "$repo_root/tests/money-apps-payer-connect-schema.sql"
psql "${psql_args[@]}" -f "$repo_root/tests/support/business-attribution-fixture.sql" >/dev/null
business=b2840000-0000-4000-8000-000000000010
owner=b2840000-0000-4000-8000-000000000001
agency=b2840000-0000-4000-8000-000000000021
email=attribution-owner@example.test
old_provider="$(query "select id from public.workspace_providers where customer_workspace_id='$business' and status='active'")"
record(){ printf "select public.record_business_attribution('%s','%s','%s','%s','referral','{\"kind\":\"owner_statement\",\"reference\":\"fictional race owner receipt\"}','%s','%s')" "$business" "$owner" "$email" "$agency" "$1" "$2"; }
read="select public.read_business_attributions('$business','$owner','$email')"
query "begin read only;set local role service_role;$read;commit" >/dev/null
query "create schema attribution_race_fixture;create function attribution_race_fixture.pause() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(16028401);return new;end\$\$;create trigger attribution_race_timing before insert on public.business_attributions for each row execute function attribution_race_fixture.pause()" >/dev/null
start_barrier(){ query "set application_name='attribution_barrier';select pg_advisory_lock(16028401);select pg_sleep(20)" > "$cluster_root/barrier.log" 2>&1 & barrier_pid=$!;wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_barrier' and wait_event='PgSleep')"; }
release_barrier(){ query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='attribution_barrier'" >/dev/null;wait "$barrier_pid" || true; }
start_barrier
query "set application_name='attribution_writer';$(record b2840000-0000-4000-8000-000000000040 "$old_provider")" > "$cluster_root/writer.log" 2>&1 & writer_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_writer' and wait_event='advisory')"
query "set application_name='attribution_demotion';update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner'" > "$cluster_root/demotion.log" 2>&1 & demotion_pid=$!
query "set application_name='attribution_verification';update public.users set verified_at=null where id='$owner'" > "$cluster_root/verification.log" 2>&1 & verification_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_demotion' and wait_event_type='Lock') and exists(select 1 from pg_stat_activity where application_name='attribution_verification' and wait_event_type='Lock')"
# Genuine reader sees the committed prior snapshot without touching writer locks.
query "begin read only;set local role service_role;$read;commit" >/dev/null
release_barrier
wait "$writer_pid";wait "$demotion_pid";wait "$verification_pid"
assert_sql "select count(*)=1 from public.business_attributions where business_workspace_id='$business'"
printf 'Writer-first: membership and verified identity cannot revoke through paused opening; reader remains genuinely READ ONLY.\n'
query "drop trigger attribution_race_timing on public.business_attributions;update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner';update public.users set verified_at=now() where id='$owner'" >/dev/null
for authority in membership verification;do
 if [[ "$authority" == membership ]];then revoke="update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner'";restore="update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'";else revoke="update public.users set verified_at=null where id='$owner'";restore="update public.users set verified_at=now() where id='$owner'";fi
 query "set application_name='attribution_revoke_first';begin;$revoke;select pg_sleep(0.7);commit" > "$cluster_root/revoke-first.log" 2>&1 & revoke_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_revoke_first' and wait_event='PgSleep')"
 query "set application_name='attribution_candidate';$(record b2840000-0000-4000-8000-000000000041 "$old_provider")" > "$cluster_root/candidate.log" 2>&1 & candidate_pid=$!
 wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_candidate' and wait_event_type='Lock')"
 wait "$revoke_pid"
 if wait "$candidate_pid";then cat "$cluster_root/candidate.log";exit 1;fi
 rg -q provider_seat_owner_required "$cluster_root/candidate.log"
 query "$restore" >/dev/null
 printf 'Revocation-first %s: waited writer rechecks and denies.\n' "$authority"
done
query "insert into public.provider_change_policy values('fictional-attribution-race-zero',0,'$owner',now())" >/dev/null
request_id="$(query "select public.request_provider_change('$business','$owner','$email','$agency','fictional-attribution-race-change',null)->>'id'")"
query "select public.acknowledge_provider_change_notice('$request_id','b2840000-0000-4000-8000-000000000002','attribution-agency@example.test');create trigger attribution_race_timing before insert on public.business_attribution_endings for each row execute function attribution_race_fixture.pause()" >/dev/null
complete="select public.complete_provider_change('$request_id','$owner','$email')"
# Completion must also recheck current membership after waiting.
query "set application_name='attribution_revoke_first';begin;update public.workspace_memberships set role='admin' where workspace_id='$business' and user_id='$owner';select pg_sleep(0.7);commit" > "$cluster_root/complete-revoke.log" 2>&1 & revoke_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_revoke_first' and wait_event='PgSleep')"
query "set application_name='attribution_candidate';$complete" > "$cluster_root/complete-denial.log" 2>&1 & candidate_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_candidate' and wait_event_type='Lock')"
wait "$revoke_pid";if wait "$candidate_pid";then exit 1;fi
rg -q provider_seat_owner_required "$cluster_root/complete-denial.log"
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner'" >/dev/null
start_barrier
query "set application_name='attribution_completion';$complete" > "$cluster_root/complete.log" 2>&1 & complete_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_completion' and wait_event='advisory')"
query "set application_name='attribution_competing_start';$(record b2840000-0000-4000-8000-000000000042 "$old_provider")" > "$cluster_root/start-stale.log" 2>&1 & start_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_competing_start' and wait_event_type='Lock')"
query "set application_name='attribution_demotion';update public.workspace_memberships set role='member' where workspace_id='$business' and user_id='$owner'" > "$cluster_root/complete-demotion.log" 2>&1 & demotion_pid=$!
wait_sql "select exists(select 1 from pg_stat_activity where application_name='attribution_demotion' and wait_event_type='Lock')"
query "begin read only;set local role service_role;$read;commit" >/dev/null
release_barrier
wait "$complete_pid";wait "$demotion_pid"
if wait "$start_pid";then exit 1;fi
rg -q 'business_attribution_provider_stale|provider_seat_owner_required' "$cluster_root/start-stale.log"
query "update public.workspace_memberships set role='owner' where workspace_id='$business' and user_id='$owner';drop trigger attribution_race_timing on public.business_attribution_endings;drop schema attribution_race_fixture cascade" >/dev/null
assert_sql "select count(*)=1 from public.business_attribution_endings"
assert_sql "select count(*)=0 from public.business_attribution_change_permissions"
query "begin read only;set local role service_role;$read;commit" >/dev/null
printf 'Completion/start race serializes; membership loss cannot pass ending; history reader remains READ ONLY.\n'
# Start after completed switch with exact new provider does not fabricate bringer.
new_provider="$(query "select id from public.workspace_providers where customer_workspace_id='$business' and status='active'")"
query "$(record b2840000-0000-4000-8000-000000000043 "$new_provider");$complete" >/dev/null
assert_sql "select (select count(*) from public.business_attribution_endings)=1 and (select count(*) from public.business_attributions)=2"
if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/populated-rollback.log" 2>&1;then printf 'Populated receipts erased\n' >&2;exit 1;fi
rg -q business_attribution_receipts_require_preservation "$cluster_root/populated-rollback.log"
assert_sql "select (select count(*) from public.business_attributions)=2 and (select count(*) from public.business_attribution_endings)=1"
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
printf 'Populated rollback refuses and preserves chain; native attribution proof completed.\n'
