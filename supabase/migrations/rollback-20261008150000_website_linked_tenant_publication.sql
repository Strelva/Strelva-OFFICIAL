-- Rollback for 20261008150000_website_linked_tenant_publication.sql
-- Forward SHA-256: b52c753a4d2a9051feaae887cdbec0df32b1ca60007b2a0a9d8460f1cb9cfd9b
-- Batch 6: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_business_template(uuid)')))) is distinct from '4d2b69876fe9a04a7695dfb874ebc03d' then raise exception 'rollback_wrong_order_or_function_drift: website_business_template'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_linked_publication_immutable()')))) is distinct from 'c3c581766aad7d1a4a64a4fad480a62b' then raise exception 'rollback_wrong_order_or_function_drift: website_linked_publication_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_current_tenant(uuid,uuid,uuid,text)')))) is distinct from '0226c7ab6b1e10c0e5ada8c218b8e316' then raise exception 'rollback_wrong_order_or_function_drift: read_website_current_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_linked_publications(uuid,uuid,uuid,text)')))) is distinct from 'b5a0715e11751f6a76e9c2e95ca6aca9' then raise exception 'rollback_wrong_order_or_function_drift: read_website_linked_publications'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.manage_published_website_tenant(uuid,uuid,uuid,text,text)')))) is distinct from 'c7445294264d17b46d8496ff6d40e270' then raise exception 'rollback_wrong_order_or_function_drift: manage_published_website_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text)')))) is distinct from '61d18a699ccdbdeb490240d557284ff4' then raise exception 'rollback_wrong_order_or_function_drift: reserve_website_hosted_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb)')))) is distinct from 'c50a5f47a0d543509392f3e2a5a774e1' then raise exception 'rollback_wrong_order_or_function_drift: publish_website_document_to_linked_tenant'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_linked_publications') and attnum>0 and not attisdropped) <> 11 then raise exception 'rollback_wrong_order_or_table_drift: website_linked_publications'; end if;
end;
$rollback_guard$;
lock table public."website_linked_publications" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008150000_website_linked_publications" as table public."website_linked_publications";
revoke all on release_rollback_archive."m20261008150000_website_linked_publications" from public, anon, authenticated, service_role;
drop trigger "website_linked_publications_immutable" on public."website_linked_publications";
alter table public."website_linked_publications" drop constraint "website_linked_publications_revision_check";
alter table public."website_linked_publications" drop constraint "website_linked_publications_content_hash_check";
alter table public."website_linked_publications" drop constraint "website_linked_publications_prior_delivery_model_check";
alter table public."website_linked_publications" drop constraint "website_linked_publications_tenant_slug_at_publication_check";
drop function public.website_business_template(uuid);
drop function public.website_linked_publication_immutable();
drop function public.read_website_current_tenant(uuid,uuid,uuid,text);
drop function public.read_website_linked_publications(uuid,uuid,uuid,text);
drop function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb);
drop table public."website_linked_publications";
CREATE OR REPLACE FUNCTION public.manage_published_website_tenant(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_tenant_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id join public.memberships m on m.tenant_id=t.id and m.tenant_stable_id=t.stable_id
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active and m.user_id=p_user_id and m.role='owner' for share of p,t,m;
 if not found then raise exception 'website_tenant_access_denied'; end if;
end $function$
;
revoke all on function public.manage_published_website_tenant(uuid,uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.manage_published_website_tenant(uuid,uuid,uuid,text,text) to "service_role";
CREATE OR REPLACE FUNCTION public.reserve_website_hosted_tenant(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_revision integer, p_content_hash text, p_tenant_id text)
 RETURNS TABLE(tenant_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) to "service_role";
commit;
