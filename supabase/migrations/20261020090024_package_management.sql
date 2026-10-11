begin;
set local lock_timeout='2s';
create function public.read_system_package_source(p_workspace_id uuid,p_system_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('workspaceId',s.business_workspace_id,'systemId',s.system_id,'source',public.system_version_source_json(s,p_user_id,p_verified_email),'revision',case when r.id is null then null else public.system_version_revision_json(r,s.business_workspace_id) end,'canReview',exists(select 1 from public.system_revision_reviewers q where q.user_id=p_user_id and q.active))
 from public.system_version_sources s left join lateral(select r.* from public.system_version_source_revisions r where r.source_system_id=s.system_id order by number desc limit 1) r on true
 where s.system_id=p_system_id and s.business_workspace_id=p_workspace_id and exists(select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null and m.workspace_id=p_workspace_id and m.role in ('owner','admin'));
$$;
create function public.require_system_package_revision_scope(p_workspace_id uuid,p_revision_id uuid,p_user_id uuid,p_verified_email text,p_review boolean) returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.system_version_source_revisions r join public.system_version_sources s on s.system_id=r.source_system_id join public.users u on u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null where r.id=p_revision_id and s.business_workspace_id=p_workspace_id and ((p_review and exists(select 1 from public.system_revision_reviewers q where q.user_id=p_user_id and q.active)) or (not p_review and exists(select 1 from public.workspace_memberships m where m.user_id=p_user_id and m.workspace_id=p_workspace_id and m.role in ('owner','admin'))))) then raise exception 'business_record_access_denied'; end if;
 return true;
end $$;
create function public.read_system_package_install_grants(p_workspace_id uuid,p_revision_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('grantId',g.id,'workspaceId',g.business_workspace_id,'commandId',g.command_id,'agencyWorkspaceId',g.agency_workspace_id,'revisionId',g.source_revision_id,'expiresAt',public.system_version_ts(g.expires_at),'status',g.status) order by g.created_at desc),'[]'::jsonb) from public.system_package_install_grants g where g.business_workspace_id=p_workspace_id and g.source_revision_id=p_revision_id and (public.system_package_install_grant_active(g,p_user_id,p_verified_email) or public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email)='owner');
$$;
create function public.lock_system_package_install_grant(p_grant_id uuid,p_user_id uuid,p_verified_email text) returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; delegation_id uuid;
begin
 select * into g from public.system_package_install_grants where id=p_grant_id for share;
 if not found then return false; end if;
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then return false; end if;
 perform 1 from public.workspace_memberships where user_id=p_user_id and workspace_id=g.agency_workspace_id and role in ('owner','admin') for share;
 if not found then return false; end if;
 perform 1 from public.workspace_memberships where user_id=g.granted_by and workspace_id=g.business_workspace_id and role='owner' for share;
 if not found then return false; end if;
 select d.id into delegation_id from public.workspace_delegations d where d.customer_workspace_id=g.business_workspace_id and d.agency_workspace_id=g.agency_workspace_id and d.status='active' order by d.id limit 1 for share;
 if not found then return false; end if;
 return public.system_package_install_grant_active(g,p_user_id,p_verified_email);
end $$;
create function public.lock_system_revision_qualification(p_revision_id uuid) returns boolean language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare q public.system_revision_qualifications;
begin
 select * into q from public.system_revision_qualifications where revision_id=p_revision_id for share;
 if not found or q.human_state<>'approved' then return false; end if;
 perform 1 from public.system_revision_reviewers where user_id=q.reviewer_id and active and policy_version=q.reviewer_policy_version for share;
 if not found then return false; end if;
 return public.system_revision_is_qualified(p_revision_id);
