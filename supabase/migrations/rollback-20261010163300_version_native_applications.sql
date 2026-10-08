begin;
set local lock_timeout='2s';
-- Disable Systems first. Keep native app rows, records, releases and mappings.
-- They belong to the business and remain executable through native surfaces.
drop function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb);
drop function public.read_version_native_runtime(uuid,uuid,text,uuid);
drop function public.save_system_version(uuid,text,uuid,bigint,jsonb);
alter function public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb) rename to save_system_version;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
