-- Native website candidates, using the existing immutable document/head/work
-- workflow. This adds retry receipts only; it creates no content store and no
-- approval, publishing, legacy tenant or provider authority.
create table public.assistant_website_proposals (
 workspace_id uuid not null references public.workspaces(id),
 user_id uuid not null references public.users(id),
 request_id uuid not null,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 website_work_id uuid not null,
 revision integer not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 summary text not null check(char_length(summary) between 1 and 500),
 created_at timestamptz not null default clock_timestamp(),
 primary key(workspace_id,user_id,request_id),
 foreign key(workspace_id,website_work_id,revision) references public.website_documents(workspace_id,website_work_id,revision)
);
alter table public.assistant_website_proposals enable row level security;
revoke all on public.assistant_website_proposals from public,anon,authenticated,service_role;
create trigger assistant_website_proposals_immutable before update or delete on public.assistant_website_proposals for each row execute function public.website_document_immutable();

create function public.agent_website_proposal_receipt(p_row public.assistant_website_proposals) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('requestId',p_row.request_id,'websiteWorkId',p_row.website_work_id,'revision',p_row.revision,'contentHash',p_row.content_hash,'currentRevision',h.revision,'currentContentHash',d.content_hash,'summary',p_row.summary,'createdAt',p_row.created_at,
 'status',case when exists(select 1 from public.website_document_publications where workspace_id=p_row.workspace_id and website_work_id=p_row.website_work_id and revision=p_row.revision and content_hash=p_row.content_hash) then 'published'
 when h.revision<>p_row.revision then 'superseded'
 when h.approved_revision=p_row.revision and h.approved_hash=p_row.content_hash then 'approved' else 'awaiting_review' end)
 from public.website_document_heads h join public.website_documents d on d.workspace_id=h.workspace_id and d.website_work_id=h.website_work_id and d.revision=h.revision
 where h.workspace_id=p_row.workspace_id and h.website_work_id=p_row.website_work_id
$$;
revoke all on function public.agent_website_proposal_receipt(public.assistant_website_proposals) from public,anon,authenticated,service_role;

create function public.list_agent_websites(p_token_hash text,p_resource text,p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; result jsonb;
begin
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:read',p_workspace_id);
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('websiteWorkId',w.id,'title',w.title,'status',w.payload->>'status','revision',(w.payload->>'revision')::integer,'candidateRevision',h.revision,'candidateContentHash',d.content_hash) order by w.updated_at desc),'[]') into result
 from (select * from public.saved_product_work where workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' and payload->>'version'='2' order by updated_at desc limit 50) w
 left join public.website_document_heads h on h.website_work_id=w.id and h.workspace_id=w.workspace_id
 left join public.website_documents d on d.website_work_id=h.website_work_id and d.revision=h.revision;
 return result;
end $$;
create function public.read_agent_website_work(p_token_hash text,p_resource text,p_workspace_id uuid,p_work_id uuid,p_scope text default 'website:read') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; w public.saved_product_work; h public.website_document_heads; d public.website_documents;
begin
 if p_scope is null or p_scope not in ('website:read','website:propose') then raise exception 'oauth_invalid_token'; end if;
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,p_scope,p_workspace_id);
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 -- Serialize with native candidate commits before taking work/head read locks.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 select * into w from public.saved_product_work where workspace_id=p_workspace_id and id=p_work_id and product_id='websites' and resource_kind='website' and payload->>'version'='2' for share;
 if not found then raise exception 'workspace_access_denied'; end if;
 select * into h from public.website_document_heads where workspace_id=p_workspace_id and website_work_id=p_work_id for share;
 if not found then raise exception 'website_candidate_unavailable'; end if;
 select * into d from public.website_documents where workspace_id=p_workspace_id and website_work_id=p_work_id and revision=h.revision;
 if w.payload->'candidate'->>'revision' is distinct from h.revision::text or w.payload->'candidate'->>'contentHash' is distinct from d.content_hash or w.payload->'candidate'->'document' is distinct from d.document then raise exception 'website_revision_conflict'; end if;
 return jsonb_build_object('work',to_jsonb(w),'documentRevision',h.revision,'contentHash',d.content_hash,'approvedRevision',h.approved_revision,'publishedRevision',(select revision from public.website_document_publications where website_work_id=p_work_id and workspace_id=p_workspace_id));
