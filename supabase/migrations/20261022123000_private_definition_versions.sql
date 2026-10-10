begin;
set local lock_timeout='2s';
-- Exact ACL recovery supports the same bounded owner-issued baseline as
-- actor_rpc_service_boundary. Refuse BEFORE the first CREATE/rename/write.
do $acl_preflight$
declare signature text; migrator oid:=(current_user::regrole)::oid;
begin
 foreach signature in array array[
  'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
  'public.lock_system_package_install_grant(uuid,uuid,text)',
  'public.system_actor_scope(uuid,uuid,text,boolean)',
  'public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)',
 'public.system_version_access(public.system_versions,uuid,text,boolean)',
 'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)'] loop
  if not exists(select 1 from pg_proc p where p.oid=signature::regprocedure and p.proowner=migrator)
   or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.oid=signature::regprocedure and (acl.grantor<>p.proowner or acl.privilege_type<>'EXECUTE'
     or not exists(select 1 from pg_roles where oid=acl.grantor)
     or (acl.grantee<>0 and not exists(select 1 from pg_roles where oid=acl.grantee)))) then
   raise exception 'private_definition_unsupported_acl_baseline: %',signature;
  end if;
 end loop;
end $acl_preflight$;

-- Immutable provenance: private publication remains private-command governed even if listed later.
create table public.private_application_sources(source_system_id uuid primary key references public.system_version_sources(system_id));
alter table public.private_application_sources enable row level security;
revoke all on public.private_application_sources from public,anon,authenticated,service_role;
-- Source authoring is already supported by create_system_version_source.
-- This wrapper binds HTTP replay and expected revision to the immutable writer.
create function public.publish_private_application_source(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid,p_command_id uuid,p_expected_revision integer,p_revision jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare src public.system_version_sources; r public.system_version_source_revisions; n integer; shape jsonb;
begin
 perform public.system_version_assert_source_manager(p_workspace_id,p_user_id,p_verified_email);
 select * into src from public.system_version_sources where system_id=p_system_id and business_workspace_id=p_workspace_id for update;
 if not found then raise exception 'business_record_access_denied'; end if;
 shape:=p_revision->'definition';
 if shape->>'kind' is distinct from 'internal_app' or (shape-array['kind','title','fields','components'])<>'{}'::jsonb
  or (p_revision->'source'->>'businessId')::uuid is distinct from p_workspace_id
  or (p_revision->'source'->>'systemId')::uuid is distinct from p_system_id
  or (p_revision->'source'->>'revisionId')::uuid is distinct from p_command_id
  or (p_revision->'source'->>'number')::integer is distinct from p_expected_revision+1
  or p_expected_revision<0 or p_revision->'requires'->'bindingKinds' is distinct from '[]'::jsonb
 then raise exception 'system_version_input_invalid'; end if;
 perform public.validate_application_spec((shape-'kind')||jsonb_build_object('maintenanceOwner',p_user_id));
 insert into public.private_application_sources(source_system_id) values(p_system_id) on conflict do nothing;
 select * into r from public.system_version_source_revisions where id=p_command_id;
 if found then
  if r.source_system_id<>p_system_id or r.number<>p_expected_revision+1 or r.published_by<>p_user_id
   or r.definition is distinct from shape or r.summary is distinct from p_revision->>'summary'
   or r.declaration is distinct from p_revision->'declaration' then raise exception 'system_command_conflict';end if;
  return public.system_version_revision_json(r,p_workspace_id);
 end if;
 select coalesce(max(number),0) into n from public.system_version_source_revisions where source_system_id=p_system_id;
 if n<>p_expected_revision then raise exception 'system_version_stale';end if;
 return public.publish_system_version_source_revision(p_user_id,p_verified_email,p_revision);
end $$;
-- Exact one-business share/revoke; source definition only, never a work-read grant.
create function public.set_private_application_source_share(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid,p_business_id uuid,p_shared boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare src public.system_version_sources;
begin
 perform public.system_version_assert_source_manager(p_workspace_id,p_user_id,p_verified_email);
 select * into src from public.system_version_sources where system_id=p_system_id and business_workspace_id=p_workspace_id for update;
 if not found or p_shared is null or not exists(select 1 from public.workspaces where id=p_business_id and kind='customer') then raise exception 'system_version_input_invalid';end if;
 if p_shared then
  insert into public.system_version_source_shares(source_system_id,grantee_workspace_id,shared_by)
   select p_system_id,p_business_id,p_user_id where not exists(select 1 from public.system_version_source_shares where source_system_id=p_system_id and grantee_workspace_id=p_business_id and revoked_at is null);
 else
  update public.system_version_source_shares set revoked_at=clock_timestamp(),revoked_by=p_user_id
   where source_system_id=p_system_id and grantee_workspace_id=p_business_id and revoked_at is null;
 end if;
 return public.system_version_source_json(src,p_user_id,p_verified_email);
end $$;
-- New private grant mode uses selected/staffed provider authority; legacy
-- delegation grants keep their existing semantics. The owner selects exact
-- revision and command; the marker prevents widening pre-existing grants.
create table public.private_source_install_grants(grant_id uuid primary key references public.system_package_install_grants(id));
alter table public.private_source_install_grants enable row level security;
revoke all on public.private_source_install_grants from public,anon,authenticated,service_role;
create table public.private_definition_predecessors(signature text primary key,before_definition text not null,before_acl aclitem[] not null,after_sha256 text,after_acl jsonb);
alter table public.private_definition_predecessors enable row level security;
revoke all on public.private_definition_predecessors from public,anon,authenticated,service_role;
insert into public.private_definition_predecessors(signature,before_definition,before_acl)
 select signature,pg_get_functiondef(signature::regprocedure),coalesce(p.proacl,acldefault('f',p.proowner)) from unnest(array[
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.lock_system_package_install_grant(uuid,uuid,text)',
 'public.system_actor_scope(uuid,uuid,text,boolean)',
 'public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)',
 'public.system_version_access(public.system_versions,uuid,text,boolean)',
 'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)']) signature join pg_proc p on p.oid=signature::regprocedure;
alter function public.system_package_install_grant_active(public.system_package_install_grants,uuid,text) rename to system_package_install_grant_active_private_core;
revoke all on function public.system_package_install_grant_active_private_core(public.system_package_install_grants,uuid,text) from public,anon,authenticated,service_role;
create function public.system_package_install_grant_active(g public.system_package_install_grants,p_user_id uuid,p_verified_email text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from public.private_source_install_grants p where p.grant_id=g.id) then (
 g.status='active' and g.expires_at>statement_timestamp()
 and not exists(select 1 from public.workspace_exit_requests where workspace_id=g.business_workspace_id)
 and not exists(select 1 from public.workspace_release_flags f where f.workspace_id=g.business_workspace_id and f.flag='systems'
  and (f.state='off' or (f.state='operators' and not exists(select 1 from public.super_admins sa where sa.user_id=p_user_id and sa.revoked_at is null)
   and not exists(select 1 from public.workspace_release_testers t where t.workspace_id=g.business_workspace_id and t.user_id=p_user_id))))
 and exists(select 1 from public.workspace_memberships where workspace_id=g.business_workspace_id and user_id=g.granted_by and role='owner')
 and exists(select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=g.agency_workspace_id and m.role in ('owner','admin')
  join public.provider_seats s on s.agency_workspace_id=m.workspace_id and s.customer_workspace_id=g.business_workspace_id and s.status='active'
  join public.agency_client_staff staff on staff.agency_workspace_id=s.agency_workspace_id and staff.customer_workspace_id=s.customer_workspace_id and staff.user_id=u.id and staff.status='active'
  where u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email)))
 and exists(select 1 from public.system_version_source_revisions r join public.system_version_source_shares share on share.source_system_id=r.source_system_id and share.grantee_workspace_id=g.business_workspace_id and share.revoked_at is null
  where r.id=g.source_revision_id and public.system_revision_is_qualified(r.id))
 ) else public.system_package_install_grant_active_private_core(g,p_user_id,p_verified_email) end;
