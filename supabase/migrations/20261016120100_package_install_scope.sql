-- Owner-selected source/revision/command delegation, not customer admin membership.
begin;
set local lock_timeout='2s';
create table public.system_package_install_grants(
 id uuid primary key default gen_random_uuid(),business_workspace_id uuid not null references public.workspaces(id),agency_workspace_id uuid not null references public.workspaces(id),source_revision_id uuid not null references public.system_version_source_revisions(id),command_id uuid not null,work_id uuid not null default gen_random_uuid(),granted_by uuid not null references public.users(id),expires_at timestamptz not null,status text not null default 'active' check(status in ('active','revoked')),created_at timestamptz not null default clock_timestamp(),unique(business_workspace_id,command_id),unique(work_id));
alter table public.system_package_install_grants enable row level security;
revoke all on public.system_package_install_grants from public,anon,authenticated,service_role;
grant select on public.system_package_install_grants to service_role;
create function public.system_package_install_grant_active(g public.system_package_install_grants,p_user_id uuid,p_verified_email text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select g.status='active' and g.expires_at>clock_timestamp() and not public.workspace_exit_completed(g.business_workspace_id)
 and exists(select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=g.agency_workspace_id and m.role in ('owner','admin') where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null)
 and exists(select 1 from public.workspace_memberships m where m.workspace_id=g.business_workspace_id and m.user_id=g.granted_by and m.role='owner')
 and exists(select 1 from public.workspace_delegations d where d.customer_workspace_id=g.business_workspace_id and d.agency_workspace_id=g.agency_workspace_id and d.status='active');
$$;
create function public.grant_system_package_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_revision_id uuid,p_command_id uuid,p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; r public.system_version_source_revisions;
begin
 if public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email) is distinct from 'owner' then raise exception 'business_record_access_denied'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 if p_command_id is null or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '30 days' or not exists(select 1 from public.workspaces where id=p_agency_workspace_id and kind='agency') then raise exception 'system_package_input_invalid'; end if;
 if not exists(select 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and status='active') then raise exception 'business_record_access_denied'; end if;
 select * into r from public.system_version_source_revisions where id=p_revision_id;
 if not found or not public.system_revision_is_qualified(p_revision_id) or not public.system_version_source_visible(r.source_system_id,p_user_id,p_verified_email) then raise exception 'system_revision_not_qualified'; end if;
 insert into public.system_package_install_grants(business_workspace_id,agency_workspace_id,source_revision_id,command_id,granted_by,expires_at) values(p_workspace_id,p_agency_workspace_id,p_revision_id,p_command_id,p_user_id,p_expires_at) on conflict(business_workspace_id,command_id) do nothing;
 select * into g from public.system_package_install_grants where business_workspace_id=p_workspace_id and command_id=p_command_id;
 if g.agency_workspace_id<>p_agency_workspace_id or g.source_revision_id<>p_revision_id or g.granted_by<>p_user_id or g.expires_at<>p_expires_at or g.status<>'active' then raise exception 'system_version_stale'; end if;
 return jsonb_build_object('grantId',g.id,'workspaceId',g.business_workspace_id,'commandId',g.command_id,'expiresAt',public.system_version_ts(g.expires_at));
end $$;
create function public.revoke_system_package_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_grant_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email) is distinct from 'owner' then raise exception 'business_record_access_denied'; end if;
 update public.system_package_install_grants set status='revoked' where id=p_grant_id and business_workspace_id=p_workspace_id;
 return found;
