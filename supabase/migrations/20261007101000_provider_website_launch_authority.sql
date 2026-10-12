-- Scoped provider launch authority for managed websites
-- (audit 2026-10-05, finding 6).
--
-- A managed customer approves the exact preview; Strelva launches it. Before
-- this migration only a workspace owner could reserve and publish, so an
-- ordinary provider admin could not finish a managed launch, and the launch
-- service re-approved as the launcher, replacing the customer's approval.
--
-- Launch authority is now one of:
--   owner    - a business owner, exactly as before;
--   provider - a verified, active Strelva operator (super_admins) who is an
--              admin member of a customer workspace, launching an approval
--              recorded by a verified business owner other than themself.
-- A provider never becomes a native tenant owner. Tenant ownership checks and
-- the offering binding use the approving owner. Plain admins stay denied, and
-- an approval recorded by the operator does not authorize a provider launch.

create or replace function public.website_document_launch_authority(p_workspace_id uuid,p_work_id uuid,p_user_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; approver uuid;
begin
  select m.role into actor_role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind<>'agency' and m.user_id=p_user_id for share of w,m;
  if actor_role='owner' then return 'owner'; end if;
  if actor_role='admin'
    and exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer')
    and exists(select 1 from public.super_admins sa join public.users u on u.id=sa.user_id where sa.user_id=p_user_id and sa.revoked_at is null and u.verified_at is not null) then
    select h.approved_by into approver from public.website_document_heads h where h.website_work_id=p_work_id;
    if approver is not null and approver<>p_user_id and exists(
      select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=p_workspace_id and m.user_id=approver and m.role='owner' and u.verified_at is not null
    ) then return 'provider'; end if;
    raise exception 'website_customer_approval_required';
  end if;
  raise exception 'workspace_access_denied';
end $$;
revoke all on function public.website_document_launch_authority(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.reserve_website_hosted_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text) returns table(tenant_id text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; reservation public.website_hosted_tenant_reservations; tenant_row public.tenants; doc public.website_documents;
  authority text; tenant_owner uuid; tenant_owner_email text;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 select * into head from public.website_document_heads where website_work_id=p_work_id for update;
 authority := public.website_document_launch_authority(p_workspace_id,p_work_id,p_user_id);
 if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
 -- The tenant-side identity is the launching owner, or the approving owner
 -- when Strelva launches on the customer's approval.
 tenant_owner := case when authority='owner' then p_user_id else head.approved_by end;
 select u.email into tenant_owner_email from public.users u where u.id=tenant_owner;
 if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'website_tenant_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
 select * into reservation from public.website_hosted_tenant_reservations r where r.website_work_id=p_work_id for update;
 if found then
   select * into tenant_row from public.tenants t where t.id=reservation.tenant_id and t.stable_id=reservation.tenant_stable_id and t.active for update;
   if not found or not exists(select 1 from public.memberships m where m.tenant_id=tenant_row.id and m.tenant_stable_id=tenant_row.stable_id and m.user_id=tenant_owner and m.role='owner') then raise exception 'website_tenant_access_denied'; end if;
   return query select reservation.tenant_id; return;
 end if;
 if exists(select 1 from public.tenants t where t.id=p_tenant_id) then raise exception 'website_publication_conflict'; end if;
 select * into doc from public.website_documents where website_work_id=p_work_id and revision=p_revision;
 insert into public.tenants(id,site_name,owner_name,owner_email,industry,template,delivery_model,auto_publish,site_url)
   values(p_tenant_id,doc.document->>'siteName',doc.document->>'siteName',tenant_owner_email,'','wellness','platform_template',false,'https://'||p_tenant_id||'.strelva.com') returning * into tenant_row;
 perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.role='owner' and u.verified_at is not null for share of m,u;
 insert into public.memberships(user_id,tenant_id,tenant_stable_id,role)
   select m.user_id,tenant_row.id,tenant_row.stable_id,'owner' from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.role='owner' and u.verified_at is not null;
 insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by) values(p_work_id,p_workspace_id,tenant_row.id,tenant_row.stable_id,p_user_id);
 if exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then
   perform public.bind_offering_website(p_workspace_id,tenant_owner,tenant_owner_email,tenant_row.id,'hosted-website:'||p_work_id::text,encode(sha256(convert_to(p_work_id::text||':'||tenant_row.id,'UTF8')),'hex'));
 end if;
 return query select tenant_row.id;
end $$;

create or replace function public.publish_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; prior public.website_document_publications; authority text; tenant_owner uuid;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  select * into head from public.website_document_heads where website_work_id=p_work_id for update;
  authority := public.website_document_launch_authority(p_workspace_id,p_work_id,p_user_id);
  tenant_owner := case when authority='owner' then p_user_id else head.approved_by end;
  perform 1 from public.tenants t join public.memberships m on m.tenant_id=t.id and m.tenant_stable_id=t.stable_id where t.id=p_tenant_id and t.active and m.user_id=tenant_owner and m.role='owner' for update of t,m;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
  if p_receipt is null or p_receipt->>'status' is distinct from 'published' or p_receipt->>'provider' is distinct from 'strelva-hosted' or p_receipt->>'artifactHash' is distinct from p_content_hash or p_receipt->>'candidateRevision' is distinct from p_revision::text then raise exception 'website_receipt_invalid'; end if;
  select * into prior from public.website_document_publications where tenant_id=p_tenant_id or website_work_id=p_work_id for update;
  if found and (prior.website_work_id<>p_work_id or prior.tenant_id<>p_tenant_id) then raise exception 'website_publication_conflict'; end if;
  if not found or prior.revision<>p_revision then
    insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt) values(p_tenant_id,p_workspace_id,p_work_id,p_revision,p_content_hash,p_receipt)
      on conflict(tenant_id) do update set revision=excluded.revision,content_hash=excluded.content_hash,receipt=excluded.receipt,published_at=clock_timestamp();
    insert into public.website_document_receipts(workspace_id,website_work_id,revision,receipt) values(p_workspace_id,p_work_id,p_revision,p_receipt);
  end if;
  return (select to_jsonb(d)||jsonb_build_object('tenant_id',p.tenant_id,'receipt',p.receipt) from public.website_documents d join public.website_document_publications p using(workspace_id,website_work_id,revision) where d.website_work_id=p_work_id and d.revision=p_revision);
end $$;
