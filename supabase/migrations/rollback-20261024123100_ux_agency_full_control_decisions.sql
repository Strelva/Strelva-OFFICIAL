begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;
do $$ begin
  if (select count(*) from public.ux_agency_decisions_catalog_guard) <> 12
    or exists (select 1 from public.ux_agency_decisions_catalog_guard
      where definition_hash is distinct from md5(pg_get_functiondef(to_regprocedure(signature)))) then
    raise exception 'ux_agency_decisions_rollback_successor_conflict';
  end if;
  if exists (select 1 from public.owner_decisions where proposing_actor is not null or deciding_actor is not null) then
    raise exception 'ux_agency_decisions_rollback_recorded_actors';
  end if;
end $$;
drop function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text);
drop function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid);
alter function public.claim_owner_decision_before_ux_agency(uuid,uuid,text,text,text,uuid,text,text) rename to claim_owner_decision;
grant execute on function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text) to service_role;
drop function public.list_agency_owner_decisions(uuid,uuid,text,uuid);
drop function public.agency_owner_decision_allowed(uuid,uuid,uuid,text,uuid);
drop function public.agency_owner_decision_scopes(public.owner_decisions);
drop function public.agency_system_decision_scope(text);
drop trigger owner_decision_actor_snapshot_guard on public.owner_decisions;
drop function public.owner_decision_actor_snapshot_guard();
drop function public.open_owner_decision(uuid,jsonb);
alter function public.open_owner_decision_before_ux_agency(uuid,jsonb) rename to open_owner_decision;
grant execute on function public.open_owner_decision(uuid,jsonb) to service_role;
drop function public.owner_decision_json(public.owner_decisions);
alter function public.owner_decision_json_before_ux_agency(public.owner_decisions) rename to owner_decision_json;
alter table public.owner_decisions drop column proposing_actor;
alter table public.owner_decisions drop column deciding_actor;
drop table public.ux_agency_decisions_catalog_guard;
notify pgrst, 'reload schema';
commit;
