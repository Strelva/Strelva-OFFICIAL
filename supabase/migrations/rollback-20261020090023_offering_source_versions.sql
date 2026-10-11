-- Guarded local rollback: package records require an explicit data-preserving retirement first.
begin;
set local lock_timeout='2s';
do $$ begin if exists(select 1 from public.offering_package_sources) or exists(select 1 from public.offering_installations where source_revision_id is not null or version_lineage_id is not null or creator_workspace_id is not null) then raise exception 'rollback_creator_offering_lineage_in_use'; end if;end $$;
drop trigger offering_installation_source_guard on public.offering_installations;
drop trigger sync_offering_installation_version on public.offering_installations;
drop trigger offering_installation_change_trg on public.offering_installations;
drop function public.offering_installation_source_guard(),public.sync_offering_installation_version(),public.guard_offering_installation_change();
alter function public.guard_offering_installation_change_native_core() rename to guard_offering_installation_change;
create trigger offering_installation_change_trg before update on public.offering_installations for each row execute function public.guard_offering_installation_change();
drop function public.register_offering_package_source(text,text,text),public.migrate_offering_installation_versions(text),public.link_offering_installation_version(public.offering_installations,boolean),public.system_package_behavior(jsonb,text[]),public.system_package_rehearsal(jsonb),public.offering_package_behavior(jsonb),public.offering_package_definition(text,text);
alter function public.system_package_behavior_native_core(jsonb,text[]) rename to system_package_behavior;
alter function public.system_package_rehearsal_native_core(jsonb) immutable;
alter function public.system_package_rehearsal_native_core(jsonb) rename to system_package_rehearsal;
drop table public.offering_package_sources;
alter table public.offering_installations drop column source_revision_id,drop column version_lineage_id,drop column creator_workspace_id;
commit;
