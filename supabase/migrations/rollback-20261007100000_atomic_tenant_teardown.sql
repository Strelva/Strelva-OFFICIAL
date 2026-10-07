-- Rollback for 20261007100000_atomic_tenant_teardown.sql
-- Forward SHA-256: b406f6154f9f4e40d09974e96eeec99ff7c8e58759377f513436b0fca6ee72b4
-- Batch 2: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_teardown_tables()')))) is distinct from '5c87a47deff5226df2598667b2bb10a9' then raise exception 'rollback_wrong_order_or_function_drift: tenant_teardown_tables'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.deprovision_tenant_rows(text)')))) is distinct from '331019da6af226e48599f155854efed2' then raise exception 'rollback_wrong_order_or_function_drift: deprovision_tenant_rows'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_teardown_blockers(text)')))) is distinct from '9e1526b7062158a5a7d53def6ee0a6c0' then raise exception 'rollback_wrong_order_or_function_drift: tenant_teardown_blockers'; end if;
end;
$rollback_guard$;
drop function public.tenant_teardown_tables();
drop function public.deprovision_tenant_rows(text);
drop function public.tenant_teardown_blockers(text);
commit;