end $$;
create function public.read_agent_website_proposal_retry(p_token_hash text,p_resource text,p_workspace_id uuid,p_request_id uuid,p_request_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; r public.assistant_website_proposals;
begin
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:propose',p_workspace_id);
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 select * into r from public.assistant_website_proposals where workspace_id=p_workspace_id and user_id=t.user_id and request_id=p_request_id;
 if not found then return null; end if;
 if r.request_hash is distinct from p_request_hash then raise exception 'website_request_conflict'; end if;
 return public.agent_website_proposal_receipt(r);
end $$;
create function public.list_agent_website_proposals(p_token_hash text,p_resource text,p_workspace_id uuid,p_work_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; result jsonb;
begin
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:read',p_workspace_id);
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
 select coalesce(jsonb_agg(public.agent_website_proposal_receipt(r) order by r.created_at desc),'[]') into result from (select * from public.assistant_website_proposals where workspace_id=p_workspace_id and user_id=t.user_id and (p_work_id is null or website_work_id=p_work_id) order by created_at desc limit 50) r;
 return result;
end $$;
create function public.commit_agent_website_candidate(p_token_hash text,p_resource text,p_workspace_id uuid,p_work_id uuid,p_request_id uuid,p_request_hash text,p_summary text,p_expected_work_revision integer,p_expected_document_revision integer,p_expected_candidate_hash text,p_content_hash text,p_document jsonb,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; r public.assistant_website_proposals; w public.saved_product_work; h public.website_document_heads; d public.website_documents; fact record;
begin
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:propose',p_workspace_id);
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||t.user_id::text||p_request_id::text,1813));
 select * into r from public.assistant_website_proposals where workspace_id=p_workspace_id and user_id=t.user_id and request_id=p_request_id;
 if found then
   if r.request_hash is distinct from p_request_hash or r.website_work_id is distinct from p_work_id then raise exception 'website_request_conflict'; end if;
   return public.agent_website_proposal_receipt(r);
 end if;
 -- Use the native workspace/write lock order before touching its work/head.
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,t.user_id,t.verified_email,false,true);
 select * into w from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
 select * into h from public.website_document_heads where website_work_id=p_work_id and workspace_id=p_workspace_id for update;
 select * into d from public.website_documents where website_work_id=p_work_id and revision=h.revision;
 if w.payload->>'version' is distinct from '2' or w.payload->>'revision' is distinct from p_expected_work_revision::text or h.revision is distinct from p_expected_document_revision or d.content_hash is distinct from p_expected_candidate_hash or w.payload->'candidate'->'document' is distinct from d.document then raise exception 'website_revision_conflict'; end if;
 -- Existing source facts, runtime connections, assets, provenance, identity
 -- and all other payload fields retain their native ownership.
 if (p_document-array['nodes','pages','facts']) is distinct from (d.document-array['nodes','pages','facts']) then raise exception 'website_candidate_invalid'; end if;
 for fact in select key,value from jsonb_each(d.document->'facts') loop
   if p_document->'facts'->fact.key is distinct from fact.value then raise exception 'website_candidate_invalid'; end if;
 end loop;
 for fact in select key,value from jsonb_each(p_document->'facts') where not (d.document->'facts' ? key) loop
   if fact.value->>'origin' is distinct from 'owner_stated' or fact.value->'highRisk' is distinct from 'true'::jsonb or coalesce((fact.value->'verification'->>'supported')::boolean,false) then raise exception 'website_candidate_invalid'; end if;
 end loop;
 if p_payload is null or (p_payload-array['revision','status','candidate','approvedCandidateRevision','checkpoint','lastError','audit','history']) is distinct from (w.payload-array['revision','status','candidate','approvedCandidateRevision','checkpoint','lastError','audit','history']) or p_payload->'checkpoint' is distinct from 'null'::jsonb or p_payload->'lastError' is distinct from 'null'::jsonb or p_payload->'audit' is distinct from 'null'::jsonb or p_payload->'candidate'->>'revision' is distinct from (p_expected_document_revision+1)::text or p_content_hash=d.content_hash then raise exception 'website_candidate_invalid'; end if;
 -- Recheck expiry immediately before the atomic native commit.
 perform public.lock_agent_oauth_token(p_token_hash,p_resource,'website:propose',p_workspace_id);
 perform public.commit_website_document_candidate(p_workspace_id,p_work_id,t.user_id,t.verified_email,p_expected_document_revision,p_expected_work_revision,p_content_hash,p_document,p_payload);
 insert into public.assistant_website_proposals(workspace_id,user_id,request_id,request_hash,website_work_id,revision,content_hash,summary) values(p_workspace_id,t.user_id,p_request_id,p_request_hash,p_work_id,p_expected_document_revision+1,p_content_hash,p_summary) returning * into r;
 return public.agent_website_proposal_receipt(r);
end $$;
revoke all on function public.list_agent_websites(text,text,uuid),public.read_agent_website_work(text,text,uuid,uuid,text),public.read_agent_website_proposal_retry(text,text,uuid,uuid,text),public.list_agent_website_proposals(text,text,uuid,uuid),public.commit_agent_website_candidate(text,text,uuid,uuid,uuid,text,text,integer,integer,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.list_agent_websites(text,text,uuid),public.read_agent_website_work(text,text,uuid,uuid,text),public.read_agent_website_proposal_retry(text,text,uuid,uuid,text),public.list_agent_website_proposals(text,text,uuid,uuid),public.commit_agent_website_candidate(text,text,uuid,uuid,uuid,text,text,integer,integer,text,text,jsonb,jsonb) to service_role;
