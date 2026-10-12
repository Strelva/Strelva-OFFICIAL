-- Restore the original catalog only when no pending amendment needs the new
-- active+proposed representation. Never discard a recorded proposal or grant.
begin;
set local lock_timeout = '5s';
lock table public.agency_scope_grants in access exclusive mode;
do $$ begin
  if exists (select 1 from public.agency_scope_grants where status in ('proposed','active')
      group by customer_workspace_id,agency_workspace_id,scope having count(*) > 1)
    or exists (select 1 from public.agency_scope_grants where level = 'full_control' and status in ('proposed','active')
      group by customer_workspace_id,scope having count(*) > 1) then
    raise exception 'ux_owner_agency_access_rollback_refused: resolve pending access amendments first';
  end if;
end $$;
drop trigger agency_scope_grants_full_control_boundary on public.agency_scope_grants;
drop function public.agency_scope_grants_assert_full_control();
drop function public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text);
drop function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean);
alter function public.bring_in_agency_before_ux_owner_access(uuid,text,uuid,uuid,jsonb,text) rename to bring_in_agency;
alter function public.respond_to_agency_proposal_before_ux_owner_access(uuid,text,uuid,uuid,boolean) rename to respond_to_agency_proposal;
grant execute on function public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean) to service_role;
drop index public.agency_scope_grants_one_open_idx;
drop index public.agency_scope_grants_one_full_control_idx;
create unique index agency_scope_grants_one_open_idx on public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope)
  where status in ('proposed','active');
create unique index agency_scope_grants_one_full_control_idx on public.agency_scope_grants(customer_workspace_id,scope)
  where level = 'full_control' and status in ('proposed','active');
commit;
