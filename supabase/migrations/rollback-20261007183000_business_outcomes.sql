-- Rollback for 20261007183000_business_outcomes.sql
-- Forward SHA-256: 719e167fa123c8a68ed4bd2809a9b11706beba397d82acd6608c4d901fded9cf
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_outcome_month(uuid,uuid,text,date)')))) is distinct from '47b866316289107c502feba1821342eb' then raise exception 'rollback_wrong_order_or_function_drift: business_outcome_month'; end if;
end;
$rollback_guard$;
drop function public.business_outcome_month(uuid,uuid,text,date);
commit;
