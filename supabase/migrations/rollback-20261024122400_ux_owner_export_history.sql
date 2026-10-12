begin;
set local lock_timeout = '3s';
drop function public.list_workspace_export_owner_builds(uuid,uuid,text);
notify pgrst, 'reload schema';
commit;