end $$;
-- Source publication locks actual verified authority, including an agency membership.
create or replace function public.system_version_assert_source_manager(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text; role text;
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 select w.kind into kind from public.workspaces w where w.id=p_workspace_id for share;
 select m.role into role from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin') for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 if kind='customer' then perform public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 elsif kind='agency' then perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 else raise exception 'business_record_access_denied'; end if;
end $$;
alter function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) rename to grant_system_package_install_snapshot_core;
revoke all on function public.grant_system_package_install_snapshot_core(uuid,uuid,text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.grant_system_package_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_revision_id uuid,p_command_id uuid,p_expires_at timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_workspace_id and status='active' for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 if not public.lock_system_revision_qualification(p_revision_id) then raise exception 'system_revision_not_qualified'; end if;
 return public.grant_system_package_install_snapshot_core(p_workspace_id,p_user_id,p_verified_email,p_agency_workspace_id,p_revision_id,p_command_id,p_expires_at);
end $$;
alter function public.revoke_system_package_install(uuid,uuid,text,uuid) rename to revoke_system_package_install_snapshot_core;
revoke all on function public.revoke_system_package_install_snapshot_core(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.revoke_system_package_install(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_grant_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 return public.revoke_system_package_install_snapshot_core(p_workspace_id,p_user_id,p_verified_email,p_grant_id);
end $$;
alter function public.save_system_version(uuid,text,uuid,bigint,jsonb) rename to save_system_version_qualification_snapshot_core;
revoke all on function public.save_system_version_qualification_snapshot_core(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.save_system_version(p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions; rid uuid;
begin
 select * into v from public.system_versions where id=p_version_id for update;
 if not found then raise exception 'system_not_found'; end if;
 perform public.system_actor_scope(v.business_workspace_id,p_user_id,p_verified_email,true);
 if (p_lineage->'baseline'->>'revision')::integer<>v.baseline_revision or jsonb_array_length(p_lineage->'releases')>(select count(*) from public.system_version_releases where version_id=v.id) then
  select id into rid from public.system_version_source_revisions where source_system_id=v.source_system_id and number=(p_lineage->'baseline'->>'revision')::integer;
  if rid is null or not public.lock_system_revision_qualification(rid) then raise exception 'system_revision_not_qualified'; end if;
 end if;
 return public.save_system_version_qualification_snapshot_core(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage);
end $$;
-- Qualified grant writers hold the exact grant, both authority memberships and relationship
-- until the native draft/update transaction completes; revocation cannot race past a check.
create or replace function public.system_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[]) language plpgsql security definer set search_path=public,pg_temp as $$
declare existing record; granted uuid[]:='{}'; g public.system_package_install_grants;
begin
 for g in select * from public.system_package_install_grants x where x.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(x,p_user_id,p_verified_email) order by x.id loop
  if not p_write or public.lock_system_package_install_grant(g.id,p_user_id,p_verified_email) then granted:=array_append(granted,g.work_id); end if;
 end loop;
 begin existing:=public.system_actor_scope_package_core(p_workspace_id,p_user_id,p_verified_email,p_write);access:=existing.access;work_ids:=existing.work_ids;
 exception when others then if sqlerrm not in ('business_record_access_denied','workspace_membership_required') or cardinality(granted)=0 then raise; end if;access:='agency';work_ids:='{}'; end;
 if access='agency' then work_ids:=array(select distinct unnest(coalesce(work_ids,'{}'::uuid[])||granted)); end if;
end $$;
-- Install RPC calls this before source reads, so it must acquire the same writer scope.
create or replace function public.require_system_package_install_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_system_id uuid,p_revision integer,p_command_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; src public.system_version_sources; role text; scope record; visible boolean:=false;
begin
 scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
 select * into r from public.system_version_source_revisions where source_system_id=p_source_system_id and number=p_revision for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 role:=public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email);
 if coalesce(role,'') not in ('owner','admin') and not exists(select 1 from public.system_package_install_grants g where g.business_workspace_id=p_workspace_id and g.command_id=p_command_id and g.source_revision_id=r.id and public.system_package_install_grant_active(g,p_user_id,p_verified_email)) then raise exception 'business_record_access_denied'; end if;
 select * into src from public.system_version_sources where system_id=p_source_system_id for share;
 if src.business_workspace_id=p_workspace_id or src.listing_state='listed' then visible:=true;
 elsif src.listing_state='clients' then
  perform 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=src.business_workspace_id and status='active' for share;
  visible:=found;
 end if;
 if not visible then
  perform 1 from public.system_version_source_shares where source_system_id=p_source_system_id and grantee_workspace_id=p_workspace_id for share;
  visible:=found;
 end if;
 if not visible or not public.system_version_source_visible(p_source_system_id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied'; end if;
 if not public.lock_system_revision_qualification(r.id) then raise exception 'system_revision_not_qualified'; end if;
 return true;
end $$;
revoke all on function public.read_system_package_source(uuid,uuid,uuid,text),public.require_system_package_revision_scope(uuid,uuid,uuid,text,boolean),public.read_system_package_install_grants(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_system_package_source(uuid,uuid,uuid,text),public.require_system_package_revision_scope(uuid,uuid,uuid,text,boolean),public.read_system_package_install_grants(uuid,uuid,uuid,text) to service_role;
revoke all on function public.system_actor_scope(uuid,uuid,text,boolean),public.system_version_assert_source_manager(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.lock_system_revision_qualification(uuid),public.lock_system_package_install_grant(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
grant execute on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz),public.revoke_system_package_install(uuid,uuid,text,uuid) to service_role;
commit;
