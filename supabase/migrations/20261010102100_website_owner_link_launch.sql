-- Website launch from one signed routine owner decision. No owner role or
-- tenant membership is synthesized; the actual admin remains the executor.
set local lock_timeout = '3s';

create function public.assert_website_owner_link(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; session_row public.strelva_service_actions; link public.owner_decision_link_sessions; head public.website_document_heads;
begin
  item:=public.assert_owner_decision_link(p_workspace_id,p_session_id,p_decision_id,p_revision_hash,p_recipient);
  session_row:=public.strelva_service_session(p_workspace_id,p_session_id,'owner_decision_link');
  if session_row.on_behalf_user_id is distinct from p_user_id or item.state<>'approved' or item.source_lifecycle<>'website_document'
    or item.source_id is distinct from p_work_id::text||':launch'
    or not exists(select 1 from public.strelva_service_actions where session_id=p_session_id and action='run') then
    raise exception 'strelva_service_access_denied';
  end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  select * into link from public.owner_decision_link_sessions where session_id=p_session_id;
  select * into head from public.website_document_heads where website_work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision
    or head.approved_hash is distinct from p_content_hash or link.website_revision is distinct from p_revision
    or link.website_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
end $$;
revoke all on function public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.reserve_website_by_owner_link(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_tenant_id text,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns table(tenant_id text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare reservation public.website_hosted_tenant_reservations; tenant_row public.tenants; doc public.website_documents;
  business_template text; business_industry text; linked_id uuid;
begin
  perform public.assert_website_owner_link(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_session_id,p_decision_id,p_revision_hash,p_recipient);
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'website_tenant_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
  select * into reservation from public.website_hosted_tenant_reservations where website_work_id=p_work_id for update;
  if found then
    select * into tenant_row from public.tenants where stable_id=reservation.tenant_stable_id and active for update;
    if not found or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=tenant_row.stable_id) then
      raise exception 'website_tenant_access_denied'; end if;
    return query select tenant_row.id; return;
  end if;
  -- A name collision must never give an owner link someone else's tenant.
  if exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'website_publication_conflict'; end if;
  select * into doc from public.website_documents where website_work_id=p_work_id and workspace_id=p_workspace_id and revision=p_revision;
  select template,industry into business_template,business_industry from public.website_business_template(p_workspace_id);
  insert into public.tenants(id,site_name,owner_name,owner_email,industry,template,delivery_model,auto_publish,site_url)
    values(p_tenant_id,doc.document->>'siteName',doc.document->>'siteName',lower(btrim(p_recipient)),business_industry,business_template,'platform_template',false,'https://'||p_tenant_id||'.strelva.com') returning * into tenant_row;
  insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by)
    values(p_work_id,p_workspace_id,tenant_row.id,tenant_row.stable_id,p_user_id);
  -- Link-first routing makes this a business site without granting any user
  -- tenant-owner or workspace-owner authority. Signed receipt owns approval.
  linked_id:=gen_random_uuid();
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    values(tenant_row.stable_id,tenant_row.id,p_workspace_id,p_user_id,linked_id,
      encode(sha256(convert_to(p_decision_id::text||':'||p_work_id::text||':'||tenant_row.stable_id::text,'UTF8')),'hex'),
      jsonb_build_object('kind','signed_owner_website_launch','ownerDecisionId',p_decision_id,'websiteWorkId',p_work_id,'recipient',lower(btrim(p_recipient))));
  return query select tenant_row.id;
end $$;

create function public.publish_website_by_owner_link(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare reservation public.website_hosted_tenant_reservations; tenant_row public.tenants; prior public.website_document_publications;
begin
  perform public.assert_website_owner_link(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_session_id,p_decision_id,p_revision_hash,p_recipient);
  select * into reservation from public.website_hosted_tenant_reservations where workspace_id=p_workspace_id and website_work_id=p_work_id;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  select t.* into tenant_row from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_workspace_id
    where t.id=p_tenant_id and t.stable_id=reservation.tenant_stable_id and t.active for update of t;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  if p_receipt is null or p_receipt->>'status' is distinct from 'published' or p_receipt->>'provider' is distinct from 'strelva-hosted'
    or p_receipt->>'artifactHash' is distinct from p_content_hash or p_receipt->>'candidateRevision' is distinct from p_revision::text then
    raise exception 'website_receipt_invalid'; end if;
  select * into prior from public.website_document_publications where tenant_id=p_tenant_id or website_work_id=p_work_id for update;
  if found and (prior.website_work_id<>p_work_id or prior.tenant_id<>p_tenant_id) then raise exception 'website_publication_conflict'; end if;
  if not found or prior.revision<>p_revision then
    insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt)
      values(p_tenant_id,p_workspace_id,p_work_id,p_revision,p_content_hash,p_receipt)
      on conflict(tenant_id) do update set revision=excluded.revision,content_hash=excluded.content_hash,receipt=excluded.receipt,published_at=clock_timestamp();
    insert into public.website_document_receipts(workspace_id,website_work_id,revision,receipt) values(p_workspace_id,p_work_id,p_revision,p_receipt);
  end if;
  return (select to_jsonb(d)||jsonb_build_object('tenant_id',p.tenant_id,'receipt',p.receipt) from public.website_documents d
    join public.website_document_publications p using(workspace_id,website_work_id,revision) where d.website_work_id=p_work_id and d.revision=p_revision);
end $$;
revoke all on function public.reserve_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.publish_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text) to service_role;
grant execute on function public.publish_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,uuid,text,text) to service_role;
