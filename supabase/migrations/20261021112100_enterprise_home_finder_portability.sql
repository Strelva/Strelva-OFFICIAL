begin;
set local lock_timeout='5s';
-- Compose after investigation history and retain every preceding category/reader.
alter function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category_before_enterprise;
revoke all on function public.export_workspace_v3_category_before_enterprise(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
alter function public.workspace_export_v3_categories() rename to workspace_export_v3_categories_before_enterprise;
create function public.workspace_export_v3_categories() returns text[] language sql immutable set search_path=public,pg_temp as $$
select public.workspace_export_v3_categories_before_enterprise()||array['enterprise_units','enterprise_unit_versions','enterprise_unit_history','home_finder_installations','home_finder_receipts','home_finder_history'];$$;
create function public.export_workspace_v3_category(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_category text,p_offset integer default 0,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb;
begin
 if p_category not in('enterprise_units','enterprise_unit_versions','enterprise_unit_history','home_finder_installations','home_finder_receipts','home_finder_history') then
  return public.export_workspace_v3_category_before_enterprise(p_workspace_id,p_user_id,p_verified_email,p_category,p_offset,p_limit);
 end if;
 perform public.workspace_export_v3_read_role(p_workspace_id,p_user_id,p_verified_email);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'workspace_export_invalid'; end if;
 if p_category='enterprise_units' then
  select coalesce(jsonb_agg(payload order by id),'[]'::jsonb) into items from (
   select u.id,jsonb_build_object('id',u.id,'name',u.name,'kind',u.kind,'status',u.status,'revision',u.row_revision,'parentId',case when parent.business_workspace_id=p_workspace_id then u.parent_id else null end,'createdAt',u.created_at,'updatedAt',u.updated_at) payload
   from public.enterprise_units u left join public.enterprise_units parent on parent.id=u.parent_id
   where u.business_workspace_id=p_workspace_id order by u.id offset p_offset limit p_limit) page;
 elsif p_category='enterprise_unit_versions' then
  select coalesce(jsonb_agg(payload order by id),'[]'::jsonb) into items from (
   select v.version_id id,jsonb_build_object('unitId',v.unit_id,'versionId',v.version_id,'boundAt',v.bound_at) payload
   from public.enterprise_unit_versions v join public.enterprise_units u on u.id=v.unit_id where u.business_workspace_id=p_workspace_id order by v.version_id offset p_offset limit p_limit) page;
 elsif p_category='enterprise_unit_history' then
  select coalesce(jsonb_agg(payload order by id),'[]'::jsonb) into items from (
   select a.id,jsonb_build_object('unitId',a.unit_id,'action',a.action,'revision',a.row_revision,'occurredAt',a.occurred_at) payload
   from public.enterprise_unit_audit a join public.enterprise_units u on u.id=a.unit_id where u.business_workspace_id=p_workspace_id order by a.id offset p_offset limit p_limit) page;
 elsif p_category='home_finder_installations' then
  select coalesce(jsonb_agg(payload order by id),'[]'::jsonb) into items from (
   select b.id,jsonb_build_object('id',b.id,'systemId',b.system_id,'brokerageName',b.brokerage_name,'approvedOrigin',b.approved_origin,'licenseReference',b.license_reference,'licenseExpiresAt',b.license_expires_at,'sourceName',b.source_name,'status',b.status,'revision',b.row_revision,'qualifiedAt',b.qualified_at,'createdAt',b.created_at) payload
   from public.home_finder_bindings b where b.business_workspace_id=p_workspace_id order by b.id offset p_offset limit p_limit) page;
 elsif p_category='home_finder_receipts' then
  -- Only outcome evidence: receipt capabilities, provider routing, digests and buyer content are omitted.
  select coalesce(jsonb_agg(payload order by binding_id,submission_id),'[]'::jsonb) into items from (
   select r.binding_id,r.submission_id,jsonb_build_object('installationId',r.binding_id,'inquiryId',r.submission_id,'installationRevision',r.binding_revision,'status',r.status,'startedAt',r.started_at,'updatedAt',r.updated_at) payload
   from public.home_finder_intake_receipts r join public.home_finder_bindings b on b.id=r.binding_id where b.business_workspace_id=p_workspace_id order by r.binding_id,r.submission_id offset p_offset limit p_limit) page;
 else
  select coalesce(jsonb_agg(payload order by id),'[]'::jsonb) into items from (
   select a.id,jsonb_build_object('installationId',a.binding_id,'action',a.action,'revision',a.row_revision,'occurredAt',a.occurred_at) payload
   from public.home_finder_binding_audit a join public.home_finder_bindings b on b.id=a.binding_id where b.business_workspace_id=p_workspace_id order by a.id offset p_offset limit p_limit) page;
 end if;
 return jsonb_build_object('category',p_category,'items',items,'next',case when jsonb_array_length(items)=p_limit then p_offset+p_limit else null end);
end;$$;
revoke all on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;
alter function public.read_workspace_exit_handoff_plan(uuid,uuid,text) rename to read_workspace_exit_handoff_plan_before_home_finder;
revoke all on function public.read_workspace_exit_handoff_plan_before_home_finder(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_workspace_exit_handoff_plan(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare plan jsonb; installations jsonb;
begin
 plan:=public.read_workspace_exit_handoff_plan_before_home_finder(p_workspace_id,p_user_id,p_verified_email);
 perform public.workspace_export_v3_read_role(p_workspace_id,p_user_id,p_verified_email);
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'systemId',b.system_id,'brokerageName',b.brokerage_name,'approvedOrigin',b.approved_origin,'licenseExpiresAt',b.license_expires_at,'acceptedInquiries',(select count(*) from public.home_finder_intake_receipts r where r.binding_id=b.id and r.status in('pending','delivered','unknown','started')),'newIntakeBlockedOnExit',true,'retainedReceiptObligation',true,'buyerContentExport','Request the licensed IDX provider export before its retention window expires. Native records contain outcome evidence only.') order by b.id),'[]'::jsonb) into installations from public.home_finder_bindings b where b.business_workspace_id=p_workspace_id;
 return plan||jsonb_build_object('homeFinder',installations);
end;$$;
revoke all on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
