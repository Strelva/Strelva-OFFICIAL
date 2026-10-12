#!/usr/bin/env bash
set -euo pipefail
# PREPARED, UNRUN. Parent-owned isolated superuser proof only; no bootstrap.
[[ "${STRELVA_REWARDS_DISPOSABLE_PROOF:-}" == 1 ]] || exit 2
mode="${1:-}";shift || true
[[ "$mode" == forward || "$mode" == inverse ]] || exit 2
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
proof_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/strelva-rewards-event-refusal.XXXXXX")"
psql_args=("$@" --no-psqlrc --set=ON_ERROR_STOP=1)
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
[[ "$(query "select (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_event_trigger where evtenabled<>'D') and not exists(select 1 from pg_roles where rolname in ('reward_tail_owner','reward_tail_member')) and to_regprocedure('public.reward_tail_fault()') is null")" == t ]] || exit 2
migration="$repo_root/supabase/migrations/20261022175000_reward_durable_mutations.sql"
if [[ "$mode" == inverse ]];then
 migration="$repo_root/supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql"
 [[ "$(query 'select count(*) from public.tenant_reward_mutations')" == 0 ]] || exit 2
 psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/baseline-catalog.log"
else
 [[ "$(query "select to_regclass('public.tenant_reward_mutations') is null and to_regprocedure('public.mutate_tenant_reward_record(text,text,jsonb)') is null and to_regprocedure('public.reward_record_native_fence()') is null and to_regprocedure('public.reward_record_canonical_json(jsonb)') is null and not exists(select 1 from pg_trigger where tgrelid='public.tenant_client_records'::regclass and tgname='reward_record_native_fence')")" == t ]] || exit 2
fi
query 'create role reward_tail_owner;create role reward_tail_member;' >/dev/null
# Raw snapshots intentionally bypass exact guards: injected drift must survive
# refusal unchanged, including owner/ACL/body/membership and the enabled hook.
snapshot(){ query "select jsonb_build_object('functions',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('reward_record_canonical_json','reward_record_native_fence','mutate_tenant_reward_record','reward_tail_fault')),'relations',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'tenant_reward_mutations%'),'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a where a.attrelid=to_regclass('public.tenant_reward_mutations')),'membership',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor) from pg_auth_members m where m.roleid='reward_tail_owner'::regrole or m.member='reward_tail_member'::regrole),'hooks',(select jsonb_agg(to_jsonb(e) order by e.oid) from pg_event_trigger e where e.evtname='reward_tail_fault_hook'),'fence',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t where t.tgrelid='public.tenant_client_records'::regclass and t.tgname='reward_record_native_fence'))"; }
for fault in acl body owner membership post_empty_owner;do
 case "$fault" in
  acl) mutation='grant execute on function public.mutate_tenant_reward_record(text,text,jsonb) to reward_tail_member;';;
  body) mutation='alter function public.mutate_tenant_reward_record(text,text,jsonb) stable;';;
  owner|post_empty_owner) mutation='alter function public.mutate_tenant_reward_record(text,text,jsonb) owner to reward_tail_owner;';;
  membership) mutation='grant reward_tail_owner to reward_tail_member;';;
 esac
 # The sql_drop hook models both the postvalidation shape DROP and an inverse
 # DROP TRIGGER after its empty-receipt check. It must be refused before either.
 cat >"$proof_dir/$fault-fixture.sql" <<'SQL'
create function public.reward_tail_fault() returns event_trigger language plpgsql as $fault$
begin
SQL
 if [[ "$fault" == post_empty_owner ]];then
  printf " if exists(select 1 from pg_event_trigger_dropped_objects() where object_name='reward_record_native_fence') then\n" >>"$proof_dir/$fault-fixture.sql"
 else
  printf " if exists(select 1 from pg_event_trigger_dropped_objects() where is_temporary and object_name='reward_mutation_catalog_shape') then\n" >>"$proof_dir/$fault-fixture.sql"
 fi
 printf '%s\n' "$mutation" >>"$proof_dir/$fault-fixture.sql"
 cat >>"$proof_dir/$fault-fixture.sql" <<'SQL'
 end if;
end $fault$;
create event trigger reward_tail_fault_hook on sql_drop execute function public.reward_tail_fault();
SQL
 psql "${psql_args[@]}" -f "$proof_dir/$fault-fixture.sql" >"$proof_dir/$fault-fixture.log"
 # Committed prior drift is a separate negative control: refusal cannot silently
 # restore it. Forward has no reward objects, so only membership is preinjected.
 if [[ "$mode" == inverse || "$fault" == membership ]];then query "$mutation" >"$proof_dir/$fault-prior-drift.log";fi
 snapshot >"$proof_dir/$fault-before.json"
 if psql "${psql_args[@]}" -f "$migration" >"$proof_dir/$fault-refusal.log" 2>&1;then printf 'Migration admitted enabled %s event hook.\n' "$fault" >&2;exit 1;fi
 rg -q 'rewards_unreviewed_event_trigger' "$proof_dir/$fault-refusal.log"
 snapshot >"$proof_dir/$fault-after.json"
 cmp "$proof_dir/$fault-before.json" "$proof_dir/$fault-after.json"
 # Teardown only our isolated fixture after preservation evidence. Failure leaves
 # the fixture/logs retained for parent inspection, never repairs admission state.
 query 'drop event trigger reward_tail_fault_hook;drop function public.reward_tail_fault();' >/dev/null
 if [[ "$mode" == inverse ]];then
  case "$fault" in
   acl) query 'revoke execute on function public.mutate_tenant_reward_record(text,text,jsonb) from reward_tail_member;' >/dev/null;;
   body) query 'alter function public.mutate_tenant_reward_record(text,text,jsonb) volatile;' >/dev/null;;
   owner|post_empty_owner) query "do \$\$begin execute format('alter function public.mutate_tenant_reward_record(text,text,jsonb) owner to %I',current_user);end \$\$;" >/dev/null;;
  esac
 fi
 if [[ "$fault" == membership ]];then query 'revoke reward_tail_owner from reward_tail_member;' >/dev/null;fi
 if [[ "$mode" == inverse ]];then psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$proof_dir/$fault-restored-catalog.log";fi
done
query 'drop role reward_tail_member;drop role reward_tail_owner;' >/dev/null
printf 'GREEN enabled late-tail/post-empty hooks refused; prior injected catalog/membership state preserved. Mode: %s Evidence: %s\n' "$mode" "$proof_dir"
