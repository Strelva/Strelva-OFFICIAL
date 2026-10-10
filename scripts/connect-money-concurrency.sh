#!/usr/bin/env bash
# Sourced only by the throwaway upgrade runner after its committed native fixture.
connect_recovery_query="select public.authorize_split_recovery((select id from public.split_payouts),(select id from public.revenue_splits where event_key='recovery-final-restored' and beneficiary_kind='agency'),'a2830000-0000-4000-8000-000000000001','money-owner@example.test',50,'approved-test-profile'"
psql "${psql_args[@]}" -c "begin; $connect_recovery_query,'concurrent-recovery-a'); select pg_sleep(0.4); commit;" > "$cluster_root/recovery-a.log" 2>&1 &
connect_recovery_a=$!
psql "${psql_args[@]}" -c "begin; $connect_recovery_query,'concurrent-recovery-b'); select pg_sleep(0.4); commit;" > "$cluster_root/recovery-b.log" 2>&1 &
connect_recovery_b=$!
connect_recovery_success=0
if wait "$connect_recovery_a"; then connect_recovery_success=$((connect_recovery_success+1)); fi
if wait "$connect_recovery_b"; then connect_recovery_success=$((connect_recovery_success+1)); fi
if [[ "$connect_recovery_success" != 1 ]] || ! rg -q 'recovery_entitlement_overdraw' "$cluster_root/recovery-a.log" "$cluster_root/recovery-b.log"; then
 cat "$cluster_root/recovery-a.log" "$cluster_root/recovery-b.log" >&2
 exit 1
fi
psql "${psql_args[@]}" -c "do \$\$begin if (select count(*) from public.split_recovery_payouts where idempotency_key like 'concurrent-recovery-%')<>1 then raise exception 'concurrent recovery overdraw';end if;end;\$\$;" >/dev/null
psql "${psql_args[@]}" -c "select public.record_money_reconciliation_issue('platform','evt_ConcurrentReview','invoice.paid','concurrent_review','in_Concurrent');" >/dev/null
connect_review_query="select public.resolve_money_reconciliation('a2830000-0000-4000-8000-000000000001','money-owner@example.test','platform','evt_ConcurrentReview','concurrent_review','no_effect_after_review'"
psql "${psql_args[@]}" -c "begin; $connect_review_query,'Provider fixture reviewed, first conclusion.'); select pg_sleep(0.4); commit;" > "$cluster_root/review-a.log" 2>&1 &
connect_review_a=$!
psql "${psql_args[@]}" -c "begin; $connect_review_query,'Provider fixture reviewed, second conclusion.'); select pg_sleep(0.4); commit;" > "$cluster_root/review-b.log" 2>&1 &
connect_review_b=$!
connect_review_success=0
if wait "$connect_review_a"; then connect_review_success=$((connect_review_success+1)); fi
if wait "$connect_review_b"; then connect_review_success=$((connect_review_success+1)); fi
if [[ "$connect_review_success" != 1 ]] || ! rg -q 'money_reconciliation_resolution_conflict' "$cluster_root/review-a.log" "$cluster_root/review-b.log"; then
 cat "$cluster_root/review-a.log" "$cluster_root/review-b.log" >&2
 exit 1
fi
printf 'Concurrent recovery cap and immutable operator resolution proofs passed.\n'
