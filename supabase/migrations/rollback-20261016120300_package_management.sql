-- Guarded local rollback: package records require an explicit data-preserving retirement first.
begin;
set local lock_timeout='2s';
drop function public.save_system_version(uuid,text,uuid,bigint,jsonb);
alter function public.save_system_version_qualification_snapshot_core(uuid,text,uuid,bigint,jsonb) rename to save_system_version;
drop function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz);
alter function public.grant_system_package_install_snapshot_core(uuid,uuid,text,uuid,uuid,uuid,timestamptz) rename to grant_system_package_install;
drop function public.revoke_system_package_install(uuid,uuid,text,uuid);
alter function public.revoke_system_package_install_snapshot_core(uuid,uuid,text,uuid) rename to revoke_system_package_install;
create or replace function public.system_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing record; granted uuid[];
begin
 select coalesce(array_agg(g.work_id),'{}'::uuid[]) into granted from public.system_package_install_grants g where g.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
 begin existing:=public.system_actor_scope_package_core(p_workspace_id,p_user_id,p_verified_email,p_write); access:=existing.access; work_ids:=existing.work_ids;
 exception when others then if sqlerrm not in ('business_record_access_denied','workspace_membership_required') or cardinality(granted)=0 then raise; end if; access:='agency'; work_ids:='{}'::uuid[]; end;
 if access='agency' then work_ids:=array(select distinct unnest(coalesce(work_ids,'{}'::uuid[])||granted)); end if;
end $$;
create or replace function public.require_system_package_install_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_system_id uuid,p_revision integer,p_command_id uuid) returns boolean
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
create or replace function public.system_version_assert_source_manager(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare workspace_kind text; actor_role text;
begin
  select kind into workspace_kind from public.workspaces where id = p_workspace_id;
  if workspace_kind = 'customer' then
    actor_role := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  elsif workspace_kind = 'agency' then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
    actor_role := public.system_version_member_role(p_workspace_id, p_user_id, p_verified_email);
  end if;
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
end;
$$;
drop function public.read_system_package_source(uuid,uuid,uuid,text),public.require_system_package_revision_scope(uuid,uuid,uuid,text,boolean),public.read_system_package_install_grants(uuid,uuid,uuid,text),public.lock_system_package_install_grant(uuid,uuid,text),public.lock_system_revision_qualification(uuid);
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb),public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid) to service_role;
revoke all on function public.system_actor_scope(uuid,uuid,text,boolean),public.system_version_assert_source_manager(uuid,uuid,text) from public,anon,authenticated,service_role;
commit;
