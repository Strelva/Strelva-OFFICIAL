begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;
do $$ begin
  if (select count(*) from public.ux_agency2_decision_catalog_guard) <> 8
    or exists (select 1 from public.ux_agency2_decision_catalog_guard where definition_hash is distinct from md5(pg_get_functiondef(to_regprocedure(signature)))) then
    raise exception 'ux_agency2_decision_rollback_successor_conflict';
  end if;
  if exists (select 1 from public.owner_decisions where agency_decision_scopes is not null) then
    raise exception 'ux_agency2_decision_rollback_recorded_scopes';
  end if;
end $$;
do $$ declare predecessor record; begin
  for predecessor in select * from public.ux_agency2_decision_predecessors loop execute predecessor.definition; end loop;
end $$;
drop table public.ux_agency2_decision_predecessors;
drop function public.read_agency_decision_receipt(uuid,uuid,uuid,text,uuid,text);
drop function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid);
alter function public.claim_scoped_agency_owner_decision_before_agency2(uuid,uuid,text,text,uuid,text,uuid) rename to claim_scoped_agency_owner_decision;
grant execute on function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) to service_role;
drop function public.agency_owner_decision_scopes(public.owner_decisions);
alter function public.agency_owner_decision_scopes_before_agency2(public.owner_decisions) rename to agency_owner_decision_scopes;
drop trigger agency_decision_scopes_guard on public.owner_decisions;
drop function public.agency_decision_scopes_guard();
alter table public.owner_decisions drop column agency_decision_scopes;
drop table public.ux_agency2_decision_catalog_guard;
notify pgrst, 'reload schema';
commit;
