begin;
set local lock_timeout = '3s';
drop function public.enqueue_workspace_export_recovery(uuid,uuid,text);
drop function public.claim_workspace_export_recovery(uuid);
drop function public.write_workspace_export_recovery(uuid,uuid,text,jsonb);
drop function public.start_workspace_export_build(uuid,uuid,text);
alter function public.start_workspace_export_build_before_owner_rule(uuid,uuid,text) rename to start_workspace_export_build;
grant execute on function public.start_workspace_export_build(uuid,uuid,text) to service_role;
-- Preserve queue evidence and completed archives. Disable STRELVA_EXPORT_RECOVERY.
commit;
