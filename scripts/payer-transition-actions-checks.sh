#!/usr/bin/env bash
# Sourced only by an owned disposable SQL harness: repo_root, psql_args and
# cluster_root come from that harness. No new connection or production action.
payer_forward="$repo_root/supabase/migrations/20261019114000_payer_transition_actions.sql"
payer_rollback="$repo_root/supabase/migrations/rollback-20261019114000_payer_transition_actions.sql"
payer_catalog() {
  psql "${psql_args[@]}" -Atc "select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),coalesce(p.proacl,acldefault('f',p.proowner))::text from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by p.oid::regprocedure::text"
}
payer_records() {
  psql "${psql_args[@]}" -At <<'SQL'
select 'transitions',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.workspace_payer_transitions t;
select 'accounts',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.accounts t;
select 'jobs',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.job_economics t;
select 'executions',md5(coalesce(jsonb_agg(to_jsonb(t) order by job_id,execution_key)::text,'')) from public.job_economics_executions t;
select 'allowances',md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.work_allowances t;
select 'reservations',md5(coalesce(jsonb_agg(to_jsonb(t) order by job_id,execution_key)::text,'')) from public.work_allowance_reservations t;
SQL
}
# Ordered-upgrade callers already installed v2. Begin from the untouched v1
# catalog so the actual rollback can prove exact restoration after populated use.
if [[ "$(psql "${psql_args[@]}" -Atc "select to_regprocedure('public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)') is not null")" == t ]]; then
  psql "${psql_args[@]}" --file="$payer_rollback" >/dev/null
fi
payer_catalog >"$cluster_root/payer-before.catalog"
psql "${psql_args[@]}" --file="$payer_forward" >/dev/null
payer_catalog >"$cluster_root/payer-forward.catalog"
psql "${psql_args[@]}" --file="$repo_root/tests/payer-transition-actions-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/payer-transition-actions-readonly.sql" >/dev/null
source "$repo_root/scripts/payer-transition-response-races.sh"
# Independent review fixture is a required part of this bounded proof.
psql "${psql_args[@]}" --file="$repo_root/tests/payer-transition-authority-adversarial-schema.sql" >/dev/null
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/payer-transition-actions-schema.sql" >/dev/null
payer_records >"$cluster_root/payer-records-before.txt"
# A later function configuration or ACL change must stop rollback, atomically.
psql "${psql_args[@]}" -c "alter function public.workspace_payer_transition_snapshot_v2(uuid,uuid,text) volatile" >/dev/null
if psql "${psql_args[@]}" --file="$payer_rollback" >"$cluster_root/payer-rollback-drift.log" 2>&1; then
  printf 'Payer rollback removed a changed successor.\n' >&2; exit 1
fi
grep -q 'payer_transition_actions_rollback_wrong_order_or_drift' "$cluster_root/payer-rollback-drift.log"
psql "${psql_args[@]}" -c "alter function public.workspace_payer_transition_snapshot_v2(uuid,uuid,text) stable" >/dev/null
psql "${psql_args[@]}" -c "grant execute on function public.workspace_payer_transition_inbox_v2(uuid,text) to authenticated" >/dev/null
if psql "${psql_args[@]}" --file="$payer_rollback" >"$cluster_root/payer-rollback-acl.log" 2>&1; then
  printf 'Payer rollback removed a permission-changed successor.\n' >&2; exit 1
fi
grep -q 'payer_transition_actions_rollback_wrong_order_or_drift' "$cluster_root/payer-rollback-acl.log"
psql "${psql_args[@]}" -c "revoke execute on function public.workspace_payer_transition_inbox_v2(uuid,text) from authenticated" >/dev/null
payer_catalog >"$cluster_root/payer-forward-restored.catalog"
diff -u "$cluster_root/payer-forward.catalog" "$cluster_root/payer-forward-restored.catalog"
psql "${psql_args[@]}" --file="$payer_rollback" >/dev/null
payer_catalog >"$cluster_root/payer-rolled-back.catalog"
diff -u "$cluster_root/payer-before.catalog" "$cluster_root/payer-rolled-back.catalog"
payer_records >"$cluster_root/payer-records-after-rollback.txt"
diff -u "$cluster_root/payer-records-before.txt" "$cluster_root/payer-records-after-rollback.txt"
psql "${psql_args[@]}" --file="$payer_forward" >/dev/null
payer_catalog >"$cluster_root/payer-reapplied.catalog"
diff -u "$cluster_root/payer-forward.catalog" "$cluster_root/payer-reapplied.catalog"
payer_records >"$cluster_root/payer-records-after-reapply.txt"
diff -u "$cluster_root/payer-records-before.txt" "$cluster_root/payer-records-after-reapply.txt"
psql "${psql_args[@]}" -Atc "select count(*)>0 and bool_and(not can_respond and not can_revoke) from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where status in ('accepted','rejected','stale','revoked')" | grep -qx t
printf 'Payer v2 projections: exact catalog rollback/reapply, retained commitments/costs, drift refusal and real READ ONLY authority passed.\n'
