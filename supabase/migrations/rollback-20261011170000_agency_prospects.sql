-- Refuse destructive rollback after acquisition. Export/preserve the leads first.
begin;
do $$ begin
  if exists(select 1 from public.prospects) then
    raise exception 'agency_prospects_rollback_requires_data_preservation';
  end if;
end $$;
drop function public.agency_prospect_list(uuid,uuid,text);
drop function public.agency_prospect_capture(uuid,text,text,text,text,text,text,integer,text);
drop function public.agency_prospect_admit(uuid);
drop function public.agency_prospecting_profile(text);
drop table public.prospects;
drop function public.agency_prospect_member(uuid);
drop table public.agency_prospect_quota;
drop table public.agency_prospecting_profiles;
commit;
