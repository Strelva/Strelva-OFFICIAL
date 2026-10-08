begin;
set local lock_timeout = '3s';
drop function public.record_workspace_exit_handoff(uuid,uuid,text,uuid,text,text,uuid);
drop function public.read_workspace_exit_handoff_plan(uuid,uuid,text);
alter function public.read_workspace_exit_handoff_plan_before_evidence(uuid,uuid,text) rename to read_workspace_exit_handoff_plan;
grant execute on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) to service_role;
-- Keep recorded handoff history. Do not delete customer exit evidence on rollback.
commit;
