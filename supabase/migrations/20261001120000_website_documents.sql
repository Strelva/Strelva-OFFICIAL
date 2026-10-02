-- Prepared additive v2 hosted website persistence. Production application needs
-- explicit migration authorization; no legacy website or /api/v1 changes.
create table public.website_documents (
  workspace_id uuid not null,
  website_work_id uuid not null,
  revision integer not null check (revision > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  document jsonb not null check (jsonb_typeof(document)='object' and document->>'version'='2' and octet_length(document::text)<=2000000),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (website_work_id,revision),
  unique (workspace_id,website_work_id,revision),
  foreign key (website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete restrict
);
create table public.website_document_heads (
  workspace_id uuid not null,
  website_work_id uuid primary key,
  revision integer not null,
  approved_revision integer,
  approved_hash text,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  foreign key (workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision) on delete restrict
);
create table public.website_document_publications (
  tenant_id text primary key references public.tenants(id) on update cascade on delete restrict,
  workspace_id uuid not null,
  website_work_id uuid unique not null,
  revision integer not null,
  content_hash text not null,
  receipt jsonb not null,
  published_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision) on delete restrict
);
create table public.website_document_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  website_work_id uuid not null,
  revision integer not null,
  receipt jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision) on delete restrict
);
create table public.website_document_health (
  workspace_id uuid not null,
  website_work_id uuid not null,
  revision integer not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  checked_at timestamptz not null,
  status text not null check(status in ('healthy','unreachable','hash_mismatch','hash_missing')),
  observed_hash text check(observed_hash is null or observed_hash ~ '^[a-f0-9]{64}$'),
  primary key(website_work_id,checked_at),
  foreign key(workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision)
);
alter table public.website_documents enable row level security;
alter table public.website_document_heads enable row level security;
alter table public.website_document_publications enable row level security;
alter table public.website_document_receipts enable row level security;
alter table public.website_document_health enable row level security;
revoke all on public.website_documents,public.website_document_heads,public.website_document_publications,public.website_document_receipts,public.website_document_health from public,anon,authenticated,service_role;

create function public.website_document_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'website_document_immutable'; end $$;
create trigger website_document_immutable_trg before update or delete on public.website_documents for each row execute function public.website_document_immutable();
create trigger website_document_receipt_immutable_trg before update or delete on public.website_document_receipts for each row execute function public.website_document_immutable();

create function public.website_document_assert_actor(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_manage boolean,p_write boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
    perform 1 from public.workspaces where id=p_workspace_id for update;
    if not found then raise exception 'workspace_access_denied'; end if;
    if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin')) for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $$;

-- Draft management can remain owner/admin. Creating a live hosted tenant and
-- publishing it belongs to the business owner; agency prospects stay private.
create function public.website_document_assert_launch_owner(p_workspace_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind<>'agency' and m.user_id=p_user_id and m.role='owner' for share of w,m;
  if not found then raise exception 'workspace_access_denied'; end if;
end $$;
revoke all on function public.website_document_assert_launch_owner(uuid,uuid) from public,anon,authenticated,service_role;

create function public.append_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_expected_revision integer,p_content_hash text,p_document jsonb) returns setof public.website_documents
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,true);
  select * into head from public.website_document_heads where website_work_id=p_work_id for update;
  if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or coalesce(head.revision,0)<>p_expected_revision then raise exception 'website_revision_conflict'; end if;
  if p_document is null or jsonb_typeof(p_document) is distinct from 'object' or p_document->>'version' is distinct from '2' or jsonb_typeof(p_document->'facts') is distinct from 'object' or jsonb_typeof(p_document->'nodes') is distinct from 'object' or jsonb_typeof(p_document->'pages') is distinct from 'array' then raise exception 'website_document_invalid'; end if;
  insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(p_workspace_id,p_work_id,p_expected_revision+1,p_content_hash,p_document,p_user_id);
  insert into public.website_document_heads(workspace_id,website_work_id,revision) values(p_workspace_id,p_work_id,p_expected_revision+1)
    on conflict(website_work_id) do update set revision=excluded.revision,approved_revision=null,approved_hash=null,approved_by=null,approved_at=null;
  return query select * from public.website_documents where website_work_id=p_work_id and revision=p_expected_revision+1;
end $$;

