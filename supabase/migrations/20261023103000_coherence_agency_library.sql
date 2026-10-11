begin;
-- Presentation only: retain the existing handoff read's scope and cancellation
-- projection, then enrich precisely those records. No transition changes.
alter function public.read_provider_change_requests(uuid,uuid,text) rename to read_provider_change_requests_before_coherence;
revoke all on function public.read_provider_change_requests_before_coherence(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_provider_change_requests(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare requests jsonb;
begin
 requests := public.read_provider_change_requests_before_coherence(p_workspace_id,p_user_id,p_verified_email);
 return coalesce((select jsonb_agg(item || jsonb_build_object(
   'business_name',b.name,'outgoing_agency_name',outgoing.name,'incoming_agency_name',incoming.name,
   'requested_by_name',requester.email,
   'completed_at',case when item->>'status'='completed' then ended.created_at else null end,
   'summary',jsonb_build_array(
     jsonb_build_object('label','Business workspace','detail','The recorded business is ' || coalesce(b.name,'name unavailable') || '. The agency change refers to this same workspace.','verified',true),
     jsonb_build_object('label','Outgoing agency access','detail',case when p.status='ended' then 'The outgoing agency relationship is recorded as ended.' else 'The outgoing agency relationship is still recorded as active. Independent grants must be reviewed separately.' end,'verified',p.id is not null),
     jsonb_build_object('label','Source definitions','detail',case when h.id is not null then jsonb_array_length(h.definitions)::text || ' agency source revisions were recorded in the immutable handoff snapshot.' else 'No agency source snapshot has been recorded for this relationship.' end,'verified',true),
     jsonb_build_object('label','System and History retention','detail','Retention and native publication behavior have not been verified for this handoff.','verified',false),
     jsonb_build_object('label','Source updates and royalties','detail','Freezing, future update eligibility and royalty rules have not been verified. Creator attribution is not evidence of those terms.','verified',false),
     jsonb_build_object('label','Open Requests','detail','Outstanding Requests and responsibility transfers have not been verified for this handoff.','verified',false)
   )) order by position)
 from jsonb_array_elements(requests) with ordinality rows(item,position)
 left join public.workspaces b on b.id=(item->>'business_workspace_id')::uuid
 left join public.workspace_providers p on p.id=(item->>'old_provider_id')::uuid
 left join public.workspaces outgoing on outgoing.id=p.provider_workspace_id
 left join public.workspaces incoming on incoming.id=(item->>'new_agency_workspace_id')::uuid
 left join public.users requester on requester.id=(item->>'requested_by')::uuid
 left join public.agency_handoff_receipts ended on ended.reference_id=p.id and ended.kind='provider_ended' and ended.agency_workspace_id=p.provider_workspace_id
 left join public.agency_package_handoffs h on h.provider_id=p.id),'[]'::jsonb);
end $$;
revoke all on function public.read_provider_change_requests(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_provider_change_requests(uuid,uuid,text) to service_role;

-- A named, current assignment can be inspected before the owner grants draft
-- access. Draft reads/writes retain their separate existing grant checks.
create function public.read_agency_website_preparation_context(p_user_id uuid,p_verified_email text,p_binding_id uuid,p_delivery_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform public.agency_managed_website_draft_identity(p_user_id,p_verified_email);
 select jsonb_build_object('bindingId',binding.id,'businessWorkspaceId',target.business_workspace_id,
   'businessName',customer.name,'agencyWorkspaceId',target.agency_workspace_id,'agencyName',agency.name,
   'operatorUserId',target.operator_user_id,'personName',person.email,'websiteName',coalesce(tenant.site_name,binding.site_name_at_binding),
   'expiresAt',public.system_version_ts(target.expires_at),'deliveryId',target.delivery_id)
 into result
 from public.offering_website_bindings binding
 join public.offering_provider_deliveries delivery on delivery.business_workspace_id=binding.business_workspace_id
 join lateral public.agency_managed_website_delivery_target(delivery.id,binding.id) target on true
 join public.workspaces customer on customer.id=target.business_workspace_id
 join public.workspaces agency on agency.id=target.agency_workspace_id
 join public.users person on person.id=target.operator_user_id
 left join public.tenants tenant on tenant.stable_id=binding.tenant_stable_id
 where binding.id=p_binding_id and (p_delivery_id is null or delivery.id=p_delivery_id)
 and (exists(select 1 from public.workspace_memberships m where m.workspace_id=target.business_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin'))
   or (target.operator_user_id=p_user_id and exists(
     select 1 from public.workspace_memberships m
     join public.provider_seats seat on seat.agency_workspace_id=m.workspace_id and seat.customer_workspace_id=target.business_workspace_id and seat.status='active'
     join public.agency_client_staff staff on staff.agency_workspace_id=seat.agency_workspace_id and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=m.user_id and staff.status='active'
     where m.workspace_id=target.agency_workspace_id and m.user_id=p_user_id)))
 order by target.expires_at desc,target.delivery_id limit 1;
 if result is null then raise exception 'agency_managed_website_draft_denied'; end if;
 return result;
end $$;
revoke all on function public.read_agency_website_preparation_context(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_agency_website_preparation_context(uuid,text,uuid,uuid) to service_role;

-- The existing grant command locks and checks the live assignment. Comparing
-- its result here is in that same transaction: a reassigned person or agency
-- rolls back the grant, rather than consenting to an identity never shown.
create function public.grant_named_agency_website_draft_edit_server(
 p_user_id uuid,p_verified_email text,p_delivery_id uuid,p_binding_id uuid,
 p_subscription_exemption boolean,p_agency_workspace_id uuid,p_operator_user_id uuid
) returns setof public.agency_managed_website_draft_grants
language plpgsql security definer set search_path=public,pg_temp as $$
declare granted public.agency_managed_website_draft_grants;
begin
 select * into granted from public.grant_agency_managed_website_draft_edit_server(p_user_id,p_verified_email,p_delivery_id,p_binding_id,p_subscription_exemption);
 if granted.id is null or granted.agency_workspace_id is distinct from p_agency_workspace_id
   or granted.operator_user_id is distinct from p_operator_user_id then
   raise exception 'agency_managed_website_draft_conflict';
 end if;
 return next granted;
end $$;
revoke all on function public.grant_named_agency_website_draft_edit_server(uuid,text,uuid,uuid,boolean,uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_named_agency_website_draft_edit_server(uuid,text,uuid,uuid,boolean,uuid,uuid) to service_role;

-- Sources and installed Versions use the same creator attribution entrance.
-- Installed reads keep system_version_read_access; source reads reuse the
-- existing source-owner/admin check rather than admitting an unrelated creator.
create or replace function public.read_system_package_creator(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.system_versions; a record; creator text; source jsonb; creator_id uuid; revision_id uuid;
begin
 select * into v from public.system_versions where business_workspace_id=p_workspace_id and version_system_id=p_system_id;
 if found then
   a:=public.system_version_read_access(v,p_user_id,p_verified_email,false);
   if a.access is null then raise exception 'business_record_access_denied'; end if;
   creator_id:=v.creator_workspace_id; revision_id:=v.installed_source_revision_id;
 else
   source:=public.read_system_package_source(p_workspace_id,p_system_id,p_user_id,p_verified_email);
   if source is null or source->'revision'='null'::jsonb then raise exception 'business_record_access_denied'; end if;
   select s.creator_workspace_id into creator_id from public.system_version_sources s where s.system_id=p_system_id and s.business_workspace_id=p_workspace_id;
   revision_id:=(source->'revision'->'source'->>'revisionId')::uuid;
 end if;
 select name into creator from public.workspaces where id=creator_id;
 return jsonb_build_object('creatorWorkspaceId',creator_id,'creatorName',creator,'sourceRevisionId',revision_id);
end $$;
revoke all on function public.read_system_package_creator(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_system_package_creator(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
