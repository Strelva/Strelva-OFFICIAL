-- Restore the exact predecessor; reject later claimant drift.
-- Restores the predecessor's weaker operator refusal. Keep owner-decision
-- writes disabled if this prepared rollback is ever authorized.
begin;
set local lock_timeout='3s';
do $restore$
declare original text; expected text;
begin
  select definition,after_hash into original,expected from release_rollback_baseline.owner_decision_operator_refusal where singleton;
  if original is null or expected is distinct from md5(pg_get_functiondef('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)'::regprocedure)) then
    raise exception 'rollback_wrong_order_or_function_drift: owner_decision_operator_refusal';
  end if;
  execute original;
end;
$restore$;
drop table release_rollback_baseline.owner_decision_operator_refusal;
commit;
