-- Resolve open proposals before returning to acceptance without identity binding.
begin;
set local lock_timeout = '5s';
lock table public.agency_scope_grants,public.ux_agency_identity_catalog_guard in access exclusive mode;
do $$ begin
  if (select count(*) from public.ux_agency_identity_catalog_guard) <> 7
    or exists (select 1 from public.ux_agency_identity_catalog_guard
      where definition_hash is distinct from md5(pg_get_functiondef(to_regprocedure(signature)))) then
    raise exception 'ux_agency_identity_rollback_function_drift';
  end if;
  if exists (select 1 from public.agency_scope_grants where status = 'proposed') then
    raise exception 'ux_agency_identity_rollback_pending_proposals';
  end if;
end $$;
drop trigger agency_proposal_immutable_boundary on public.agency_scope_grants;
drop function public.agency_proposal_immutable_guard();
drop function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean);
drop function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text);
drop function public.read_agency_proposals(uuid,text,uuid);
drop function public.agency_proposal_identity(uuid,uuid);
alter function public.respond_to_agency_proposal_before_ux_agency_identity(uuid,text,uuid,uuid,boolean) rename to respond_to_agency_proposal;
alter function public.read_agency_proposals_before_ux_agency_identity(uuid,text,uuid) rename to read_agency_proposals;
grant execute on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean),public.read_agency_proposals(uuid,text,uuid) to service_role;
drop table public.ux_agency_identity_catalog_guard;
notify pgrst, 'reload schema';
commit;
