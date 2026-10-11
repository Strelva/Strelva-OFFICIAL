-- Package-granted System reads use snapshot authority. Writer authorization,
-- revocation locks and exact source/revision/command limits remain unchanged.
begin;
set local lock_timeout='3s';
alter function public.system_read_scope(uuid,uuid,text,boolean) rename to system_read_scope_package_core;
revoke all on function public.system_read_scope_package_core(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.system_package_read_work_ids(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns uuid[]
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ids uuid[];
begin
 select coalesce(array_agg(g.work_id),'{}'::uuid[]) into ids from public.system_package_install_grants g
 where g.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
 -- The bundle migration owns the exact completed-installation read contract.
 if to_regprocedure('public.system_bundle_read_work_ids(uuid,uuid,text)') is not null then
  ids:=array(select distinct unnest(ids||public.system_bundle_read_work_ids(p_workspace_id,p_user_id,p_verified_email)));
 end if;
 return ids;
end $$;
create function public.system_read_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[])
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare existing record; granted uuid[];
begin
 if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
 granted:=public.system_package_read_work_ids(p_workspace_id,p_user_id,p_verified_email);
 begin
  existing:=public.system_read_scope_package_core(p_workspace_id,p_user_id,p_verified_email,false);
  access:=existing.access;work_ids:=existing.work_ids;
 exception when others then
  if sqlerrm not in ('business_record_access_denied','workspace_membership_required') or cardinality(granted)=0 then raise; end if;
  access:='agency';work_ids:='{}'::uuid[];
 end;
 if access='agency' then work_ids:=array(select distinct unnest(coalesce(work_ids,'{}'::uuid[])||granted)); end if;
end $$;
revoke all on function public.system_package_read_work_ids(uuid,uuid,text),public.system_read_scope(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.agency_can_read_package_work(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(p_work_id=any(public.system_package_read_work_ids(p_workspace_id,p_user_id,p_verified_email)),false)
 and exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id);
$$;
revoke all on function public.agency_can_read_package_work(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.agency_can_read_package_work(uuid,uuid,text,uuid) to service_role;
alter function public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean) rename to website_document_read_actor_package_core;
revoke all on function public.website_document_read_actor_package_core(uuid,uuid,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
create function public.website_document_read_actor(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_manage boolean,p_write boolean) returns void
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
 if p_manage=false and p_work_id is not null and public.agency_can_read_package_work(p_workspace_id,p_user_id,p_verified_email,p_work_id)
  and exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then return; end if;
 perform public.website_document_read_actor_package_core(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_manage,false);
end $$;
revoke all on function public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
do $repair$ declare target record; definition text;
begin
 for target in select * from (values
  ('public.read_website_documents(uuid,uuid,uuid,text,integer,boolean)','public.website_document_assert_actor(','public.website_document_read_actor('),
  ('public.read_website_document_receipts(uuid,uuid,uuid,text)','public.website_document_assert_actor(','public.website_document_read_actor('),
  ('public.read_business_system(uuid,uuid,text,uuid)','public.system_actor_scope(','public.system_read_scope('),
  ('public.read_business_system(uuid,uuid,text,uuid)','public.system_load(','public.system_read_load('),
  ('public.read_existing_business_systems(uuid,uuid,text)','public.system_actor_scope(','public.system_read_scope('),
  ('public.read_system_version(uuid,text,uuid)','public.system_version_access(','public.system_version_read_access('),
  ('public.read_system_version_for_system(uuid,uuid,text,uuid)','public.system_version_access(','public.system_version_read_access('),
  ('public.read_workspace_version_sources(uuid,uuid,text)','public.system_version_access(','public.system_version_read_access('),
  ('public.system_version_connection_holder(uuid,text,text)','public.system_version_access(','public.system_version_read_access('),
  ('public.read_system_package_listings(uuid,uuid,text)','public.system_actor_scope(','public.system_read_scope('),
  ('public.read_system_package_creator(uuid,uuid,text,uuid)','public.system_version_access(','public.system_version_read_access(')
 ) changes(signature,old_call,new_call) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if position(target.old_call in definition)=0 then raise exception 'package_reader_authority_call_not_found: %',target.signature; end if;
  execute replace(definition,target.old_call,target.new_call);
 end loop;
end $repair$;
notify pgrst,'reload schema';
commit;
