begin;
set local lock_timeout = '3s';
drop function public.export_workspace_archive_snapshot(uuid,uuid,text);
drop function public.export_workspace_archive_snapshot_base(uuid,uuid,text);
commit;