$$;
alter function public.lock_system_package_install_grant(uuid,uuid,text) rename to lock_system_package_install_grant_private_core;
revoke all on function public.lock_system_package_install_grant_private_core(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.lock_system_package_install_grant(p_grant_id uuid,p_user_id uuid,p_verified_email text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; owner_email text;
begin
 if not exists(select 1 from public.private_source_install_grants where grant_id=p_grant_id) then
  return public.lock_system_package_install_grant_private_core(p_grant_id,p_user_id,p_verified_email);
 end if;
 select * into g from public.system_package_install_grants where id=p_grant_id;
 if not found or not public.system_package_install_grant_active(g,p_user_id,p_verified_email) then return false;end if;
 select email into owner_email from public.users where id=g.granted_by;
 perform public.provider_seat_assert_owner(g.business_workspace_id,g.granted_by,owner_email);
 select * into g from public.system_package_install_grants where id=p_grant_id for share;
 perform 1 from public.users where id=p_user_id for share;
 perform 1 from public.workspace_memberships where workspace_id=g.agency_workspace_id and user_id=p_user_id for share;
 perform 1 from public.provider_seats seat join public.agency_client_staff staff
  on staff.agency_workspace_id=seat.agency_workspace_id and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=p_user_id
  where seat.customer_workspace_id=g.business_workspace_id and seat.agency_workspace_id=g.agency_workspace_id for share of seat,staff;
 -- Match withdrawal and native install: source before exact share.
 perform 1 from public.system_version_sources src join public.system_version_source_revisions r on r.source_system_id=src.system_id
  where r.id=g.source_revision_id for share of src;
 perform 1 from public.system_version_source_shares share join public.system_version_source_revisions r on r.source_system_id=share.source_system_id
  where r.id=g.source_revision_id and share.grantee_workspace_id=g.business_workspace_id and share.revoked_at is null for share of share;
 perform 1 from public.workspace_release_flags where workspace_id=g.business_workspace_id and flag='systems' for share;
 if not public.lock_system_revision_qualification(g.source_revision_id) then return false;end if;
 -- A writer may have waited beyond the statement snapshot deadline.
 return g.expires_at>clock_timestamp() and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
end $$;
revoke all on function public.lock_system_package_install_grant(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.grant_private_application_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_revision_id uuid,p_command_id uuid,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; r public.system_version_source_revisions;
begin
 perform public.provider_seat_assert_owner(p_workspace_id,p_user_id,p_verified_email);
 if p_command_id is null or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '30 days'
  or not exists(select 1 from public.provider_seats where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and status='active')
  or exists(select 1 from public.workspace_exit_requests where workspace_id=p_workspace_id) then raise exception 'business_record_access_denied';end if;
 select * into r from public.system_version_source_revisions where id=p_revision_id;
 if not found or r.definition->>'kind' is distinct from 'internal_app' or not public.system_revision_is_qualified(p_revision_id)
  or not exists(select 1 from public.system_version_source_shares where source_system_id=r.source_system_id and grantee_workspace_id=p_workspace_id and revoked_at is null)
 then raise exception 'system_revision_not_qualified';end if;
 insert into public.system_package_install_grants(business_workspace_id,agency_workspace_id,source_revision_id,command_id,granted_by,expires_at)
 values(p_workspace_id,p_agency_workspace_id,p_revision_id,p_command_id,p_user_id,p_expires_at) on conflict(business_workspace_id,command_id) do nothing;
 select * into g from public.system_package_install_grants where business_workspace_id=p_workspace_id and command_id=p_command_id for update;
 if g.agency_workspace_id<>p_agency_workspace_id or g.source_revision_id<>p_revision_id or g.granted_by<>p_user_id or g.expires_at<>p_expires_at or g.status<>'active' then raise exception 'system_command_conflict';end if;
 insert into public.private_source_install_grants values(g.id) on conflict do nothing;
 return jsonb_build_object('grantId',g.id,'workspaceId',g.business_workspace_id,'commandId',g.command_id,'expiresAt',public.system_version_ts(g.expires_at));
end $$;
create function public.require_private_application_source_share(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_system_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.system_version_source_visible(p_source_system_id,p_user_id,p_verified_email) and exists(
 select 1 from public.system_version_source_shares where source_system_id=p_source_system_id and grantee_workspace_id=p_workspace_id and revoked_at is null);
$$;
-- The inherited scope core also derives read IDs. A false locked admission
-- must not be resurrected from that statement-snapshot read projection.
alter function public.system_actor_scope(uuid,uuid,text,boolean) rename to system_actor_scope_private_core;
revoke all on function public.system_actor_scope_private_core(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.system_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior record; g public.system_package_install_grants; removed_private boolean:=false;
begin
 prior:=public.system_actor_scope_private_core(p_workspace_id,p_user_id,p_verified_email,p_write);
 access:=prior.access;work_ids:=prior.work_ids;
 if p_write and access='agency' then
  for g in select item.* from public.system_package_install_grants item join public.private_source_install_grants marker on marker.grant_id=item.id
   where item.business_workspace_id=p_workspace_id and item.work_id=any(coalesce(work_ids,'{}'::uuid[])) order by item.id loop
   if not public.lock_system_package_install_grant(g.id,p_user_id,p_verified_email) then
    work_ids:=array_remove(work_ids,g.work_id);removed_private:=true;
   end if;
  end loop;
  if removed_private and cardinality(work_ids)=0 then raise exception 'business_record_access_denied';end if;
 end if;
end $$;
revoke all on function public.system_actor_scope(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
alter function public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid) rename to require_system_package_install_scope_private_core;
revoke all on function public.require_system_package_install_scope_private_core(uuid,uuid,text,uuid,integer,uuid) from public,anon,authenticated,service_role;
create function public.require_system_package_install_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_system_id uuid,p_revision integer,p_command_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; role text;
begin
 perform public.require_system_package_install_scope_private_core(p_workspace_id,p_user_id,p_verified_email,p_source_system_id,p_revision,p_command_id);
 -- Provider seats can project admin through system_version_member_role.
 -- Only actual customer membership may bypass the exact private install grant.
 select membership.role into role from public.workspace_memberships membership
  join public.users actor on actor.id=membership.user_id
  where membership.workspace_id=p_workspace_id and membership.user_id=p_user_id
   and actor.verified_at is not null and lower(actor.email)=lower(btrim(p_verified_email))
   for share of membership,actor;
 if coalesce(role,'') not in ('owner','admin') then
  select item.* into g from public.system_package_install_grants item join public.private_source_install_grants marker on marker.grant_id=item.id
   where item.business_workspace_id=p_workspace_id and item.command_id=p_command_id;
  if found then
   if not exists(select 1 from public.system_version_source_revisions revision
    where revision.id=g.source_revision_id and revision.source_system_id=p_source_system_id and revision.number=p_revision)
    then raise exception 'business_record_access_denied';end if;
   if not public.lock_system_package_install_grant(g.id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied';end if;
  end if;
 end if;
 return true;
end $$;
revoke all on function public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid) to service_role;
alter function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) rename to create_version_system_command_private_core;
revoke all on function public.create_version_system_command_private_core(uuid,text,jsonb,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
-- Repeat the private-share requirement inside the same transaction that
-- creates native work + System + lineage, even if the source becomes listed.
create function public.create_private_version_system_command(p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid,p_native_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid; source_id uuid; direct_role text; permission public.system_package_install_grants;
begin
 business:=(p_lineage->'version'->>'businessId')::uuid;
 source_id:=(p_lineage->'source'->>'systemId')::uuid;
 -- Current target writer scope and qualification locks precede private source.
 perform public.require_system_package_install_scope(business,p_user_id,p_verified_email,source_id,(p_lineage->'baseline'->>'revision')::integer,p_command_id);
 select membership.role into direct_role from public.workspace_memberships membership
  join public.users actor on actor.id=membership.user_id
  where membership.workspace_id=business and membership.user_id=p_user_id
   and actor.verified_at is not null and lower(actor.email)=lower(btrim(p_verified_email))
   for share of membership,actor;
 if coalesce(direct_role,'') not in ('owner','admin') then
  select g.* into permission from public.system_package_install_grants g
   join public.private_source_install_grants marker on marker.grant_id=g.id
   join public.system_version_source_revisions revision on revision.id=g.source_revision_id
   join public.system_version_sources source on source.system_id=revision.source_system_id
   where g.business_workspace_id=business and g.command_id=p_command_id
    and revision.source_system_id=source_id and revision.number=(p_lineage->'baseline'->>'revision')::integer
    and revision.id=(p_lineage->>'sourceRevisionId')::uuid
    and source.business_workspace_id=(p_lineage->'source'->>'businessId')::uuid
    and revision.definition=p_lineage->'baseline'->'definition';
  if not found then raise exception 'business_record_access_denied';end if;
  if not public.lock_system_package_install_grant(permission.id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied';end if;
 end if;
 perform 1 from public.system_version_source_shares where source_system_id=source_id and grantee_workspace_id=business and revoked_at is null for share;
 if not found then raise exception 'business_record_access_denied';end if;
 return public.create_version_system_command_private_core(p_user_id,p_verified_email,p_lineage,p_name,p_kind,p_command_id,p_native_payload);
end $$;
revoke all on function public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) to service_role;
revoke all on function public.system_package_install_grant_active(public.system_package_install_grants,uuid,text),public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.require_private_application_source_share(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.system_package_install_grant_active(public.system_package_install_grants,uuid,text),public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.require_private_application_source_share(uuid,uuid,text,uuid) to service_role;
revoke all on function public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb),public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb),public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean) to service_role;
-- Generic callers cannot bypass durable private source provenance.
create function public.create_version_system_command(p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid,p_native_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Private publication owns source FOR UPDATE before recording provenance.
 -- Acquire the same source first, then classify with a fresh statement snapshot.
 perform 1 from public.system_version_sources
  where system_id=(p_lineage->'source'->>'systemId')::uuid for share;
 if not found then raise exception 'business_record_access_denied';end if;
 if exists(select 1 from public.private_application_sources where source_system_id=(p_lineage->'source'->>'systemId')::uuid) then
  return public.create_private_version_system_command(p_user_id,p_verified_email,p_lineage,p_name,p_kind,p_command_id,p_native_payload);
 end if;
 return public.create_version_system_command_private_core(p_user_id,p_verified_email,p_lineage,p_name,p_kind,p_command_id,p_native_payload);
end $$;
revoke all on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) to service_role;
-- Bound only an installed private Version, preserving unrelated provider scope.
alter function public.system_version_access(public.system_versions,uuid,text,boolean) rename to system_version_access_private_core;
revoke all on function public.system_version_access_private_core(public.system_versions,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.system_version_access(v public.system_versions,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out actor_role text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; prior record; direct_role text; private_maker boolean:=false;
begin
 if p_write then
  select item.* into g from public.system_version_native_applications native
   join public.system_package_install_grants item on item.work_id=native.work_id and item.business_workspace_id=v.business_workspace_id
   join public.private_source_install_grants marker on marker.grant_id=item.id
   where native.version_id=v.id;
  if found then
   select membership.role into direct_role from public.workspace_memberships membership
    join public.users actor on actor.id=membership.user_id
    where membership.workspace_id=v.business_workspace_id and membership.user_id=p_user_id
     and actor.verified_at is not null and lower(actor.email)=lower(btrim(p_verified_email))
   for share of membership,actor;
   if direct_role is null then
    if not public.lock_system_package_install_grant(g.id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied';end if;
    private_maker:=true;
   end if;
  end if;
 end if;
 prior:=public.system_version_access_private_core(v,p_user_id,p_verified_email,p_write);
 access:=prior.access;actor_role:=prior.actor_role;
 if private_maker and access='full' then actor_role:='agency';end if;
end $$;
revoke all on function public.system_version_access(public.system_versions,uuid,text,boolean) from public,anon,authenticated,service_role;
-- Close inherited custom ACLs and custom default privileges before journaling.
-- Captured predecessor ACLs remain unchanged for exact inverse restoration.
do $forward_acl_closure$
declare signature text; grantee oid; function_owner oid; actual jsonb; expected jsonb;
begin
 foreach signature in array array[
 'public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb)',
 'public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean)',
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.system_package_install_grant_active_private_core(public.system_package_install_grants,uuid,text)',
 'public.lock_system_package_install_grant(uuid,uuid,text)',
 'public.lock_system_package_install_grant_private_core(uuid,uuid,text)',
 'public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz)',
 'public.require_private_application_source_share(uuid,uuid,text,uuid)',
 'public.system_actor_scope(uuid,uuid,text,boolean)',
 'public.system_actor_scope_private_core(uuid,uuid,text,boolean)',
 'public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)',
 'public.require_system_package_install_scope_private_core(uuid,uuid,text,uuid,integer,uuid)',
 'public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
 'public.system_version_access(public.system_versions,uuid,text,boolean)',
 'public.system_version_access_private_core(public.system_versions,uuid,text,boolean)',
 'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
 'public.create_version_system_command_private_core(uuid,text,jsonb,text,text,uuid,jsonb)'] loop
  select proowner into function_owner from pg_proc where oid=signature::regprocedure;
  if function_owner<>(current_user::regrole)::oid then raise exception 'private_definition_unsupported_acl_baseline: %',signature;end if;
  for grantee in select distinct acl.grantee from pg_proc p
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   where p.oid=signature::regprocedure and acl.grantee<>function_owner loop
   execute format('revoke all on function %s from %s cascade',signature,
    case when grantee=0 then 'PUBLIC' else quote_ident((select rolname from pg_roles where oid=grantee)) end);
  end loop;
  execute format('grant execute on function %s to %I with grant option',signature,current_user);
  if signature=any(array['public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb)','public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean)','public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)','public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz)','public.require_private_application_source_share(uuid,uuid,text,uuid)','public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)','public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)','public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)']) then
   execute format('grant execute on function %s to service_role',signature);
  end if;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable)
    order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into actual
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=signature::regprocedure;
  select jsonb_agg(jsonb_build_array(function_owner,allowed.grantee,'EXECUTE',allowed.grantable)
   order by function_owner,allowed.grantee,'EXECUTE',allowed.grantable) into expected
   from (select function_owner grantee,true grantable union all
    select ('service_role'::regrole)::oid,false where signature=any(array['public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb)','public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean)','public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)','public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz)','public.require_private_application_source_share(uuid,uuid,text,uuid)','public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)','public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)','public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)'])) allowed;
  if actual is distinct from expected then raise exception 'private_definition_forward_acl_not_closed: %',signature;end if;
 end loop;
end $forward_acl_closure$;
-- Journal every restored or dropped function, including renamed cores.
-- Rollback audits the entire successor before executing any restoration.
create table public.private_definition_function_receipts(signature text primary key,body_sha256 text not null,acl jsonb not null);
alter table public.private_definition_function_receipts enable row level security;
revoke all on public.private_definition_function_receipts from public,anon,authenticated,service_role;
-- The marker and both journals must remain owner-only even with custom defaults.
do $private_table_closure$
declare table_name text; grantee oid; table_owner oid; column_grant record;
begin
 foreach table_name in array array['public.private_application_sources','public.private_source_install_grants','public.private_definition_predecessors','public.private_definition_function_receipts'] loop
  select relowner into table_owner from pg_class where oid=table_name::regclass and relrowsecurity;
  if table_owner is distinct from (current_user::regrole)::oid then raise exception 'private_definition_table_authority_changed: %',table_name;end if;
  for grantee in select distinct acl.grantee from pg_class c
   cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
   where c.oid=table_name::regclass and acl.grantee<>table_owner loop
   execute format('revoke all on table %s from %s cascade',table_name,
    case when grantee=0 then 'PUBLIC' else quote_ident((select rolname from pg_roles where oid=grantee)) end);
  end loop;
  for column_grant in select attribute.attname,acl.grantee,acl.privilege_type from pg_attribute attribute
   cross join lateral aclexplode(attribute.attacl) acl
   where attribute.attrelid=table_name::regclass and attribute.attnum>0 and not attribute.attisdropped and acl.grantee<>table_owner loop
   if column_grant.privilege_type not in ('SELECT','INSERT','UPDATE','REFERENCES') then raise exception 'private_definition_table_authority_changed: %',table_name;end if;
   execute format('revoke %s (%I) on table %s from %s cascade',column_grant.privilege_type,column_grant.attname,table_name,
    case when column_grant.grantee=0 then 'PUBLIC' else quote_ident((select rolname from pg_roles where oid=column_grant.grantee)) end);
  end loop;
  if exists(select 1 from pg_policy where polrelid=table_name::regclass)
   or exists(select 1 from pg_attribute attribute cross join lateral aclexplode(attribute.attacl) acl
    where attribute.attrelid=table_name::regclass and attribute.attnum>0 and not attribute.attisdropped
     and (acl.grantee<>table_owner or acl.grantor<>table_owner)) then
   raise exception 'private_definition_table_authority_changed: %',table_name;
  end if;
  if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
   where c.oid=table_name::regclass and (acl.grantee<>c.relowner or acl.grantor<>c.relowner)) then
   raise exception 'private_definition_table_authority_changed: %',table_name;
  end if;
 end loop;
end $private_table_closure$;
insert into public.private_definition_function_receipts(signature,body_sha256,acl)
 select signature,encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex'),
 (select coalesce(jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable)
  order by a.grantor,a.grantee,a.privilege_type,a.is_grantable),'[]'::jsonb)
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=signature::regprocedure)
 from unnest(array[
 'public.publish_private_application_source(uuid,uuid,text,uuid,uuid,integer,jsonb)',
 'public.set_private_application_source_share(uuid,uuid,text,uuid,uuid,boolean)',
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.system_package_install_grant_active_private_core(public.system_package_install_grants,uuid,text)',
 'public.lock_system_package_install_grant(uuid,uuid,text)',
 'public.lock_system_package_install_grant_private_core(uuid,uuid,text)',
 'public.grant_private_application_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz)',
 'public.require_private_application_source_share(uuid,uuid,text,uuid)',
 'public.system_actor_scope(uuid,uuid,text,boolean)',
 'public.system_actor_scope_private_core(uuid,uuid,text,boolean)',
 'public.require_system_package_install_scope(uuid,uuid,text,uuid,integer,uuid)',
 'public.require_system_package_install_scope_private_core(uuid,uuid,text,uuid,integer,uuid)',
 'public.create_private_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
 'public.system_version_access(public.system_versions,uuid,text,boolean)',
 'public.system_version_access_private_core(public.system_versions,uuid,text,boolean)',
 'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
 'public.create_version_system_command_private_core(uuid,text,jsonb,text,text,uuid,jsonb)']) signature;
update public.private_definition_predecessors receipt set
 after_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex'),
 after_acl=(select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable)
  order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb)
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=receipt.signature::regprocedure);
commit;
