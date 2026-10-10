-- Rollback for 20261008161000_release_flags_agency_workspaces.sql
-- Forward SHA-256: 35f78a9c041a4094b1ed4158fd062543e21927bf1c160cbfd07be8ab9ee8b9ae
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_assert_workspace(uuid)')))) is distinct from 'a8320f23cf5d138cfce8f58de79b6b76' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_assert_workspace'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.workspace_release_assert_workspace(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
end;
$function$
;
revoke all on function public.workspace_release_assert_workspace(uuid) from public, anon, authenticated, service_role;
commit;
