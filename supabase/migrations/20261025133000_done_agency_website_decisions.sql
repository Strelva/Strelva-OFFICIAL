begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;

-- Additive execution capability: private facts and multi-System Possibilities
-- stay with the owner. A website decision names an actual native candidate.
alter function public.agency_owner_decision_scopes(public.owner_decisions) rename to agency_owner_decision_scopes_before_done_agency;
create function public.agency_owner_decision_scopes(p_item public.owner_decisions) returns text[]
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_item.source_lifecycle = 'website_document' then
    if p_item.change_kind not in ('system.go_live','system.change_live')
      or split_part(p_item.source_id,':',2) not in ('approve','launch')
      or not exists(select 1 from public.saved_product_work w where w.id::text=split_part(p_item.source_id,':',1)
        and w.workspace_id=p_item.workspace_id and w.product_id='websites' and w.resource_kind='website'
        and w.payload->'candidate'->>'contentHash' ~ '^[a-f0-9]{64}$') then return null; end if;
    return array['website'];
  end if;
  if p_item.source_lifecycle = 'website_domain' then
    if p_item.change_kind <> 'system.go_live' or not exists(select 1 from public.website_domain_requests r
      where r.workspace_id=p_item.workspace_id and r.id::text=p_item.source_id and r.revision_hash=p_item.revision_hash) then return null; end if;
    return array['website'];
  end if;
  return public.agency_owner_decision_scopes_before_done_agency(p_item);
end $$;
revoke all on function public.agency_owner_decision_scopes(public.owner_decisions),public.agency_owner_decision_scopes_before_done_agency(public.owner_decisions) from public,anon,authenticated,service_role;

-- The initial exact source hash survives the lifecycle's later saved-work
-- bookkeeping. A binding cannot authorize another candidate or another stage.
create table public.done_agency_website_executions (
  decision_id uuid primary key references public.owner_decisions(id),
  workspace_id uuid not null, website_work_id uuid not null, stage text not null check(stage in ('approve','launch')),
  revision integer not null, content_hash text not null,
  foreign key(website_work_id,workspace_id) references public.saved_product_work(id,workspace_id)
);
alter table public.done_agency_website_executions enable row level security;
revoke all on public.done_agency_website_executions from public,anon,authenticated,service_role;

