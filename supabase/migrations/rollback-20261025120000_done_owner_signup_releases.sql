-- Never remove the provenance for a rollout a direct business has joined.
-- The application must be returned to the previous seven-argument entry first.
begin;
set local lock_timeout = '5s';
lock table public.workspace_creation_receipts in access exclusive mode;
do $$ begin
  if exists(select 1 from public.workspace_creation_receipts where cardinality(initial_release_flags)>0) then
    raise exception 'done_owner_signup_releases_rollback_populated';
  end if;
end; $$;
drop function public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[]);
drop function public.read_direct_owner_places_eligibility(uuid,uuid,text);
alter table public.workspace_creation_receipts drop column initial_release_flags;
commit;
