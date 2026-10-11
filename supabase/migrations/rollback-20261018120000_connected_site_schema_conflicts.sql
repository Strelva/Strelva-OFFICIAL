-- Remove the report-only source only before it has recorded any owner decision.
-- Existing decisions require this adapter to remain readable and resolvable.
begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;
do $$
begin
  if exists (select 1 from public.owner_decisions where source_lifecycle = 'connected_site_schema') then
    raise exception 'connected_site_schema_conflicts_rollback_requires_data_preservation';
  end if;
end $$;
revoke all on function public.record_connected_site_schema_conflict(text,text,jsonb), public.read_connected_site_schema_conflict(uuid,uuid) from public, anon, authenticated, service_role;
drop function public.record_connected_site_schema_conflict(text,text,jsonb);
drop function public.read_connected_site_schema_conflict(uuid,uuid);
commit;