end $$;
create function public.require_system_package_install_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_system_id uuid,p_revision integer,p_command_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; role text;
begin
 select * into r from public.system_version_source_revisions where source_system_id=p_source_system_id and number=p_revision;
 if not found then raise exception 'business_record_access_denied'; end if;
 role:=public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email);
 if coalesce(role,'') not in ('owner','admin') and not exists(select 1 from public.system_package_install_grants g where g.business_workspace_id=p_workspace_id and g.command_id=p_command_id and g.source_revision_id=r.id and public.system_package_install_grant_active(g,p_user_id,p_verified_email)) then raise exception 'business_record_access_denied'; end if;
 if not public.system_version_source_visible(p_source_system_id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied'; end if;
 if not public.system_revision_is_qualified(r.id) then raise exception 'system_revision_not_qualified'; end if;
 return true;
end $$;
alter function public.system_actor_scope(uuid,uuid,text,boolean) rename to system_actor_scope_package_core;
revoke all on function public.system_actor_scope_package_core(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.system_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing record; granted uuid[];
begin
 select coalesce(array_agg(g.work_id),'{}'::uuid[]) into granted from public.system_package_install_grants g where g.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
 begin existing:=public.system_actor_scope_package_core(p_workspace_id,p_user_id,p_verified_email,p_write); access:=existing.access; work_ids:=existing.work_ids;
 exception when others then if sqlerrm not in ('business_record_access_denied','workspace_membership_required') or cardinality(granted)=0 then raise; end if; access:='agency'; work_ids:='{}'::uuid[]; end;
 if access='agency' then work_ids:=array(select distinct unnest(coalesce(work_ids,'{}'::uuid[])||granted)); end if;
end $$;
alter function public.read_version_actor(uuid,text) rename to read_version_actor_package_core;
revoke all on function public.read_version_actor_package_core(uuid,text) from public,anon,authenticated,service_role;
create function public.read_version_actor(p_user_id uuid,p_verified_email text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.read_version_actor_package_core(p_user_id,p_verified_email)||jsonb_build_object('delegatedSystems',coalesce((select jsonb_agg(jsonb_build_object('businessId',g.business_workspace_id,'systemId',coalesce(s.id,g.command_id),'canWrite',true)) from public.system_package_install_grants g left join public.systems s on s.business_workspace_id=g.business_workspace_id and s.origin_kind='saved_work' and s.origin_ref=g.work_id::text where public.system_package_install_grant_active(g,p_user_id,p_verified_email)),'[]'::jsonb));
$$;
create or replace function public.create_version_system_command(
  p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid,p_native_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid; source_business uuid; scope record; source_revision public.system_version_source_revisions;
  permission public.system_package_install_grants; system public.systems; version public.system_versions; work public.saved_product_work; digest text; created jsonb; lineage jsonb;
begin
  business:=(p_lineage->'version'->>'businessId')::uuid;
  source_business:=(p_lineage->'source'->>'businessId')::uuid;
  perform public.require_system_package_install_scope(business,p_user_id,p_verified_email,(p_lineage->'source'->>'systemId')::uuid,(p_lineage->'baseline'->>'revision')::integer,p_command_id);
  if public.workspace_exit_completed(business) then raise exception 'workspace_exit_future_work_blocked'; end if;
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
  -- Installation is a closed qualified runtime, separate from the general authoring permission.
  select * into permission from public.system_package_install_grants g where g.business_workspace_id=business and g.command_id=p_command_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email) for update;
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
    values(coalesce(permission.work_id,gen_random_uuid()),business,'applications','application',p_name,p_native_payload,p_user_id) returning * into work;
  created:=public.create_business_system(business,p_user_id,p_verified_email,jsonb_build_object('name',p_name,'kind',p_kind,
    'origin',jsonb_build_object('kind','saved_work','ref',work.id)),p_command_id,digest);
  lineage:=public.create_system_version(p_user_id,p_verified_email,jsonb_set(p_lineage,'{version,systemId}',created->'id'));
  insert into public.system_version_native_applications(version_id,business_workspace_id,work_id) values ((lineage->>'id')::uuid,business,work.id);
  return lineage;
end $$;
revoke all on function public.system_package_install_grant_active(public.system_package_install_grants,uuid,text),public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid) from public,anon,authenticated;
revoke all on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid),public.read_version_actor(uuid,text) from public,anon,authenticated;
grant execute on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid),public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid),public.read_version_actor(uuid,text) to service_role;
create function public.read_system_package_creator(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.system_versions; a record; creator text;
begin
 select * into v from public.system_versions where business_workspace_id=p_workspace_id and version_system_id=p_system_id;
 if not found then raise exception 'business_record_access_denied'; end if;
 a:=public.system_version_access(v,p_user_id,p_verified_email,false);
 if a.access is null then raise exception 'business_record_access_denied'; end if;
 select name into creator from public.workspaces where id=v.creator_workspace_id;
 return jsonb_build_object('creatorWorkspaceId',v.creator_workspace_id,'creatorName',creator,'sourceRevisionId',v.installed_source_revision_id);
end $$;
revoke all on function public.read_system_package_creator(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_system_package_creator(uuid,uuid,text,uuid) to service_role;
commit;
