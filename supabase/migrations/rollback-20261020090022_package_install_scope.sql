-- Guarded local rollback: package records require an explicit data-preserving retirement first.
begin;
set local lock_timeout='2s';
do $$ begin if exists(select 1 from public.system_package_install_grants) then raise exception 'rollback_creator_install_grants_in_use';end if;end $$;
drop function public.system_actor_scope(uuid,uuid,text,boolean);
alter function public.system_actor_scope_package_core(uuid,uuid,text,boolean) rename to system_actor_scope;
drop function public.read_version_actor(uuid,text);
alter function public.read_version_actor_package_core(uuid,text) rename to read_version_actor;
create or replace function public.create_version_system_command(
  p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid,p_native_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid; source_business uuid; scope record; source_revision public.system_version_source_revisions;
  system public.systems; version public.system_versions; work public.saved_product_work; digest text; created jsonb; lineage jsonb;
begin
  business:=(p_lineage->'version'->>'businessId')::uuid;
  source_business:=(p_lineage->'source'->>'businessId')::uuid;
  scope:=public.system_actor_scope(business,p_user_id,p_verified_email,true);
  if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  scope:=public.system_actor_scope(source_business,p_user_id,p_verified_email,true);
  if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(business::text||':'||p_command_id::text,20261010));
  select * into source_revision from public.system_version_source_revisions where source_system_id=(p_lineage->'source'->>'systemId')::uuid
    and number=(p_lineage->'baseline'->>'revision')::integer;
  if not found or source_revision.definition->>'kind' is distinct from 'internal_app' or p_kind is distinct from 'internal_app'
    or source_revision.definition is distinct from p_lineage->'baseline'->'definition'
    or (source_revision.definition-array['kind','title','fields','components'])<>'{}'::jsonb then raise exception 'system_version_input_invalid'; end if;
  perform public.validate_application_spec(p_native_payload->'spec');
  if p_native_payload->'spec' is distinct from (source_revision.definition-'kind')||jsonb_build_object('maintenanceOwner',p_user_id)
    or p_native_payload->>'status' is distinct from 'draft' or p_native_payload->>'createdBy' is distinct from p_user_id::text
    or p_native_payload->'records' is distinct from '[]'::jsonb or p_native_payload ?| array['installation','release','releases','candidate']
    or (p_native_payload-array['version','revision','title','createdBy','createdAt','history','spec','specVersion','status','versions','rehearsal','records'])<>'{}'::jsonb
    or p_native_payload->>'revision' is distinct from '0' or p_native_payload->>'specVersion' is distinct from '1'
    or p_native_payload->'history' is distinct from '[]'::jsonb or p_native_payload->'rehearsal' is distinct from 'null'::jsonb
    or p_native_payload->'versions' is distinct from jsonb_build_array(jsonb_build_object('version',1,'spec',p_native_payload->'spec'))
    or p_native_payload->>'version' is distinct from '1' or p_native_payload->>'title' is distinct from p_native_payload->'spec'->>'title' then
    raise exception 'system_version_input_invalid';
  end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('source',p_lineage->'source','baseline',p_lineage->'baseline',
    'context',p_lineage->'context','name',p_name,'kind',p_kind)::text,'UTF8')),'hex');
  select * into system from public.systems where business_workspace_id=business and command_id=p_command_id;
  if found then
    if system.command_digest<>digest or system.created_by<>p_user_id then raise exception 'system_command_conflict'; end if;
    select * into version from public.system_versions where version_system_id=system.id;
    if not found then raise exception 'system_version_input_invalid'; end if;
    return public.system_version_json(version,'full',p_user_id,p_verified_email);
  end if;
  if source_business<>business then
    perform 1 from public.system_version_sources where system_id=source_revision.source_system_id for update;
    perform public.put_system_version_source(source_business,p_user_id,p_verified_email,source_revision.source_system_id,
      array(select distinct target from (
        select s.grantee_workspace_id target from public.system_version_source_shares s where s.source_system_id=source_revision.source_system_id and s.revoked_at is null
        union all select business) shares));
  end if;
  select * into work from public.save_system_work(business,p_user_id,p_verified_email,'applications','application',p_name,p_native_payload,null,null);
  created:=public.create_business_system(business,p_user_id,p_verified_email,jsonb_build_object('name',p_name,'kind',p_kind,
    'origin',jsonb_build_object('kind','saved_work','ref',work.id)),p_command_id,digest);
  lineage:=public.create_system_version(p_user_id,p_verified_email,jsonb_set(p_lineage,'{version,systemId}',created->'id'));
  insert into public.system_version_native_applications(version_id,business_workspace_id,work_id) values ((lineage->>'id')::uuid,business,work.id);
  return lineage;
end $$;
drop function public.read_system_package_creator(uuid,uuid,text,uuid),public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid),public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid),public.system_package_install_grant_active(public.system_package_install_grants,uuid,text);
drop table public.system_package_install_grants;
grant execute on function public.read_version_actor(uuid,text) to service_role;
commit;