create function public.read_website_documents(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer default null,p_all boolean default false) returns setof public.website_documents
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
  return query select d.* from public.website_documents d where d.workspace_id=p_workspace_id and d.website_work_id=p_work_id and (p_all or d.revision=coalesce(p_revision,(select h.revision from public.website_document_heads h where h.website_work_id=p_work_id))) order by d.revision desc;
end $$;

create function public.approve_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; doc public.website_documents;
begin
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  select * into head from public.website_document_heads where website_work_id=p_work_id for update;
  select * into doc from public.website_documents where website_work_id=p_work_id and revision=p_revision;
  if head.revision is distinct from p_revision or doc.content_hash is distinct from p_content_hash then raise exception 'website_revision_conflict'; end if;
  if exists(select 1 from jsonb_each(doc.document->'facts') f where f.value->>'origin'<>'owner_confirmed' and (coalesce((f.value->>'highRisk')::boolean,false) or f.value->'verification'->>'supported'='false' or (f.value->>'origin'<>'owner_stated' and (coalesce((f.value->'verification'->>'supported')::boolean,false)=false or coalesce((f.value->'verification'->>'confidence')::numeric,0)<0.85)))) then raise exception 'website_facts_unresolved'; end if;
  if exists(select 1 from jsonb_each(doc.document->'nodes') n where n.value->'verification'->>'needsReview'='true') then raise exception 'website_facts_unresolved'; end if;
  update public.website_document_heads set approved_revision=p_revision,approved_hash=p_content_hash,approved_by=p_user_id,approved_at=clock_timestamp() where website_work_id=p_work_id;
end $$;

create function public.publish_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
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
end $$;

create function public.read_published_website_documents(p_tenant_id text default null) returns table(workspace_id uuid,website_work_id uuid,revision integer,content_hash text,document jsonb,created_by uuid,created_at timestamptz,tenant_id text,receipt jsonb)
language sql security definer set search_path=public,pg_temp as $$
  select d.workspace_id,d.website_work_id,d.revision,d.content_hash,d.document,d.created_by,d.created_at,p.tenant_id,p.receipt from public.website_document_publications p join public.website_documents d using(workspace_id,website_work_id,revision) join public.tenants t on t.id=p.tenant_id where t.active and (p_tenant_id is null or p.tenant_id=p_tenant_id);
$$;

create function public.claim_website_rebuild(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_request_id text,p_domain_key text,p_input jsonb,p_payload jsonb) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work;
begin
  perform public.website_document_assert_actor(p_workspace_id,null,p_user_id,p_verified_email,false,true);
  if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{7,159}$' or p_domain_key is null or length(p_domain_key) not between 1 and 253 then raise exception 'website_intake_invalid'; end if;
  select * into existing from public.saved_product_work where workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' and input->>'requestId'=p_request_id;
  if found then
    if existing.input->'intake' is distinct from p_input or existing.input->>'domainKey' is distinct from p_domain_key then raise exception 'website_request_conflict'; end if;
    return next existing; return;
  end if;
  if exists(select 1 from public.saved_product_work where workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' and input->>'domainKey'=p_domain_key and payload->>'status' in ('queued','building','running','pending','rebuilding')) then raise exception 'website_rebuild_in_progress'; end if;
  if p_payload is null or p_payload->>'version' is distinct from '2' or p_payload->>'revision' is distinct from '0' or p_payload->>'createdBy' is distinct from p_user_id::text or jsonb_typeof(p_payload->'history') is distinct from 'array' or jsonb_array_length(p_payload->'history')<>0 then raise exception 'website_intake_invalid'; end if;
  return query insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,input,created_by) values(p_workspace_id,'websites','website',p_payload->>'title',p_payload,jsonb_build_object('requestId',p_request_id,'domainKey',p_domain_key,'intake',p_input),p_user_id) returning *;
end $$;

create function public.record_website_document_health(p_workspace_id uuid,p_work_id uuid,p_revision integer,p_content_hash text,p_checked_at timestamptz,p_status text,p_observed_hash text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.website_document_publications where workspace_id=p_workspace_id and website_work_id=p_work_id and revision=p_revision and content_hash=p_content_hash) then raise exception 'website_revision_conflict'; end if;
  insert into public.website_document_health values(p_workspace_id,p_work_id,p_revision,p_content_hash,p_checked_at,p_status,p_observed_hash) on conflict(website_work_id,checked_at) do nothing;