create function public.assert_website_agency_decision(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_decision_id uuid,p_revision_hash text,p_stage text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.owner_decisions; w public.saved_product_work; binding public.done_agency_website_executions; agency uuid; digest text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  perform 1 from public.workspaces where id=p_workspace_id for share;
  perform 1 from public.users where id=p_user_id and verified_at is not null and lower(email)=lower(btrim(p_verified_email)) for share;
  if not found then raise exception 'owner_decision_owner_only'; end if;
  select * into d from public.owner_decisions where workspace_id=p_workspace_id and id=p_decision_id for update;
  if not found or d.state <> 'approved' or d.decided_by_kind <> 'agency_session' or d.decided_by is distinct from p_user_id::text
    or d.revision_hash is distinct from p_revision_hash or d.source_lifecycle <> 'website_document'
    or d.source_id is distinct from p_work_id::text||':'||p_stage or d.route <> 'owner_decides'
    or d.deciding_actor->>'userId' is distinct from p_user_id::text or d.outcome is not null then raise exception 'owner_decision_owner_only'; end if;
  agency := (d.deciding_actor->>'agencyId')::uuid;
  -- Freeze ordinary current authority, including the captured agency's seat,
  -- assignment and Full-control scope. The platform role grants none of it.
  perform 1 from public.agency_scope_grants g where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=agency for share;
  perform 1 from public.provider_seats s where s.customer_workspace_id=p_workspace_id and s.agency_workspace_id=agency for share;
  perform 1 from public.agency_client_staff s where s.customer_workspace_id=p_workspace_id and s.agency_workspace_id=agency and s.user_id=p_user_id for share;
  perform 1 from public.workspace_memberships m where m.workspace_id=agency and m.user_id=p_user_id for share;
  if not public.agency_owner_decision_allowed(p_workspace_id,d.id,p_user_id,p_verified_email,agency) then raise exception 'owner_decision_owner_only'; end if;
  select * into w from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' for update;
  if not found or w.payload->'candidate'->>'revision' is distinct from p_revision::text
    or w.payload->'candidate'->>'contentHash' is distinct from p_content_hash then raise exception 'website_revision_conflict'; end if;
  perform 1 from public.website_documents doc where doc.workspace_id=p_workspace_id and doc.website_work_id=p_work_id
    and doc.revision=p_revision and doc.content_hash=p_content_hash and doc.document=w.payload->'candidate'->'document' for share;
  if not found then raise exception 'website_revision_conflict'; end if;
  select * into binding from public.done_agency_website_executions where decision_id=p_decision_id;
  if found then
    if binding.workspace_id<>p_workspace_id or binding.website_work_id<>p_work_id or binding.stage<>p_stage
      or binding.revision<>p_revision or binding.content_hash<>p_content_hash then raise exception 'website_revision_conflict'; end if;
  else
    digest := encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(jsonb_build_array('website_document',p_work_id::text,p_stage,
      (w.payload->>'revision')::integer,p_revision,p_content_hash)),'UTF8')),'hex');
    if digest is distinct from d.revision_hash
      or (p_stage='approve' and w.payload->>'status' is distinct from 'review_ready')
      or (p_stage='launch' and (w.payload->>'status' is distinct from 'approved' or w.payload->>'approvedCandidateRevision' is distinct from p_revision::text)) then raise exception 'website_revision_conflict'; end if;
    insert into public.done_agency_website_executions values(p_decision_id,p_workspace_id,p_work_id,p_stage,p_revision,p_content_hash);
  end if;
  if p_stage='launch' and public.platform_provider_for_resource(p_workspace_id,agency,'publish','website',public.system_origin_id(p_workspace_id,'saved_work',p_work_id::text)::text) is distinct from agency then
    raise exception 'owner_decision_owner_only'; end if;
end $$;
revoke all on function public.assert_website_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text,text) from public,anon,authenticated,service_role;

