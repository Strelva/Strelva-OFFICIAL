-- Rollback for 20261007101000_provider_website_launch_authority.sql
-- Forward SHA-256: 8031658895734208d2af6efcbefa2ac47b53ec731f08ee2c403ba399d8cf77dc
-- Batch 2: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_launch_authority(uuid,uuid,uuid)')))) is distinct from '46cefd509454a7ef5cc982243832b294' then raise exception 'rollback_wrong_order_or_function_drift: website_document_launch_authority'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text)')))) is distinct from 'b89d9638bc2016d45189edd8b16224dd' then raise exception 'rollback_wrong_order_or_function_drift: reserve_website_hosted_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb)')))) is distinct from '32ee8f68af5dc61e52ea24cd670159f2' then raise exception 'rollback_wrong_order_or_function_drift: publish_website_document'; end if;
end;
$rollback_guard$;
drop function public.website_document_launch_authority(uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION public.reserve_website_hosted_tenant(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_revision integer, p_content_hash text, p_tenant_id text)
 RETURNS TABLE(tenant_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare head public.website_document_heads; reservation public.website_hosted_tenant_reservations; tenant_row public.tenants; doc public.website_documents;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  perform public.website_document_assert_launch_owner(p_workspace_id,p_user_id);
 select * into head from public.website_document_heads where website_work_id=p_work_id for update;
 if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
 if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'website_tenant_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
 select * into reservation from public.website_hosted_tenant_reservations r where r.website_work_id=p_work_id for update;
 if found then
   -- The work's durable identity survives a changed business-name slug hint.
   -- A response lost before saved-work binding must reopen this same tenant.
   select * into tenant_row from public.tenants t where t.id=reservation.tenant_id and t.stable_id=reservation.tenant_stable_id and t.active for update;
   if not found or not exists(select 1 from public.memberships m where m.tenant_id=tenant_row.id and m.tenant_stable_id=tenant_row.stable_id and m.user_id=p_user_id and m.role='owner') then raise exception 'website_tenant_access_denied'; end if;
   -- Revoked ownership is never repaired by retrying an old reservation.
   return query select reservation.tenant_id; return;
 end if;
 if exists(select 1 from public.tenants t where t.id=p_tenant_id) then raise exception 'website_publication_conflict'; end if;
 select * into doc from public.website_documents where website_work_id=p_work_id and revision=p_revision;
 insert into public.tenants(id,site_name,owner_name,owner_email,industry,template,delivery_model,auto_publish,site_url)
   values(p_tenant_id,doc.document->>'siteName',doc.document->>'siteName',p_verified_email,'','wellness','platform_template',false,'https://'||p_tenant_id||'.strelva.com') returning * into tenant_row;
 -- Take a shared lock on the authoritative current owners before provisioning.
 -- Browser-supplied identities never select another tenant owner, and replay
 -- never grants membership or repairs a previously revoked native owner.
 perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.role='owner' and u.verified_at is not null for share of m,u;
 insert into public.memberships(user_id,tenant_id,tenant_stable_id,role)
   select m.user_id,tenant_row.id,tenant_row.stable_id,'owner' from public.workspace_memberships m join public.users u on u.id=m.user_id
   where m.workspace_id=p_workspace_id and m.role='owner' and u.verified_at is not null;
 insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by) values(p_work_id,p_workspace_id,tenant_row.id,tenant_row.stable_id,p_user_id);
 if exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then
   perform public.bind_offering_website(p_workspace_id,p_user_id,p_verified_email,tenant_row.id,'hosted-website:'||p_work_id::text,encode(sha256(convert_to(p_work_id::text||':'||tenant_row.id,'UTF8')),'hex'));
 end if;
 return query select tenant_row.id;
end $function$
;
revoke all on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) to "service_role";
CREATE OR REPLACE FUNCTION public.publish_website_document(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_revision integer, p_content_hash text, p_tenant_id text, p_receipt jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare head public.website_document_heads; prior public.website_document_publications;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  perform public.website_document_assert_launch_owner(p_workspace_id,p_user_id);
  perform 1 from public.tenants t join public.memberships m on m.tenant_id=t.id and m.tenant_stable_id=t.stable_id where t.id=p_tenant_id and t.active and m.user_id=p_user_id and m.role='owner' for update of t,m;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  select * into head from public.website_document_heads where website_work_id=p_work_id for update;
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
end $function$
;
revoke all on function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) to "service_role";
commit;
