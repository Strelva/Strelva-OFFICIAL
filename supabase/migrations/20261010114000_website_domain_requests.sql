-- Exact DNS proposals and signed Needs you domain decisions. Off until the
-- website rebuild / Needs you releases are explicitly enabled. No provider writes.
begin;
set local lock_timeout = '5s';
create table public.website_domain_requests (
  id uuid primary key,
  workspace_id uuid not null,
  website_work_id uuid not null,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  published_revision integer not null,
  published_hash text not null check (published_hash ~ '^[0-9a-f]{64}$'),
  hostname text not null check (hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' and char_length(hostname)<=253),
  records jsonb not null check (jsonb_typeof(records)='array' and jsonb_array_length(records) between 1 and 20),
  revision_hash text not null check (revision_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '14 days',
  decision_id uuid references public.owner_decisions(id),
  result jsonb,
  receipt_email jsonb,
  foreign key (website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete restrict
);
create index website_domain_requests_workspace_idx on public.website_domain_requests(workspace_id,created_at desc);
alter table public.website_domain_requests enable row level security;
revoke all on public.website_domain_requests from public,anon,authenticated,service_role;

create function public.website_domain_request_json(r public.website_domain_requests) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'workId',r.website_work_id,
   'tenantId',(select id from public.tenants where stable_id=r.tenant_stable_id),
   'systemId',case
     when exists(select 1 from public.website_linked_publications where workspace_id=r.workspace_id and website_work_id=r.website_work_id)
       then public.system_origin_id(r.workspace_id,'tenant',r.tenant_stable_id::text)
     when public.website_rebuild_connected_origin(r.workspace_id,r.website_work_id) is not null
       then public.system_origin_id(r.workspace_id,'connected_site',public.website_rebuild_connected_origin(r.workspace_id,r.website_work_id)::text)
     else public.system_origin_id(r.workspace_id,'saved_work',r.website_work_id::text) end,
   'publishedRevision',r.published_revision,'publishedHash',r.published_hash,'hostname',r.hostname,
   'records',r.records,'revisionHash',r.revision_hash,'createdAt',r.created_at,'expiresAt',r.expires_at,
   'decisionId',r.decision_id,'result',r.result,'receiptEmail',r.receipt_email,
   'current',exists(select 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
      where p.workspace_id=r.workspace_id and p.website_work_id=r.website_work_id and t.stable_id=r.tenant_stable_id
      and p.revision=r.published_revision and p.content_hash=r.published_hash and t.active and t.delivery_model='platform_template'))
$$;
revoke all on function public.website_domain_request_json(public.website_domain_requests) from public,anon,authenticated,service_role;

create function public.prepare_website_domain_request(p_id uuid,p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_published_revision integer,p_published_hash text,p_hostname text,p_records jsonb,p_revision_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants; r public.website_domain_requests;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 -- An owner may prepare; an admin must be a currently verified Strelva operator.
 if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner')
   and public.needs_you_operator_id(p_user_id,p_verified_email) is null then raise exception 'workspace_access_denied'; end if;
 select t0.* into t from public.website_document_publications p join public.tenants t0 on t0.id=p.tenant_id
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id
   and p.revision=p_published_revision and p.content_hash=p_published_hash and t0.active and t0.delivery_model='platform_template' for share of p,t0;
 if not found then raise exception 'website_domain_request_conflict'; end if;
 insert into public.website_domain_requests(id,workspace_id,website_work_id,tenant_stable_id,published_revision,published_hash,hostname,records,revision_hash,created_by)
 values(p_id,p_workspace_id,p_work_id,t.stable_id,p_published_revision,p_published_hash,p_hostname,p_records,p_revision_hash,p_user_id) on conflict(id) do nothing;
 select * into r from public.website_domain_requests where id=p_id;
 if r.workspace_id<>p_workspace_id or r.website_work_id<>p_work_id or r.revision_hash<>p_revision_hash then raise exception 'website_domain_request_conflict'; end if;
 return public.website_domain_request_json(r);
end $$;

-- Service-role read for Needs you: no membership is borrowed from an operator
-- to decide. The decision store verifies the signed recipient or owner session.
create function public.list_website_domain_requests(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.website_domain_request_json(r) order by r.created_at desc),'[]'::jsonb)
 from public.website_domain_requests r where r.workspace_id=p_workspace_id
$$;

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
 else raise exception 'website_domain_owner_approval_required'; end if;
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
   where p.workspace_id=p_workspace_id and p.website_work_id=r.website_work_id and t.stable_id=r.tenant_stable_id
   and p.revision=r.published_revision and p.content_hash=r.published_hash and t.active and t.delivery_model='platform_template' for share of p,t;
 if not found then raise exception 'website_domain_request_conflict'; end if;
 return public.website_domain_request_json(r);
end $$;

create function public.approve_website_domain_request(p_workspace_id uuid,p_id uuid,p_decision_id uuid,p_revision_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.website_domain_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 select * into r from public.website_domain_requests where id=p_id and workspace_id=p_workspace_id for update;
 if not found or r.revision_hash<>p_revision_hash or (r.decision_id is not null and r.decision_id<>p_decision_id) then raise exception 'website_domain_request_conflict'; end if;
 update public.website_domain_requests set decision_id=p_decision_id where id=p_id;
 -- Any refusal rolls back the pointer too. This is the same recorded human
 -- decision for accountless signed links and signed-in owners.
 return public.authorize_website_domain_request(p_workspace_id,p_id);
end $$;

create function public.record_website_domain_request(p_workspace_id uuid,p_id uuid,p_result jsonb,p_receipt_email jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.website_domain_requests;
begin
 -- Record accepted effects even when authority was subsequently revoked.
 select * into r from public.website_domain_requests where id=p_id and workspace_id=p_workspace_id and decision_id is not null for update;
 if not found then raise exception 'website_domain_owner_approval_required'; end if;
 update public.website_domain_requests set result=coalesce(p_result,result),receipt_email=coalesce(p_receipt_email,receipt_email) where id=p_id returning * into r;
 return public.website_domain_request_json(r);
end $$;
revoke all on function public.prepare_website_domain_request(uuid,uuid,uuid,uuid,text,text,integer,text,text,jsonb,text),public.list_website_domain_requests(uuid),public.authorize_website_domain_request(uuid,uuid),public.approve_website_domain_request(uuid,uuid,uuid,text),public.record_website_domain_request(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_website_domain_request(uuid,uuid,uuid,uuid,text,text,integer,text,text,jsonb,text),public.list_website_domain_requests(uuid),public.authorize_website_domain_request(uuid,uuid),public.approve_website_domain_request(uuid,uuid,uuid,text),public.record_website_domain_request(uuid,uuid,jsonb,jsonb) to service_role;
commit;
