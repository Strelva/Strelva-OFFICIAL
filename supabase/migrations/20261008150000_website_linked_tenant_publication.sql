-- Publish a rebuilt website onto a tenant this business already runs
-- (website System spec 2026-10-06, section 5 item 5), and resolve a hosted
-- website's current tenant from stable identity after a slug rename (audit
-- 2026-10-05, P2 #8).
--
-- Additive. Local only until Jacob's yes. Nothing here moves a domain,
-- removes a Vercel project or rewrites an issued receipt.
--
-- 1. publish_website_document_to_linked_tenant: the business owner publishes
--    an approved document onto a tenant linked to this workspace through
--    tenant_workspace_links (the one link). The tenant keeps its id, stable_id,
--    site name, template, industry and custom_repo metadata; delivery_model
--    becomes platform_template. The prior delivery model is recorded with a
--    30-day fallback date. Keeping the client's Vercel project for that window
--    is an operator step; nothing here can remove it.
-- 2. reserve_website_hosted_tenant no longer hard-codes the wellness template:
--    a new hosted tenant takes the business's real template and industry from
--    the site it already runs, else the neutral professional template.
-- 3. manage_published_website_tenant also accepts the workspace owner of a
--    linked tenant, so domains and reports work for a site published through
--    (1), where the owner may hold no native tenant membership.
-- 4. read_website_current_tenant: the tenant a website work is published to
--    or reserved for *now*. The publication and reservation rows follow a slug
--    rename (on update cascade / stable_id); the saved work payload does not.

create table public.website_linked_publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  website_work_id uuid not null,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  tenant_slug_at_publication text not null check (tenant_slug_at_publication ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  prior_delivery_model text not null check (prior_delivery_model in ('custom_repo','platform_template')),
  revision integer not null check (revision > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  fallback_until timestamptz not null,
  foreign key (workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision) on delete restrict
);
create index website_linked_publications_tenant_idx on public.website_linked_publications(tenant_stable_id, published_at desc);
alter table public.website_linked_publications enable row level security;
revoke all on public.website_linked_publications from public,anon,authenticated,service_role;

create function public.website_linked_publication_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'website_linked_publication_immutable'; end $$;
create trigger website_linked_publications_immutable before update or delete on public.website_linked_publications
  for each row execute function public.website_linked_publication_immutable();
revoke all on function public.website_linked_publication_immutable() from public,anon,authenticated,service_role;

-- The business's real template and industry: the most recently linked site
-- it already runs, else the neutral professional template (never wellness by
-- default: wellness turns on schedule, members and roster).
create function public.website_business_template(p_workspace_id uuid) returns table(template text, industry text)
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(found.template,'professional'), coalesce(found.industry,'')
  from (select 1) one
  left join lateral (
    select nullif(t.template,'') as template, nullif(t.industry,'') as industry
    from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
    where l.workspace_id=p_workspace_id and nullif(t.template,'') is not null
    order by l.linked_at desc, l.id desc limit 1
  ) found on true;
$$;
revoke all on function public.website_business_template(uuid) from public,anon,authenticated,service_role;

create or replace function public.reserve_website_hosted_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text) returns table(tenant_id text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; reservation public.website_hosted_tenant_reservations; tenant_row public.tenants; doc public.website_documents;
  authority text; tenant_owner uuid; tenant_owner_email text; business_template text; business_industry text;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 select * into head from public.website_document_heads where website_work_id=p_work_id for update;
 authority := public.website_document_launch_authority(p_workspace_id,p_work_id,p_user_id);
 if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
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
 select b.template,b.industry into business_template,business_industry from public.website_business_template(p_workspace_id) b;
 insert into public.tenants(id,site_name,owner_name,owner_email,industry,template,delivery_model,auto_publish,site_url)
   values(p_tenant_id,doc.document->>'siteName',doc.document->>'siteName',tenant_owner_email,business_industry,business_template,'platform_template',false,'https://'||p_tenant_id||'.strelva.com') returning * into tenant_row;
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

-- Publish onto an existing, linked tenant. Owner only: a provider may launch
-- a new hosted site on a customer's approval, but replacing a site the
-- business already runs is the owner's call (system.go_live).
create function public.publish_website_document_to_linked_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; tenant_row public.tenants; reservation public.website_hosted_tenant_reservations; prior public.website_document_publications;
  linked public.website_linked_publications;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  perform public.website_document_assert_launch_owner(p_workspace_id,p_user_id);
  select * into head from public.website_document_heads where website_work_id=p_work_id for update;
  if head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision or head.approved_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
  if p_receipt is null or p_receipt->>'status' is distinct from 'published' or p_receipt->>'provider' is distinct from 'strelva-hosted' or p_receipt->>'artifactHash' is distinct from p_content_hash or p_receipt->>'candidateRevision' is distinct from p_revision::text then raise exception 'website_receipt_invalid'; end if;
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9][a-z0-9-]{0,62}$' then raise exception 'website_tenant_invalid'; end if;
  select t.* into tenant_row from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_workspace_id
    where t.id=p_tenant_id and t.active for update of t;
  if not found then raise exception 'website_tenant_not_linked'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||tenant_row.stable_id::text,7416));
  -- One hosted document per tenant and one tenant per document, by stable identity.
  select * into reservation from public.website_hosted_tenant_reservations r where r.website_work_id=p_work_id or r.tenant_stable_id=tenant_row.stable_id for update;
  if found and (reservation.website_work_id<>p_work_id or reservation.tenant_stable_id<>tenant_row.stable_id) then raise exception 'website_publication_conflict'; end if;
  if not found then
    insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by) values(p_work_id,p_workspace_id,tenant_row.id,tenant_row.stable_id,p_user_id);
  end if;
  select * into prior from public.website_document_publications where tenant_id=tenant_row.id or website_work_id=p_work_id for update;
  if found and (prior.website_work_id<>p_work_id or prior.tenant_id<>tenant_row.id) then raise exception 'website_publication_conflict'; end if;
  if not found or prior.revision<>p_revision then
    insert into public.website_linked_publications(workspace_id,website_work_id,tenant_stable_id,tenant_slug_at_publication,prior_delivery_model,revision,content_hash,published_by,fallback_until)
      values(p_workspace_id,p_work_id,tenant_row.stable_id,tenant_row.id,coalesce(tenant_row.delivery_model,'custom_repo'),p_revision,p_content_hash,p_user_id,clock_timestamp()+interval '30 days');
    -- Only the delivery model changes; id, stable_id, template, industry and
    -- custom_repo metadata stay for History and the fallback.
    update public.tenants set delivery_model='platform_template' where id=tenant_row.id and delivery_model is distinct from 'platform_template';
    insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt) values(tenant_row.id,p_workspace_id,p_work_id,p_revision,p_content_hash,p_receipt)
      on conflict(tenant_id) do update set revision=excluded.revision,content_hash=excluded.content_hash,receipt=excluded.receipt,published_at=clock_timestamp();
    insert into public.website_document_receipts(workspace_id,website_work_id,revision,receipt) values(p_workspace_id,p_work_id,p_revision,p_receipt);
  end if;
  select * into linked from public.website_linked_publications where tenant_stable_id=tenant_row.stable_id and website_work_id=p_work_id order by published_at desc, id desc limit 1;
  return (select to_jsonb(d)||jsonb_build_object('tenant_id',p.tenant_id,'receipt',p.receipt,'prior_delivery_model',linked.prior_delivery_model,'fallback_until',linked.fallback_until)
    from public.website_documents d join public.website_document_publications p using(workspace_id,website_work_id,revision) where d.website_work_id=p_work_id and d.revision=p_revision);
