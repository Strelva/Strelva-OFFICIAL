-- Additive Version creation command and reversible draft restoration. No
-- current baseline/release is rewritten; the reserved '*' override snapshots
-- a complete shareable draft, including removal of newly added fields.
begin;
set local lock_timeout='2s';
-- An agency's own Systems use its direct membership. This changes no scope
-- when that agency opens a customer: the delegated/assigned rules remain.
create or replace function public.system_actor_scope(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[]
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.workspaces where id=p_workspace_id and kind='agency') then
    access:=public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email);
    if access is not null then
      if p_write and access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
      work_ids:=null; return;
    end if;
  end if;
  if p_write then access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
  elsif exists(select 1 from public.workspace_memberships wm join public.workspaces w on w.id=wm.workspace_id and w.kind='customer'
    where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id) then
    access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,false);
  else access:='agency'; end if;
  if access<>'agency' then work_ids:=null; return; end if;
  work_ids:=public.business_record_agency_work_ids(p_workspace_id,p_user_id,p_verified_email,p_write);
  if cardinality(work_ids)=0 then raise exception 'business_record_access_denied'; end if;
end $$;
alter table public.system_version_overrides drop constraint system_version_overrides_path_check;
alter table public.system_version_overrides add constraint system_version_overrides_path_check
  check ((path='*' or path ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$') and char_length(path)<=300) not valid;

create function public.create_version_system_command(
  p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid; source_business uuid; scope record; system jsonb; version public.system_versions; digest text; lineage jsonb;
begin
  business:=(p_lineage->'version'->>'businessId')::uuid;
  source_business:=(p_lineage->'source'->>'businessId')::uuid;
  scope:=public.system_actor_scope(business,p_user_id,p_verified_email,true);
  if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  -- Publishing a Version shares only the author's reusable shape with this
  -- destination; no data, grants, bindings or credentials are copied.
  if source_business<>business then
    scope:=public.system_actor_scope(source_business,p_user_id,p_verified_email,true);
    if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
    perform 1 from public.system_version_sources s where s.system_id=(p_lineage->'source'->>'systemId')::uuid for update;
    perform public.put_system_version_source(source_business,p_user_id,p_verified_email,(p_lineage->'source'->>'systemId')::uuid,
      array(select distinct target from (
        select s.grantee_workspace_id as target from public.system_version_source_shares s
          where s.source_system_id=(p_lineage->'source'->>'systemId')::uuid and s.revoked_at is null
        union all select business) shares));
  end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('source',p_lineage->'source','baseline',p_lineage->'baseline',
    'context',p_lineage->'context','name',p_name,'kind',p_kind)::text,'UTF8')),'hex');
  system:=public.create_business_system(business,p_user_id,p_verified_email,jsonb_build_object('name',p_name,'kind',p_kind),p_command_id,digest);
  select * into version from public.system_versions where version_system_id=(system->>'id')::uuid;
  if found then return public.system_version_json(version,'full',p_user_id,p_verified_email); end if;
  lineage:=jsonb_set(p_lineage,'{version,systemId}',system->'id');
  return public.create_system_version(p_user_id,p_verified_email,lineage);
end $$;
revoke all on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid) to service_role;

create function public.read_version_binding_choices(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record;
begin
  scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,false);
  if scope.work_ids is not null then raise exception 'business_record_access_denied'; end if;
  return coalesce((select jsonb_agg(item order by label) from (
    select c.calendar_name as label,jsonb_build_object('connectionId','calendar:'||c.id,'kind','booking_calendar',
      'label',case when c.provider='google' then 'Google: ' else 'Outlook: ' end||c.calendar_name) item
      from public.workspace_calendar_connections c where c.workspace_id=p_workspace_id and c.status<>'revoked'
    union all select t.site_name,jsonb_build_object('connectionId','tenant:'||t.stable_id,'kind','website_tenant','label',t.site_name)
      from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id where l.workspace_id=p_workspace_id
  ) choices),'[]');
end $$;
revoke all on function public.read_version_binding_choices(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_version_binding_choices(uuid,uuid,text) to service_role;
commit;