end $$;

-- Every function is internal; service-role bypass alone never grants table access.
revoke all on function public.website_document_immutable() from public,anon,authenticated;
revoke all on function public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.append_website_document(uuid,uuid,uuid,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.read_website_documents(uuid,uuid,uuid,text,integer,boolean) from public,anon,authenticated;
revoke all on function public.approve_website_document(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.read_published_website_documents(text) from public,anon,authenticated;
revoke all on function public.claim_website_rebuild(uuid,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.record_website_document_health(uuid,uuid,integer,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.append_website_document(uuid,uuid,uuid,text,integer,text,jsonb),public.read_website_documents(uuid,uuid,uuid,text,integer,boolean),public.approve_website_document(uuid,uuid,uuid,text,integer,text),public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb),public.read_published_website_documents(text),public.claim_website_rebuild(uuid,uuid,text,text,text,jsonb,jsonb),public.record_website_document_health(uuid,uuid,integer,text,timestamptz,text,text) to service_role;

-- Extend the existing bounded-work mutation to v2 websites only, preserving
-- the version of every existing row and every other history/CAS check.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
  definition := replace(definition, 'or p_payload->>''version'' is distinct from ''1''', 'or p_payload->>''version'' is distinct from existing.payload->>''version'' or (p_payload->>''version''<>''1'' and not (p_product_id=''websites'' and p_payload->>''version''=''2''))');
  if definition not like '%existing.payload->>''version''%' then raise exception 'website_bounded_version_upgrade_missing'; end if;
  execute definition;
end $$;

-- Preserve the existing recipient, expiry, destination, replay and delegation
-- boundary; enrich its accepted copy with the separate immutable document rows.
alter function public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean) rename to accept_workspace_handoff_pre_website_documents;
revoke all on function public.accept_workspace_handoff_pre_website_documents(text,uuid,text,uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.accept_workspace_handoff(p_token_hash text,p_user_id uuid,p_verified_email text,p_customer_workspace_id uuid,p_customer_workspace_name text,p_allow_agency_access boolean)
returns table(handoff_id uuid,customer_workspace_id uuid,customer_work_id uuid,delegation_id uuid,already_accepted boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare accepted record; source public.saved_product_work; source_id uuid;
begin
  -- The base acquires the handoff/identity/destination locks and rechecks all
  -- permissions. The transaction rolls back its copy if this enrichment fails.
  select * into accepted from public.accept_workspace_handoff_pre_website_documents(p_token_hash,p_user_id,p_verified_email,p_customer_workspace_id,p_customer_workspace_name,p_allow_agency_access);
  if not accepted.already_accepted then
    select source_work_id into source_id from public.workspace_handoffs where id=accepted.handoff_id;
    select * into source from public.saved_product_work where id=source_id;
    if source.product_id='websites' and source.resource_kind='website' and source.payload->>'version'='2' then
      perform pg_advisory_xact_lock(hashtextextended(source.workspace_id::text,7415));
      perform 1 from public.saved_product_work where id=source_id for update;
      if exists(select 1 from public.website_document_publications where website_work_id=source_id)
        or exists(select 1 from public.website_documents where website_work_id=source_id and document ? 'capabilities') then raise exception 'handoff_product_unsupported'; end if;
      insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by)
        select accepted.customer_workspace_id,accepted.customer_work_id,d.revision,d.content_hash,d.document,p_user_id
        from public.website_documents d where d.website_work_id=source_id;
      insert into public.website_document_heads(workspace_id,website_work_id,revision)
        select accepted.customer_workspace_id,accepted.customer_work_id,h.revision from public.website_document_heads h where h.website_work_id=source_id;
      -- A destination never receives a ready/approved source candidate. Its
      -- owner-specific initializer appends a reviewed candidate from the copied
      -- document, requiring the owner's own high-risk confirmations. If that
      -- app response is lost, replay safely resumes this initialization.
      update public.saved_product_work set payload=payload||jsonb_build_object(
        'revision',0,'status','building','candidate',null,'checkpoint',null,
        'approvedCandidateRevision',null,'tenantId',null,'launch',jsonb_build_object('receipt',null,'readBack',null),
        'stages','[]'::jsonb,'lastError',null,'createdBy',p_user_id,'createdAt',clock_timestamp(),'history','[]'::jsonb
      ),updated_at=clock_timestamp() where id=accepted.customer_work_id;
    end if;
  end if;
  return query select accepted.handoff_id,accepted.customer_workspace_id,accepted.customer_work_id,accepted.delegation_id,accepted.already_accepted;
end $$;
revoke all on function public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean) to service_role;

-- Workspace portability includes every v2 document, its work and receipts.
-- Keep the existing owner check and enforce its same total-byte limit.
alter function public.export_workspace_snapshot(uuid,uuid,text) rename to export_workspace_snapshot_pre_website_documents;
revoke all on function public.export_workspace_snapshot_pre_website_documents(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.export_workspace_snapshot(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; result_size integer;
begin
  result:=public.export_workspace_snapshot_pre_website_documents(p_workspace_id,p_user_id,p_verified_email);
  result:=result||jsonb_build_object(
    'websiteDocuments',(select coalesce(jsonb_agg(to_jsonb(d) order by d.website_work_id,d.revision),'[]'::jsonb) from public.website_documents d where d.workspace_id=p_workspace_id),
    'websiteWork',(select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]'::jsonb) from public.saved_product_work w where w.workspace_id=p_workspace_id and w.product_id='websites'),
    'websiteReceipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb) from public.website_document_receipts r where r.workspace_id=p_workspace_id));
  result_size:=octet_length(result::text);
  if result_size>2000000 then raise exception 'workspace_export_too_large'; end if;
  update public.workspace_export_receipts set byte_size=result_size where id=(result->>'exportId')::uuid;
  return result;
end $$;
revoke all on function public.export_workspace_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.export_workspace_snapshot(uuid,uuid,text) to service_role;

-- Persist the generated candidate and its saved-work projection together. A
-- losing work CAS rolls back the document/head too, so an orphan head cannot
-- invalidate the winning actor's approval or silently replace their copy.
create function public.commit_website_document_candidate(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_expected_document_revision integer,p_expected_work_revision integer,p_content_hash text,p_document jsonb,p_payload jsonb) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare head public.website_document_heads; doc public.website_documents; next_revision integer;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,true);
 select * into head from public.website_document_heads where website_work_id=p_work_id for update;
 if coalesce(head.revision,0) is distinct from p_expected_document_revision then raise exception 'website_revision_conflict'; end if;
 select * into doc from public.website_documents where website_work_id=p_work_id and revision=head.revision;
 if doc.content_hash=p_content_hash and p_payload->'candidate'->>'revision'=head.revision::text then
   if doc.document is distinct from p_document then raise exception 'website_candidate_invalid'; end if;
   next_revision:=head.revision;
 else
   perform public.append_website_document(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_expected_document_revision,p_content_hash,p_document);
   next_revision:=p_expected_document_revision+1;
 end if;
 if p_payload->'candidate'->>'revision' is distinct from next_revision::text
   or p_payload->'candidate'->>'contentHash' is distinct from p_content_hash
   or p_payload->'candidate'->'document' is distinct from p_document
   or p_payload->>'status' is distinct from 'review_ready'
   or p_payload->'approvedCandidateRevision' is distinct from 'null'::jsonb then raise exception 'website_candidate_invalid'; end if;
 return query select * from public.update_bounded_product_work(p_work_id,p_workspace_id,p_user_id,p_verified_email,'websites',p_expected_work_revision,p_payload);
end $$;
revoke all on function public.commit_website_document_candidate(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.commit_website_document_candidate(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb) to service_role;

create table public.website_hosted_tenant_reservations (
 website_work_id uuid primary key,
 workspace_id uuid not null,
 tenant_id text not null unique references public.tenants(id) on update cascade on delete restrict,
 tenant_stable_id uuid not null unique references public.tenants(stable_id) on delete restrict,
 created_by uuid not null references public.users(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete restrict
);
alter table public.website_hosted_tenant_reservations enable row level security;
revoke all on public.website_hosted_tenant_reservations from public,anon,authenticated,service_role;
create function public.reserve_website_hosted_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text) returns table(tenant_id text)
language plpgsql security definer set search_path=public,pg_temp as $$
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
end $$;
revoke all on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_website_hosted_tenant(uuid,uuid,uuid,text,integer,text,text) to service_role;

create function public.manage_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true); end $$;
create function public.manage_published_website_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 perform 1 from public.website_document_publications p join public.tenants t on t.id=p.tenant_id join public.memberships m on m.tenant_id=t.id and m.tenant_stable_id=t.stable_id
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active and m.user_id=p_user_id and m.role='owner' for share of p,t,m;
 if not found then raise exception 'website_tenant_access_denied'; end if;
end $$;
revoke all on function public.manage_website_document(uuid,uuid,uuid,text),public.manage_published_website_tenant(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manage_website_document(uuid,uuid,uuid,text),public.manage_published_website_tenant(uuid,uuid,uuid,text,text) to service_role;

-- Debug source HTML is a bounded, expiring evidence corpus. Facts and quotes
-- stay on immutable documents after the 30-day raw-source retention expires.
create table public.website_crawl_pages (
 workspace_id uuid not null,
 website_work_id uuid not null,
 source_id text not null check(length(source_id)<=2120),
 page jsonb not null,
 html_bytes integer not null check(html_bytes between 0 and 8388608),
 created_by uuid not null references public.users(id),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '30 days'),
 primary key(website_work_id,source_id),
 foreign key(website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete restrict
);
create index website_crawl_pages_expiry_idx on public.website_crawl_pages(expires_at);
alter table public.website_crawl_pages enable row level security;
revoke all on public.website_crawl_pages from public,anon,authenticated,service_role;
create function public.website_crawl_page_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and old.expires_at<=clock_timestamp() then return old; end if;
 raise exception 'website_crawl_page_immutable';
end $$;
create trigger website_crawl_page_immutable_trg before update or delete on public.website_crawl_pages for each row execute function public.website_crawl_page_immutable();
create function public.retain_website_crawl_page(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_page jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare html_bytes integer;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,true);
 if p_page is null or jsonb_typeof(p_page->'html') is distinct from 'string' or jsonb_typeof(p_page->'url') is distinct from 'string'
   or p_page->>'sourceId' is distinct from (p_page->>'url')||'#sha256='||encode(sha256(convert_to(p_page->>'html','UTF8')),'hex') then raise exception 'website_crawl_source_invalid'; end if;
 if exists(select 1 from public.website_crawl_pages where website_work_id=p_work_id and source_id=p_page->>'sourceId') then return; end if;
 html_bytes:=octet_length(p_page->>'html');
 if (select count(*) from public.website_crawl_pages where website_work_id=p_work_id)>=25
   or (select coalesce(sum(c.html_bytes),0) from public.website_crawl_pages c where c.website_work_id=p_work_id)+html_bytes>8388608 then raise exception 'website_crawl_limit_conflict'; end if;
 insert into public.website_crawl_pages(workspace_id,website_work_id,source_id,page,html_bytes,created_by) values(p_workspace_id,p_work_id,p_page->>'sourceId',p_page,html_bytes,p_user_id);
end $$;
create function public.prune_website_crawl_pages() returns table(removed bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare deleted_count bigint;
begin delete from public.website_crawl_pages where expires_at<=clock_timestamp(); get diagnostics deleted_count=row_count; return query select deleted_count; end $$;
revoke all on function public.website_crawl_page_immutable() from public,anon,authenticated;
revoke all on function public.retain_website_crawl_page(uuid,uuid,uuid,text,jsonb),public.prune_website_crawl_pages() from public,anon,authenticated;
grant execute on function public.retain_website_crawl_page(uuid,uuid,uuid,text,jsonb),public.prune_website_crawl_pages() to service_role;

create function public.read_website_crawl_pages(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns setof public.website_crawl_pages
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
 return query select c.* from public.website_crawl_pages c where c.workspace_id=p_workspace_id and c.website_work_id=p_work_id and c.expires_at>clock_timestamp() order by c.created_at;
end $$;
revoke all on function public.read_website_crawl_pages(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_website_crawl_pages(uuid,uuid,uuid,text) to service_role;

-- Private immutable publication history; document-list RPCs intentionally do
-- not pretend unpublished revisions have launch receipts.
create function public.read_website_document_receipts(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns setof public.website_document_receipts
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,false,false);
 return query select r.* from public.website_document_receipts r where r.workspace_id=p_workspace_id and r.website_work_id=p_work_id order by r.revision desc,r.created_at desc;
end $$;
revoke all on function public.read_website_document_receipts(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_website_document_receipts(uuid,uuid,uuid,text) to service_role;