create function public.approve_website_by_agency_decision(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_decision_id uuid,p_revision_hash text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_website_agency_decision(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_decision_id,p_revision_hash,'approve');
  perform public.approve_website_document(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash);
end $$;

create function public.reserve_website_by_agency_decision(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_tenant_id text,p_decision_id uuid,p_revision_hash text) returns table(tenant_id text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare reservation public.website_hosted_tenant_reservations; t public.tenants; doc public.website_documents; head public.website_document_heads;
  recipient jsonb; business_template text; business_industry text; command uuid;
begin
  perform public.assert_website_agency_decision(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_decision_id,p_revision_hash,'launch');
  select * into head from public.website_document_heads where website_work_id=p_work_id and workspace_id=p_workspace_id for update;
  if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'website_tenant_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
  select * into reservation from public.website_hosted_tenant_reservations where workspace_id=p_workspace_id and website_work_id=p_work_id for update;
  if found then
    select t0.* into t from public.tenants t0 join public.tenant_workspace_links l on l.tenant_stable_id=t0.stable_id and l.workspace_id=p_workspace_id
      where t0.id=reservation.tenant_id and t0.stable_id=reservation.tenant_stable_id and t0.active for update of t0;
    if not found then raise exception 'website_tenant_access_denied'; end if;
    return query select t.id; return;
  end if;
  -- A normal owner publication may predate this additive binding. Never bind
  -- a different tenant or overwrite a client-repository site implicitly.
  select t0.* into t from public.website_document_publications p join public.tenants t0 on t0.id=p.tenant_id
    join public.tenant_workspace_links l on l.tenant_stable_id=t0.stable_id and l.workspace_id=p_workspace_id
    where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and t0.id=p_tenant_id and t0.active and t0.delivery_model='platform_template' for update of t0;
  if found then return query select t.id; return; end if;
  if exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'website_publication_conflict'; end if;
  recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or recipient->>'email' is null then raise exception 'website_customer_approval_required'; end if;
  select * into doc from public.website_documents where website_work_id=p_work_id and revision=p_revision;
  select b.template,b.industry into business_template,business_industry from public.website_business_template(p_workspace_id) b;
  insert into public.tenants(id,site_name,owner_name,owner_email,industry,template,delivery_model,auto_publish,site_url)
    values(p_tenant_id,doc.document->>'siteName',doc.document->>'siteName',recipient->>'email',business_industry,business_template,'platform_template',false,'https://'||p_tenant_id||'.strelva.com') returning * into t;
  insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by) values(p_work_id,p_workspace_id,t.id,t.stable_id,p_user_id);
  -- Agency attribution, with no agency tenant or business-owner membership.
  command := gen_random_uuid();
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    values(t.stable_id,t.id,p_workspace_id,p_user_id,command,encode(pg_catalog.sha256(convert_to(p_decision_id::text||':'||t.stable_id::text,'UTF8')),'hex'),
      jsonb_build_object('kind','agency_website_decision','ownerDecisionId',p_decision_id,'websiteWorkId',p_work_id));
  return query select t.id;
end $$;

create function public.publish_website_by_agency_decision(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb,p_decision_id uuid,p_revision_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; prior public.website_document_publications;
begin
  perform public.assert_website_agency_decision(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_decision_id,p_revision_hash,'launch');
  select * into head from public.website_document_heads where website_work_id=p_work_id and workspace_id=p_workspace_id for update;
  if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
  perform 1 from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_workspace_id
    where t.id=p_tenant_id and t.active and t.delivery_model='platform_template' and (
      exists(select 1 from public.website_hosted_tenant_reservations r where r.workspace_id=p_workspace_id and r.website_work_id=p_work_id and r.tenant_stable_id=t.stable_id)
      or exists(select 1 from public.website_document_publications p where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=t.id)) for update of t;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  perform public.system_bundle_assert_native_publication(p_workspace_id,p_work_id,(select document from public.website_documents where website_work_id=p_work_id and revision=p_revision));
  if p_receipt is null or p_receipt->>'status' is distinct from 'published' or p_receipt->>'provider' is distinct from 'strelva-hosted'
    or p_receipt->>'artifactHash' is distinct from p_content_hash or p_receipt->>'candidateRevision' is distinct from p_revision::text then raise exception 'website_receipt_invalid'; end if;
  select * into prior from public.website_document_publications where tenant_id=p_tenant_id or website_work_id=p_work_id for update;
  if found and (prior.website_work_id<>p_work_id or prior.tenant_id<>p_tenant_id) then raise exception 'website_publication_conflict'; end if;
  if not found or prior.revision<>p_revision then
    insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt) values(p_tenant_id,p_workspace_id,p_work_id,p_revision,p_content_hash,p_receipt)
      on conflict(tenant_id) do update set revision=excluded.revision,content_hash=excluded.content_hash,receipt=excluded.receipt,published_at=clock_timestamp();
    insert into public.website_document_receipts(workspace_id,website_work_id,revision,receipt) values(p_workspace_id,p_work_id,p_revision,p_receipt);
  end if;
  return (select to_jsonb(d)||jsonb_build_object('tenant_id',p.tenant_id,'receipt',p.receipt) from public.website_documents d
    join public.website_document_publications p using(workspace_id,website_work_id,revision) where d.website_work_id=p_work_id and d.revision=p_revision);
end $$;

-- The same exact hostname/DNS/publication guard used by owner links and
-- sessions, extended only for an already-recorded, still-current agency claim.
alter function public.authorize_website_domain_request(uuid,uuid) rename to authorize_website_domain_request_before_done_agency;
revoke all on function public.authorize_website_domain_request_before_done_agency(uuid,uuid) from public,anon,authenticated,service_role;
create function public.authorize_website_domain_request(p_workspace_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.website_domain_requests; d public.owner_decisions; recipient jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 perform 1 from public.workspaces where id=p_workspace_id for share;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
 select * into r from public.website_domain_requests where id=p_id and workspace_id=p_workspace_id for share;
 if not found or r.decision_id is null or r.expires_at<=clock_timestamp() then raise exception 'website_domain_owner_approval_required'; end if;
 select * into d from public.owner_decisions where id=r.decision_id and workspace_id=p_workspace_id for share;
 if not found or d.state<>'approved' or d.source_lifecycle<>'website_domain' or d.source_id<>r.id::text
   or d.revision_hash<>r.revision_hash or d.change_kind<>'system.go_live' or d.route<>'owner_decides' or d.admin_may_decide
   then raise exception 'website_domain_owner_approval_required'; end if;
 if d.decided_by_kind='owner_link' then
   recipient:=public.resolve_business_owner_recipient(p_workspace_id);
   if recipient is null or lower(trim(recipient->>'email')) is distinct from d.decided_by then raise exception 'website_domain_owner_approval_required'; end if;
 elsif d.decided_by_kind='owner_session' then
   if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=p_workspace_id and m.role='owner' and m.user_id::text=d.decided_by and u.verified_at is not null)
      then raise exception 'website_domain_owner_approval_required'; end if;
 elsif d.decided_by_kind='agency_session' then
   perform 1 from public.users u where u.id::text=d.decided_by and u.verified_at is not null for share;
   if not found or d.deciding_actor->>'userId' is distinct from d.decided_by then raise exception 'website_domain_owner_approval_required'; end if;
   perform 1 from public.agency_scope_grants g where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=(d.deciding_actor->>'agencyId')::uuid for share;
   perform 1 from public.provider_seats s where s.customer_workspace_id=p_workspace_id and s.agency_workspace_id=(d.deciding_actor->>'agencyId')::uuid for share;
   perform 1 from public.agency_client_staff s where s.customer_workspace_id=p_workspace_id and s.agency_workspace_id=(d.deciding_actor->>'agencyId')::uuid and s.user_id::text=d.decided_by for share;
   perform 1 from public.workspace_memberships m where m.workspace_id=(d.deciding_actor->>'agencyId')::uuid and m.user_id::text=d.decided_by for share;
   if not public.agency_owner_decision_allowed(p_workspace_id,d.id,d.decided_by::uuid,
      (select email from public.users where id::text=d.decided_by),(d.deciding_actor->>'agencyId')::uuid)
     or public.platform_provider_for_resource(p_workspace_id,(d.deciding_actor->>'agencyId')::uuid,'publish','domain',r.hostname) is distinct from (d.deciding_actor->>'agencyId')::uuid
     then raise exception 'website_domain_owner_approval_required'; end if;
 else raise exception 'website_domain_owner_approval_required'; end if;
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
   where p.workspace_id=p_workspace_id and p.website_work_id=r.website_work_id and t.stable_id=r.tenant_stable_id
   and p.revision=r.published_revision and p.content_hash=r.published_hash and t.active and t.delivery_model='platform_template' for share of p,t;
 if not found then raise exception 'website_domain_request_conflict'; end if;
 return public.website_domain_request_json(r);
end $$;

revoke all on function public.authorize_website_domain_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_website_domain_request(uuid,uuid) to service_role;
revoke all on function public.approve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text),
  public.reserve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,uuid,text),
  public.publish_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text),
  public.reserve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,uuid,text),
  public.publish_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,text) to service_role;

create table public.done_agency_website_catalog_guard(signature text primary key, definition_hash text not null);
alter table public.done_agency_website_catalog_guard enable row level security;
revoke all on public.done_agency_website_catalog_guard from public,anon,authenticated,service_role;
insert into public.done_agency_website_catalog_guard select signature,md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
  'public.agency_owner_decision_scopes(public.owner_decisions)',
  'public.agency_owner_decision_scopes_before_done_agency(public.owner_decisions)',
  'public.assert_website_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text,text)',
  'public.approve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text)',
  'public.reserve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,uuid,text)',
  'public.publish_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,text)',
  'public.authorize_website_domain_request(uuid,uuid)',
  'public.authorize_website_domain_request_before_done_agency(uuid,uuid)']) signature;
notify pgrst, 'reload schema';
commit;
