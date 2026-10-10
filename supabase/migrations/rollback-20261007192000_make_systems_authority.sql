-- Rollback for 20261007192000_make_systems_authority.sql
-- Forward SHA-256: 662552f6b7845f76c3ed71a6f92a1688f54c41a8b6db3d3a09e3bc80d7c3ad97
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_role_allows(text,text)')))) is distinct from '2db257b7346cdbeb0b59e64bdd30b45d' then raise exception 'rollback_wrong_order_or_function_drift: workspace_role_allows'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_require_make_systems(uuid,uuid)')))) is distinct from '8d8b5ca6350000bc1a25962505368a3b' then raise exception 'rollback_wrong_order_or_function_drift: workspace_require_make_systems'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_make_systems_authority(uuid,uuid)')))) is distinct from '2c8bacea7e8cc5b70e61df6b3d99be9c' then raise exception 'rollback_wrong_order_or_function_drift: workspace_make_systems_authority'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid)')))) is distinct from 'f9b242948a9db1ca09cfac142dc80ab3' then raise exception 'rollback_wrong_order_or_function_drift: save_workspace_work'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_system_work(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid)')))) is distinct from 'e32fef51c1e485c75cf3d4618843ac1b' then raise exception 'rollback_wrong_order_or_function_drift: save_system_work'; end if;
end;
$rollback_guard$;
drop function public.workspace_require_make_systems(uuid,uuid);
drop function public.workspace_make_systems_authority(uuid,uuid);
drop function public.save_system_work(uuid,uuid,text,text,text,text,jsonb,jsonb,uuid);
CREATE OR REPLACE FUNCTION public.workspace_role_allows(p_role text, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_permission in ('create_work', 'create_handoff', 'record_calendar_receipt') then
    return p_role in ('owner', 'admin', 'member');
  elsif p_permission in (
    'manage_calendar', 'manage_delegations', 'manage_handoffs',
    'manage_work_authority', 'manage_ongoing', 'manage_offerings'
  ) then
    return p_role in ('owner', 'admin');
  elsif p_permission in ('invite_members', 'sponsor_assignment', 'exit_workspace', 'manage_members') then
    return p_role = 'owner';
  end if;
  raise exception 'workspace_permission_unknown';
end;
$function$
;
revoke all on function public.workspace_role_allows(text,text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_role_allows(text,text) to "service_role";
CREATE OR REPLACE FUNCTION public.save_workspace_work(p_workspace_id uuid, p_user_id uuid, p_product_id text, p_resource_kind text, p_title text, p_payload jsonb, p_input jsonb, p_source_work_id uuid)
 RETURNS SETOF saved_product_work
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'create_work');
  if p_payload is null then raise exception 'saved_work_invalid'; end if;
  return query
  insert into public.saved_product_work as w (
    workspace_id, product_id, resource_kind, title, payload, input, source_work_id, created_by
  ) values (
    p_workspace_id, p_product_id, p_resource_kind, p_title, p_payload, p_input, p_source_work_id, p_user_id
  )
  returning w.*;
end;
$function$
;
revoke all on function public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid) to "service_role";
commit;
