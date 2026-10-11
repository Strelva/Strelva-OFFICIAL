-- Rollback for 20261008131000_make_real_live.sql
-- Forward SHA-256: d8dfd70362db7e903e509d73ad279c9a9ffc5dc0076cf96c945da3e0cd82e197
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_flag_names()')))) is distinct from '2677ae340ccda805070b2fb8c2830104' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_flag_names'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_ready_system_possibilities(uuid)')))) is distinct from 'a4c44dd43a5651d8b5a8bf60a580dc35' then raise exception 'rollback_wrong_order_or_function_drift: read_ready_system_possibilities'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.due_make_real_activations(integer,integer)')))) is distinct from 'ae8adf9ff97e76f4eb8f850fdc3dbb4d' then raise exception 'rollback_wrong_order_or_function_drift: due_make_real_activations'; end if;
end;
$rollback_guard$;
drop function public.read_ready_system_possibilities(uuid);
drop function public.due_make_real_activations(integer,integer);
CREATE OR REPLACE FUNCTION public.workspace_release_flag_names()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems']::text[]
$function$
;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated, service_role;
grant execute on function public.workspace_release_flag_names() to "service_role";
commit;
