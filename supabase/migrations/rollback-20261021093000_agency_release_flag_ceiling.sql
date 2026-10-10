begin;
set local lock_timeout='3s';
-- Exclude inserts before checking emptiness; BEGIN alone does not do this.
lock table public.agency_release_flag_ceilings,public.agency_release_flag_ceiling_history in access exclusive mode;
do $$ begin
 if exists(select 1 from public.agency_release_flag_ceilings) or exists(select 1 from public.agency_release_flag_ceiling_history) then
  raise exception 'agency_release_flag_rollback_requires_data_preservation';
 end if;
end $$;
drop function public.set_workspace_release_flag(text,uuid,text,text,text,bigint);
alter function public.set_workspace_release_flag_before_agency(text,uuid,text,text,text,bigint) rename to set_workspace_release_flag;
drop function public.read_operator_agency_release_flags(uuid,text,uuid,uuid),public.read_agency_release_flags(uuid,uuid,uuid,text),public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text),public.set_agency_release_flag_ceiling(uuid,text,uuid,text,uuid,uuid,text,text,bigint,text);
drop function public.agency_release_flag_read_scope(uuid,uuid,uuid,text),public.agency_release_flag_scope(uuid,uuid,uuid,text),public.agency_release_flag_rows(uuid,uuid),public.agency_release_flag_system_kind(text);
drop table public.agency_release_flag_ceiling_history,public.agency_release_flag_ceilings;
commit;
