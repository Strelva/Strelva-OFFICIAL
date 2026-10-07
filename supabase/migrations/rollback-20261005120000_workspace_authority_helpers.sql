-- Rollback for 20261005120000_workspace_authority_helpers.sql
-- Forward SHA-256: 064946b96ce451c61801774b6a1ea026f24edb7335bade96187cf964f7fd7c78
-- Batch 1: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_role_allows(text,text)')))) is distinct from '8c30d8c8ab46c052475f2d4c71ebfab8' then raise exception 'rollback_wrong_order_or_function_drift: workspace_role_allows'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_require(uuid,uuid,text)')))) is distinct from '29670a77da8a74ada22c8437ce213621' then raise exception 'rollback_wrong_order_or_function_drift: workspace_require'; end if;
end;
$rollback_guard$;
drop function public.workspace_role_allows(text,text);
drop function public.workspace_require(uuid,uuid,text);
commit;
