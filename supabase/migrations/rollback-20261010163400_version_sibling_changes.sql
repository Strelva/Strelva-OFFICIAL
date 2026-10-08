begin;
set local lock_timeout='2s';
drop function public.read_business_versions(uuid,uuid,text);
alter function public.read_business_versions_sibling_core(uuid,uuid,text) rename to read_business_versions;
revoke all on function public.read_business_versions(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_business_versions(uuid,uuid,text) to service_role;
drop function public.system_version_sibling_changes(public.system_versions);
commit;
