-- Preserve configured brands: export/reset them explicitly before rollback.
begin;
do $$ begin
  if exists(select 1 from public.workspaces where agency_brand is not null) then
    raise exception 'agency_brand_rollback_requires_data_preservation';
  end if;
end $$;
drop function public.manage_agency_brand(uuid,text,uuid,jsonb);
drop function public.resolve_owner_brand(uuid);
alter table public.workspaces drop column agency_brand;
commit;
