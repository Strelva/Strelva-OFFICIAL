begin;
set local lock_timeout = '2s';
-- Disable the Systems release before restoring the former sharing boundary.
drop function public.save_system_version(uuid,text,uuid,bigint,jsonb);
alter function public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)
  rename to save_system_version;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
