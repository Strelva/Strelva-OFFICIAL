-- Rollback for 20261008140000_tenant_lead_reads.sql
-- Forward SHA-256: 5cdabdf1ca0b64e3c28c5a012b9ab548a6592855582f43fcedd318ad2f301381
-- Batch 5: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_lead(text,text)')))) is distinct from 'fd8e045a8a21bb2ff8ccb2578e71125e' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_lead'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_lead_digests(text,timestamp with time zone)')))) is distinct from '133bda9c277dcb4bf3b88f981f100dbb' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_lead_digests'; end if;
end;
$rollback_guard$;
drop function public.read_tenant_lead(text,text);
drop function public.read_tenant_lead_digests(text,timestamp with time zone);
commit;
