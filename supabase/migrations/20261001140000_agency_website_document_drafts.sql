-- Prepared v2 catalog editing through the existing native expiring grant.
-- No membership, grant, publisher, owner-confirmation or tenant authority is added.
create function public.website_catalog_native_section(p_type text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_type when 'Hero' then 'hero' when 'Header' then 'navigation' when 'Footer' then 'footer' when 'Story' then 'story' when 'ServiceGrid' then 'services' when 'ServiceDetail' then 'services' when 'Testimonials' then 'testimonials' when 'Faq' then 'faq' when 'Hours' then 'contact' when 'Locations' then 'contact' when 'Map' then 'contact' when 'Booking' then 'contact' when 'InquiryForm' then 'contact' else null end;
$$;
revoke all on function public.website_catalog_native_section(text) from public,anon,authenticated,service_role;

create function public.agency_website_document_target(p_user_id uuid,p_verified_email text,p_binding_id uuid,p_work_id uuid,p_section text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare grant_row public.agency_managed_website_draft_grants; target record; work public.saved_product_work; sections text[]; selected_section text;
begin
 perform public.agency_managed_website_draft_identity(p_user_id,p_verified_email);
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'agency_managed_website_draft_denied'; end if;
 -- Match the existing preparation/revocation lock order and recheck the native
 -- accepted assignment, installation, delivery, sponsor and grant after locks.
 perform pg_advisory_xact_lock(hashtextextended('agency-managed-website:'||p_binding_id::text,0));
 select * into grant_row from public.agency_managed_website_draft_grants g where g.managed_website_binding_id=p_binding_id and g.operator_user_id=p_user_id and g.status='active' and g.expires_at>clock_timestamp() order by g.created_at desc,g.id desc limit 1;
 if not found then raise exception 'agency_managed_website_draft_denied'; end if;
 perform public.agency_managed_website_lock_target(grant_row.delivery_id,p_binding_id);
 select * into grant_row from public.agency_managed_website_draft_grants where id=grant_row.id for update;
 if grant_row.status<>'active' or grant_row.expires_at<=clock_timestamp() or grant_row.operator_user_id<>p_user_id then raise exception 'agency_managed_website_draft_denied'; end if;
 perform 1 from public.service_requests where business_workspace_id=grant_row.business_workspace_id and status='requested' and provider_acceptance='accepted' for share;
 select * into target from public.agency_managed_website_delivery_target(grant_row.delivery_id,p_binding_id);
 if not found or target.operator_user_id<>p_user_id or target.assignment_id<>grant_row.assignment_id or target.agency_workspace_id<>grant_row.agency_workspace_id or target.business_workspace_id<>grant_row.business_workspace_id then raise exception 'agency_managed_website_draft_denied'; end if;
 -- Catalog edits retain current business/native owner sponsorship and exact
 -- native identity, so a stale same-slug row cannot bind them.
 perform 1 from public.workspace_memberships where workspace_id=target.business_workspace_id and user_id=grant_row.granted_by for share;
 perform 1 from public.memberships where user_id=grant_row.granted_by and tenant_id=target.tenant_id and tenant_stable_id=target.tenant_stable_id for share;
 if not exists(select 1 from public.workspace_memberships where workspace_id=target.business_workspace_id and user_id=grant_row.granted_by and role='owner') or not exists(select 1 from public.memberships where user_id=grant_row.granted_by and tenant_id=target.tenant_id and tenant_stable_id=target.tenant_stable_id and role='owner') then raise exception 'agency_managed_website_draft_denied'; end if;
 if not exists(select 1 from public.memberships m where m.user_id=target.sponsor_user_id and m.tenant_id=target.tenant_id and m.tenant_stable_id=target.tenant_stable_id and m.role='owner') then raise exception 'agency_managed_website_draft_denied'; end if;
 select array_agg(distinct btrim(step->'input'->>'section') order by btrim(step->'input'->>'section')) into sections
 from public.operational_assignments a join public.saved_product_work r on r.id=a.work_id cross join lateral jsonb_array_elements(r.payload->'steps') step
 where a.id=target.assignment_id and step->>'operation'='website.draft' and step->>'workId'=p_binding_id::text and step->'input'->>'bindingId'=p_binding_id::text and step->'input'->>'kind'='draft' and btrim(step->'input'->>'section') in ('hero','navigation','footer','story','services','testimonials','faq','contact');
 selected_section:=coalesce(p_section,sections[1]);
 if selected_section is null or not(selected_section=any(sections)) or not public.agency_managed_website_draft_section_allowed(grant_row.delivery_id,p_binding_id,selected_section) then raise exception 'agency_managed_website_draft_denied'; end if;
 select w.* into work from public.website_document_publications p join public.saved_product_work w on w.id=p.website_work_id and w.workspace_id=p.workspace_id join public.offering_website_bindings b on b.id=p_binding_id and b.business_workspace_id=p.workspace_id and b.tenant_stable_id=target.tenant_stable_id and b.tenant_id_at_binding=p.tenant_id
 where p.tenant_id=target.tenant_id and p.workspace_id=target.business_workspace_id and w.product_id='websites' and w.resource_kind='website' and w.payload->>'version'='2' for update of p,w;
 -- A native legacy website has no catalog candidate; no new authority follows.
 if not found then
   if p_work_id is not null then raise exception 'agency_managed_website_draft_denied'; end if;
   return null;
 end if;
 if p_work_id is not null and work.id<>p_work_id then raise exception 'agency_managed_website_draft_denied'; end if;
 return jsonb_build_object('work',to_jsonb(work),'section',selected_section,'sections',to_jsonb(sections));
end $$;
revoke all on function public.agency_website_document_target(uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.read_agency_website_document_candidate(p_user_id uuid,p_verified_email text,p_binding_id uuid,p_work_id uuid default null,p_section text default null,p_subscription_exemption boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform set_config('strelva.agency_subscription_exemption',case when p_subscription_exemption then 'on' else 'off' end,true);
 return public.agency_website_document_target(p_user_id,p_verified_email,p_binding_id,p_work_id,p_section);
end $$;
revoke all on function public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean) to service_role;

create function public.commit_agency_website_document_candidate(p_user_id uuid,p_verified_email text,p_binding_id uuid,p_work_id uuid,p_section text,p_expected_work_revision integer,p_expected_document_revision integer,p_expected_candidate_revision integer,p_expected_candidate_hash text,p_content_hash text,p_document jsonb,p_payload jsonb,p_subscription_exemption boolean default false) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare access jsonb; work public.saved_product_work; head public.website_document_heads; prior public.website_documents; latest jsonb; node_id text; old_node jsonb; new_node jsonb; child_id text; fact_id text; fact jsonb;
begin
 perform set_config('strelva.agency_subscription_exemption',case when p_subscription_exemption then 'on' else 'off' end,true);
 access:=public.agency_website_document_target(p_user_id,p_verified_email,p_binding_id,p_work_id,p_section);
 if access is null then raise exception 'agency_managed_website_draft_denied'; end if;
 select * into work from public.saved_product_work where id=p_work_id for update;
 select * into head from public.website_document_heads where website_work_id=p_work_id for update;
 select * into prior from public.website_documents where website_work_id=p_work_id and revision=head.revision;
 if p_expected_work_revision is null or p_expected_work_revision<0 or p_expected_work_revision>=2147483647 or p_expected_document_revision is null or p_expected_document_revision<1 or p_expected_document_revision>=2147483647 or work.payload->>'revision' is distinct from p_expected_work_revision::text or head.revision is distinct from p_expected_document_revision or head.revision is distinct from p_expected_candidate_revision or prior.content_hash is distinct from p_expected_candidate_hash or work.payload->'candidate'->>'revision' is distinct from p_expected_candidate_revision::text or work.payload->'candidate'->>'contentHash' is distinct from p_expected_candidate_hash or work.payload->'candidate'->'document' is distinct from prior.document then raise exception 'website_revision_conflict'; end if;
 if p_document is null or jsonb_typeof(p_document->'nodes') is distinct from 'object' or jsonb_typeof(p_document->'facts') is distinct from 'object' or (p_document-'nodes'-'facts') is distinct from (prior.document-'nodes'-'facts') then raise exception 'agency_managed_website_draft_denied'; end if;
 for node_id in select key from jsonb_object_keys(prior.document->'nodes') key union select key from jsonb_object_keys(p_document->'nodes') key loop
   old_node:=prior.document->'nodes'->node_id; new_node:=p_document->'nodes'->node_id;
   if old_node is distinct from new_node then
     if (old_node is not null and public.website_catalog_native_section(old_node->>'type') is distinct from p_section) or (new_node is not null and public.website_catalog_native_section(new_node->>'type') is distinct from p_section) then raise exception 'agency_managed_website_draft_denied'; end if;
     -- Moving or reordering a parent can move any descendant across scopes.
     -- Walk both graphs with UNION deduplication, including unchanged children.
     if coalesce(old_node->'children','[]') is distinct from coalesce(new_node->'children','[]') then
       for child_id in with recursive subtree(id) as (
         select value from jsonb_array_elements_text(coalesce(old_node->'children','[]')||coalesce(new_node->'children','[]')) a(value)
         union
         select value from subtree parent cross join lateral jsonb_array_elements_text(coalesce(prior.document->'nodes'->parent.id->'children','[]')||coalesce(p_document->'nodes'->parent.id->'children','[]')) a(value)
       ) select id from subtree loop
         if (prior.document->'nodes'->child_id is not null and public.website_catalog_native_section(prior.document->'nodes'->child_id->>'type') is distinct from p_section) or (p_document->'nodes'->child_id is not null and public.website_catalog_native_section(p_document->'nodes'->child_id->>'type') is distinct from p_section) or coalesce(p_document->'nodes'->child_id,prior.document->'nodes'->child_id) is null then raise exception 'agency_managed_website_draft_denied'; end if;
       end loop;
     end if;
   end if;
 end loop;
 for fact_id,fact in select key,value from jsonb_each(prior.document->'facts') loop
   if fact is distinct from p_document->'facts'->fact_id then raise exception 'agency_managed_website_draft_denied'; end if;
 end loop;
 for fact_id,fact in select key,value from jsonb_each(p_document->'facts') loop
   if fact is distinct from prior.document->'facts'->fact_id then
     if fact->>'origin' is distinct from 'owner_stated' or fact->'highRisk' is distinct from 'true'::jsonb or fact->'verification'->'supported' is distinct from 'false'::jsonb or fact->'verification'->'confidence' is distinct from '0'::jsonb or not exists(select 1 from jsonb_each(p_document->'nodes') n where n.value is distinct from prior.document->'nodes'->n.key and n.value->'factIds' ? fact_id and public.website_catalog_native_section(n.value->>'type')=p_section) then raise exception 'agency_managed_website_draft_denied'; end if;
   end if;
 end loop;
 if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2000000 or (p_payload-array['revision','title','status','candidate','approvedCandidateRevision','checkpoint','lastError','history','audit']) is distinct from (work.payload-array['revision','title','status','candidate','approvedCandidateRevision','checkpoint','lastError','history','audit']) or p_payload->>'revision' is distinct from (p_expected_work_revision+1)::text or p_payload->>'status' is distinct from 'review_ready' or p_payload->'approvedCandidateRevision' is distinct from 'null'::jsonb or p_payload->'checkpoint' is distinct from 'null'::jsonb or p_payload->'lastError' is distinct from 'null'::jsonb or char_length(coalesce(p_payload->>'title','')) not between 1 and 160 or p_payload->'candidate'->>'revision' is distinct from (p_expected_document_revision+1)::text or p_payload->'candidate'->>'contentHash' is distinct from p_content_hash or p_payload->'candidate'->'document' is distinct from p_document or jsonb_typeof(p_payload->'history') is distinct from 'array' or jsonb_array_length(p_payload->'history')<>jsonb_array_length(work.payload->'history')+1 or jsonb_array_length(p_payload->'history')>500 or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from work.payload->'history' then raise exception 'website_candidate_invalid'; end if;
 latest:=p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
 if latest->>'revision' is distinct from (p_expected_work_revision+1)::text or latest->>'actorId' is distinct from p_user_id::text or coalesce(latest->>'kind','')='' or coalesce(latest->>'at','')='' then raise exception 'website_candidate_invalid'; end if;
 -- Expiry advances even while rows are locked; recheck native grant authority
 -- immediately before the atomic write rather than treating the first read as a lease.
 perform public.agency_website_document_target(p_user_id,p_verified_email,p_binding_id,p_work_id,p_section);
 insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(work.workspace_id,p_work_id,p_expected_document_revision+1,p_content_hash,p_document,p_user_id);
 update public.website_document_heads set revision=p_expected_document_revision+1,approved_revision=null,approved_hash=null,approved_by=null,approved_at=null where website_work_id=p_work_id;
 return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp() where id=p_work_id returning *;
end $$;
revoke all on function public.commit_agency_website_document_candidate(uuid,text,uuid,uuid,text,integer,integer,integer,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.commit_agency_website_document_candidate(uuid,text,uuid,uuid,text,integer,integer,integer,text,text,jsonb,jsonb,boolean) to service_role;
