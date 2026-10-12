-- Guarded inverse: never discard a retained agency booking actor.
begin;
set local lock_timeout='3s';
lock table public.business_booking_history in access exclusive mode;
do $$ begin
  if exists(select 1 from public.business_booking_history where actor_snapshot is not null) then
    raise exception 'rollback_ux_booking_actor_retained_history'; end if;
  if exists(select 1 from public.ux_booking_actor_catalog_guard where definition_hash is distinct from md5(pg_get_functiondef(to_regprocedure(signature)))) then
    raise exception 'rollback_ux_booking_actor_function_drift'; end if;
end $$;
drop function public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid);
drop function public.read_workspace_booking(uuid,uuid);
drop function public.read_tenant_booking_history(text,text);
drop function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date);
drop function public.read_strelva_handled(uuid,uuid,text,timestamptz);
alter function public.read_workspace_booking_before_ux_booking_actor(uuid,uuid) rename to read_workspace_booking;
grant execute on function public.read_workspace_booking(uuid,uuid) to service_role;
alter function public.read_tenant_booking_history_before_ux_booking_actor(text,text) rename to read_tenant_booking_history;
grant execute on function public.read_tenant_booking_history(text,text) to service_role;
alter function public.read_workspace_booking_evidence_before_ux_booking_actor(uuid,uuid,text,text,date,date) rename to read_workspace_booking_evidence;
grant execute on function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) to service_role;
alter function public.read_strelva_handled_before_ux_booking_actor(uuid,uuid,text,timestamptz) rename to read_strelva_handled;
grant execute on function public.read_strelva_handled(uuid,uuid,text,timestamptz) to service_role;
alter table public.business_booking_history drop column actor_snapshot;
drop table public.ux_booking_actor_catalog_guard;
commit;