end $$;
revoke all on function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb) to service_role;

create or replace function public.manage_published_website_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id join public.memberships m on m.tenant_id=t.id and m.tenant_stable_id=t.stable_id
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active and m.user_id=p_user_id and m.role='owner' for share of p,t,m;
 if found then return; end if;
 -- A tenant linked to this business: its workspace owner manages it.
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
   join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p.workspace_id
   join public.workspace_memberships wm on wm.workspace_id=p.workspace_id and wm.user_id=p_user_id and wm.role='owner'
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active for share of p,t,l,wm;
 if not found then raise exception 'website_tenant_access_denied'; end if;
end $$;

create function public.read_website_current_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns table(tenant_id text, source text, delivery_model text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
  return query select t.id, 'publication'::text, t.delivery_model from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
    where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id;
  if found then return; end if;
  return query select t.id, 'reservation'::text, t.delivery_model from public.website_hosted_tenant_reservations r join public.tenants t on t.stable_id=r.tenant_stable_id
    where r.workspace_id=p_workspace_id and r.website_work_id=p_work_id;
end $$;
revoke all on function public.read_website_current_tenant(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_website_current_tenant(uuid,uuid,uuid,text) to service_role;

-- Linked publications for one website work, newest first (History and the fallback window).
create function public.read_website_linked_publications(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns table(tenant_id text, tenant_slug_at_publication text, prior_delivery_model text, revision integer, content_hash text, published_by uuid, published_at timestamptz, fallback_until timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
  return query select t.id, lp.tenant_slug_at_publication, lp.prior_delivery_model, lp.revision, lp.content_hash, lp.published_by, lp.published_at, lp.fallback_until
    from public.website_linked_publications lp left join public.tenants t on t.stable_id=lp.tenant_stable_id
    where lp.workspace_id=p_workspace_id and lp.website_work_id=p_work_id order by lp.published_at desc, lp.id desc limit 50;
end $$;
revoke all on function public.read_website_linked_publications(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_website_linked_publications(uuid,uuid,uuid,text) to service_role;
