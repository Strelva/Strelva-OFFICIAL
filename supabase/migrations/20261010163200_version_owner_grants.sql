-- Version lineage and data sharing are business-owner decisions. Keep the
-- existing compare-and-set/history checks behind a private implementation;
-- every public save rechecks this boundary, including direct service-role RPCs.
begin;
set local lock_timeout = '2s';
alter function public.save_system_version(uuid,text,uuid,bigint,jsonb)
  rename to save_system_version_owner_grants_core;
revoke all on function public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)
  from public,anon,authenticated,service_role;

create function public.save_system_version(
  p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare version public.system_versions; access record; current_grants jsonb;
begin
  select * into version from public.system_versions where id=p_version_id for update;
  if not found then raise exception 'system_not_found'; end if;
  access:=public.system_version_access(version,p_user_id,p_verified_email,true);
  if access.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  current_grants:=public.system_version_json(version,'full',p_user_id,p_verified_email)->'grants';
  if p_lineage->'grants' is distinct from current_grants and access.actor_role is distinct from 'owner' then
    raise exception 'business_record_access_denied';
  end if;
  return public.save_system_version_owner_grants_core(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage);
end $$;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
