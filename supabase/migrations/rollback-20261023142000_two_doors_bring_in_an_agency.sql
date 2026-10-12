-- Roll back 20261023142000. Refuses once an agency has been brought in or
-- has decided an item, so no recorded consent or decision is discarded.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.agency_scope_grants) or exists (select 1 from public.owner_decisions where decided_by_kind = 'agency_session') then
    raise exception 'two_doors_agency_rollback_refused: agency grants or agency decisions exist';
  end if;
end $$;
drop function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text);
alter function public.claim_owner_decision_before_two_doors(uuid,uuid,text,text,text,uuid,text,text) rename to claim_owner_decision;
revoke all on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) to service_role;
alter table public.owner_decisions drop constraint owner_decisions_decided_by_kind_check;
alter table public.owner_decisions add constraint owner_decisions_decided_by_kind_check check (decided_by_kind is null or decided_by_kind in
  ('owner_link','owner_session','admin_session','member_session','operator','expiry','system'));
drop function public.read_agency_proposals(uuid, text, uuid);
drop function public.read_business_agencies(uuid, text, uuid);
drop function public.end_agency_for_business(uuid, text, uuid, uuid, text);
drop function public.respond_to_agency_proposal(uuid, text, uuid, uuid, boolean);
drop function public.bring_in_agency(uuid, text, uuid, uuid, jsonb, text);
drop function public.read_agency_directory(uuid, text);
drop function public.set_agency_directory_listing(uuid, text, uuid, text, boolean);
drop function public.agency_directory_assert_manager(uuid, uuid, text);
drop function public.business_scope_full_control(uuid, text);
drop function public.owner_decision_scope(text);
drop table public.agency_scope_grants;
drop table public.agency_directory_listings;
commit;
