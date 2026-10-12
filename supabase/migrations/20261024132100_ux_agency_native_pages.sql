-- AG2: scoped native form/booking page drafts. No outside write or approval.
begin;
set local lock_timeout='2s';
create table public.agency_native_page_commands (
 command_id uuid primary key, agency_workspace_id uuid not null references public.workspaces(id),
 workspace_id uuid not null references public.workspaces(id), work_id uuid not null references public.saved_product_work(id),
 actor_id uuid not null references public.users(id), input jsonb not null, receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.agency_native_page_commands enable row level security;
revoke all on public.agency_native_page_commands from public,anon,authenticated,service_role;
create trigger agency_native_page_commands_immutable before update or delete on public.agency_native_page_commands
 for each row execute function public.system_version_history_immutable();

create function public.require_agency_native_page_scope(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_kind text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_kind is not null and p_kind not in ('form','booking') then raise exception 'agency_page_invalid'; end if;
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=p_agency_workspace_id
  join public.workspaces a on a.id=m.workspace_id and a.kind='agency'
  join public.provider_seats s on s.agency_workspace_id=a.id and s.customer_workspace_id=p_workspace_id and s.status='active'
  join public.agency_client_staff st on st.agency_workspace_id=a.id and st.customer_workspace_id=p_workspace_id and st.user_id=u.id and st.status='active'
  where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null for share of m,s,st,u,a;
 if not found then raise exception 'agency_page_scope_required'; end if;
 perform 1 from public.agency_scope_grants g where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=p_agency_workspace_id
  and g.status='active' and g.scope='website' for share;
 if not found then raise exception 'agency_page_scope_required'; end if;
 perform 1 from public.agency_scope_grants g where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=p_agency_workspace_id
  and g.status='active' and ((p_kind='form' and g.scope='inquiries') or (p_kind='booking' and g.scope='bookings') or (p_kind is null and g.scope in ('inquiries','bookings'))) for share;
 if not found then raise exception 'agency_page_scope_required'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
end $$;

create function public.read_agency_native_page_work(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_input jsonb,p_work_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.saved_product_work; immutable_doc public.website_documents; publication public.website_document_publications; inquiry public.inquiry_workspaces; caps jsonb; live jsonb; grant_row public.public_website_booking_grants;
begin
 perform public.require_agency_native_page_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,p_input->>'kind');
 select * into w from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' for share;
 if not found or w.payload->>'status'<>'published' or w.payload->>'version'<>'2' then raise exception 'agency_page_unavailable'; end if;
 select * into publication from public.website_document_publications where website_work_id=w.id and workspace_id=p_workspace_id for share;
 if not found or publication.revision::text is distinct from w.payload->'candidate'->>'revision' or publication.content_hash is distinct from w.payload->'candidate'->>'contentHash' then raise exception 'agency_page_stale'; end if;
 select * into immutable_doc from public.website_documents where website_work_id=w.id and workspace_id=p_workspace_id and revision=publication.revision for share;
 if not found or immutable_doc.document is distinct from w.payload->'candidate'->'document' or immutable_doc.content_hash is distinct from publication.content_hash then raise exception 'agency_page_stale'; end if;
 perform 1 from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_workspace_id where t.id=publication.tenant_id and t.active for share of t,l;
 if not found then raise exception 'agency_page_unavailable'; end if;
 caps:=w.payload->'candidate'->'document'->'capabilities';
 if caps->>'tenant' is distinct from publication.tenant_id or caps->'inquiry' is null then raise exception 'agency_page_unavailable'; end if;
 select * into inquiry from public.inquiry_workspaces where tenant_id=publication.tenant_id and business_id=p_workspace_id::text for share;
 if not found then raise exception 'agency_page_unavailable'; end if;
 select c->'live' into live from jsonb_array_elements(inquiry.state->'capabilities') c where c->>'id'=caps->'inquiry'->>'capabilityId'
  and c->>'status' in ('live','live_unverified') and c->'live'->>'version'=caps->'inquiry'->>'version';
 if live is null or live->>'businessId' is distinct from p_workspace_id::text then raise exception 'agency_page_stale'; end if;
 if p_input->>'kind'='booking' then
  select * into grant_row from public.public_website_booking_grants g where g.business_workspace_id=p_workspace_id and g.tenant_stable_id=inquiry.tenant_stable_id
   and g.status='published' and g.capability_id=caps->'booking'->>'capabilityId' and g.capability_version::text=caps->'booking'->>'version'
   and g.inquiry_capability_id=caps->'inquiry'->>'capabilityId' and g.inquiry_version::text=caps->'inquiry'->>'version' for share;
  if not found then raise exception 'agency_page_stale'; end if;
  perform 1 from public.workspace_calendar_connections c where c.workspace_id=p_workspace_id and c.provider=grant_row.provider and c.status='connected' and c.time_zone=grant_row.time_zone for share;
  if not found then raise exception 'agency_page_unavailable'; end if;
  perform 1 from public.saved_product_work schedule where schedule.id=grant_row.work_id and schedule.workspace_id=p_workspace_id
   and schedule.product_id='scheduling' and schedule.payload->'pause' is null for share;
  if not found then raise exception 'agency_page_unavailable'; end if;
 end if;
 return w.payload||jsonb_build_object('agencyPageOrigin',jsonb_build_object('kind','agency','agencyId',p_agency_workspace_id,'userId',p_user_id,'displayName',(select case when coalesce(nullif(btrim(agency_brand->>'displayName'),''),name)='Strelva' then 'Strelva Agency' else coalesce(nullif(btrim(agency_brand->>'displayName'),''),name) end from public.workspaces where id=p_agency_workspace_id)));
end $$;

create function public.read_agency_native_page_choices(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.saved_product_work; payload jsonb; form_ok boolean; booking_ok boolean; choices jsonb:='[]';
begin
 perform public.require_agency_native_page_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email);
 for w in select * from public.saved_product_work spw where spw.workspace_id=p_workspace_id and spw.product_id='websites' and spw.resource_kind='website' and spw.payload->>'status'='published' order by id loop
  form_ok:=false; booking_ok:=false;
  begin payload:=public.read_agency_native_page_work(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,'{"kind":"form"}',w.id); form_ok:=true;
   exception when others then if sqlerrm not in ('agency_page_scope_required','agency_page_unavailable','agency_page_stale') then raise; end if; end;
  begin payload:=public.read_agency_native_page_work(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,'{"kind":"booking"}',w.id); booking_ok:=true;
   exception when others then if sqlerrm not in ('agency_page_scope_required','agency_page_unavailable','agency_page_stale') then raise; end if; end;
  if form_ok or booking_ok then choices:=choices||jsonb_build_array(jsonb_build_object('workId',w.id,'title',w.title,'expectedRevision',w.payload->'revision',
   'candidateRevision',w.payload->'candidate'->'revision','candidateContentHash',w.payload->'candidate'->'contentHash','inquiry',form_ok,'booking',booking_ok)); end if;
 end loop;
 return jsonb_build_object('workspaceId',p_workspace_id,'choices',choices);
end $$;

create function public.read_agency_native_page_command(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.agency_native_page_commands;
begin
 perform public.require_agency_native_page_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,p_input->>'kind');
 select * into receipt from public.agency_native_page_commands where command_id=(p_input->>'commandId')::uuid;
 if not found then return null; end if;
 if receipt.agency_workspace_id<>p_agency_workspace_id or receipt.workspace_id<>p_workspace_id or receipt.actor_id<>p_user_id or receipt.input is distinct from p_input then raise exception 'agency_page_conflict'; end if;
 return receipt.receipt;
end $$;

create function public.submit_agency_native_page(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_input jsonb,p_document jsonb,p_payload jsonb,p_content_hash text,p_canonical_document text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior jsonb; base jsonb; doc jsonb; item record; page jsonb; root text; heading text; form_id text; expected_node_type text; expected_variant text; receipt jsonb; head public.website_document_heads; work_id uuid:=(p_input->>'workId')::uuid;
begin
 -- Native website writes take the workspace lock before document/work locks.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if not found then raise exception 'agency_page_scope_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agency-native-page:'||(p_input->>'commandId'),0));
 prior:=public.read_agency_native_page_command(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,p_input);
 if prior is not null then return prior; end if;
 perform 1 from public.saved_product_work where id=work_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'agency_page_scope_required'; end if;
 select * into head from public.website_document_heads where website_work_id=work_id and workspace_id=p_workspace_id for update;
 if not found or head.revision::text is distinct from p_input->>'candidateRevision' then raise exception 'agency_page_conflict'; end if;
 base:=public.read_agency_native_page_work(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,p_input,work_id);
 doc:=base->'candidate'->'document';
 if base->'revision' is distinct from p_input->'expectedRevision' or base->'candidate'->'revision' is distinct from p_input->'candidateRevision'
  or base->'candidate'->'contentHash' is distinct from p_input->'candidateContentHash' then raise exception 'agency_page_conflict'; end if;
 -- The only allowed graph delta is one page and its three native nodes. No
 -- existing text, capability, navigation, records or approval can be replaced.
 if (p_document-'nodes'-'pages'-'facts') is distinct from (doc-'nodes'-'pages'-'facts')
  or jsonb_array_length(p_document->'pages')<>jsonb_array_length(doc->'pages')+1 or jsonb_array_length(p_document->'pages')>12
  or (select count(*) from jsonb_object_keys(p_document->'nodes'))<>(select count(*)+3 from jsonb_object_keys(doc->'nodes')) then raise exception 'agency_page_invalid'; end if;
 for item in select key,value from jsonb_each(doc->'nodes') loop if p_document->'nodes'->item.key is distinct from item.value then raise exception 'agency_page_invalid'; end if; end loop;
 for item in select key,value from jsonb_each(doc->'facts') loop if p_document->'facts'->item.key is distinct from item.value then raise exception 'agency_page_invalid'; end if; end loop;
 if ((p_document->'pages') - (jsonb_array_length(p_document->'pages')-1)) is distinct from doc->'pages' then raise exception 'agency_page_invalid'; end if;
 page:=p_document->'pages'->(jsonb_array_length(doc->'pages')); root:=page->>'root';
 if page is distinct from jsonb_build_object('path',p_input->>'path','title',p_input->>'title','description',p_input->>'description','root',root)
  or exists(select 1 from jsonb_array_elements(doc->'pages') p where p->>'path'=p_input->>'path') then raise exception 'agency_page_invalid'; end if;
 heading:=p_document->'nodes'->root->'children'->>0; form_id:=p_document->'nodes'->root->'children'->>1;
 expected_node_type:=case when p_input->>'kind'='form' then 'InquiryForm' else 'Booking' end;
 if root is null or heading is null or form_id is null or doc->'nodes' ? root or doc->'nodes' ? heading or doc->'nodes' ? form_id
  or p_document->'nodes'->root->>'type' is distinct from 'Section' or jsonb_array_length(p_document->'nodes'->root->'children')<>2
  or p_document->'nodes'->heading->>'type' is distinct from 'PageHeader'
  or p_document->'nodes'->form_id->>'type' is distinct from expected_node_type
  or p_document->'nodes'->heading->'props' is distinct from jsonb_build_object('title',p_input->>'title','body',p_input->>'description')
  or p_document->'nodes'->form_id->'props' is distinct from jsonb_build_object('title',p_input->>'title') then raise exception 'agency_page_invalid'; end if;
 -- New review evidence belongs only to the three introduced nodes. It
 -- cannot confirm a fact or attach fresh authority to any existing node.
 for item in select key,value from jsonb_each(p_document->'facts') where not (doc->'facts' ? key) loop
  if item.value->>'origin' is distinct from 'owner_stated' or item.value->'highRisk' is distinct from 'true'::jsonb
   or item.value->'verification'->'supported' is distinct from 'false'::jsonb or item.value->'verification'->'confidence' is distinct from '0'::jsonb
   or not exists(select 1 from jsonb_each(p_document->'nodes') n where n.key in (root,heading,form_id) and n.value->'factIds' ? item.key) then raise exception 'agency_page_invalid'; end if;
 end loop;
 for item in select key,value from jsonb_each(p_document->'nodes') where key in (root,heading,form_id) loop
  expected_variant:=case item.key when root then 'container' when heading then 'standard' else 'inline' end;
  if item.value->>'id' is distinct from item.key or item.value-'id'-'type'-'variant'-'props'-'children'-'factIds'-'verification'<>'{}'::jsonb
   or item.value->>'variant' is distinct from expected_variant
   or (item.key=root and item.value->'props'<>'{}'::jsonb)
   or (item.key<>root and item.value->'children'<>'[]'::jsonb)
   or exists(select 1 from jsonb_array_elements_text(item.value->'factIds') f where doc->'facts' ? f or not (p_document->'facts' ? f))
   or (item.value->'verification'->>'supported'='true' and jsonb_array_length(item.value->'factIds')>0) then raise exception 'agency_page_invalid'; end if;
 end loop;
 for item in select node_id,words from (values(root,p_input->>'title'),(root,p_input->>'description'),(heading,p_input->>'title'),(heading,p_input->>'description'),(form_id,p_input->>'title')) as required(node_id,words) loop
  if coalesce(item.words,'')<>'' and not exists(select 1 from jsonb_array_elements_text(p_document->'nodes'->item.node_id->'factIds') f
   where p_document->'facts'->f->>'text'=item.words) then raise exception 'agency_page_invalid'; end if;
 end loop;
 if (p_payload-'revision'-'status'-'approvedCandidateRevision'-'checkpoint'-'lastError'-'audit'-'candidate'-'history') is distinct from (base-'revision'-'status'-'approvedCandidateRevision'-'checkpoint'-'lastError'-'audit'-'candidate'-'history')
  or p_payload->'revision' is distinct from to_jsonb((base->>'revision')::integer+1)
  or ((p_payload->'history') - (jsonb_array_length(p_payload->'history')-1)) is distinct from base->'history'
  or p_payload->'history'->(jsonb_array_length(base->'history'))->>'actorId' is distinct from p_user_id::text
  or p_payload->'history'->(jsonb_array_length(base->'history'))->>'kind' is distinct from 'agency_document_draft' then raise exception 'agency_page_invalid'; end if;
 -- The ordinary native writer requires direct client membership. This scoped
 -- page seam uses the same immutable documents/head/work transaction after
 -- checking the exact ordinary agency, staff, scope and current connections.
 if p_canonical_document is null or p_canonical_document::jsonb is distinct from p_document or encode(sha256(convert_to(p_canonical_document,'UTF8')),'hex') is distinct from p_content_hash then raise exception 'agency_page_invalid'; end if;
 if p_payload->>'status' is distinct from 'review_ready' or p_payload->'approvedCandidateRevision' is distinct from 'null'::jsonb
  or p_payload->'checkpoint' is distinct from 'null'::jsonb or p_payload->'lastError' is distinct from 'null'::jsonb
  or p_payload->'audit' is distinct from 'null'::jsonb or octet_length(p_payload::text)>2000000
  or p_payload->'candidate'->'revision' is distinct from to_jsonb(head.revision+1)
  or p_payload->'candidate'->>'contentHash' is distinct from p_content_hash or p_content_hash !~ '^[a-f0-9]{64}$'
  or p_payload->'candidate'->'document' is distinct from p_document
  or jsonb_array_length(p_payload->'history')<>jsonb_array_length(base->'history')+1 or jsonb_array_length(p_payload->'history')>500
  or p_payload->'history'->(jsonb_array_length(base->'history'))->'revision' is distinct from p_payload->'revision'
  or coalesce(p_payload->'history'->(jsonb_array_length(base->'history'))->>'at','')='' then raise exception 'agency_page_invalid'; end if;
 perform public.require_agency_native_page_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email,p_input->>'kind');
 insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(p_workspace_id,work_id,head.revision+1,p_content_hash,p_document,p_user_id);
 update public.website_document_heads set revision=head.revision+1,approved_revision=null,approved_hash=null,approved_by=null,approved_at=null where website_work_id=work_id;
 update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp() where id=work_id and workspace_id=p_workspace_id;
 receipt:=jsonb_build_object('workspaceId',p_workspace_id,'workId',work_id,'commandId',p_input->>'commandId',
  'candidateRevision',p_payload->'candidate'->'revision','contentHash',p_content_hash,'previewHref',p_payload->'candidate'->'previewHref','actor',p_payload->'agencyPageOrigin');
 insert into public.agency_native_page_commands(command_id,agency_workspace_id,workspace_id,work_id,actor_id,input,receipt)
  values((p_input->>'commandId')::uuid,p_agency_workspace_id,p_workspace_id,work_id,p_user_id,p_input,receipt);
 return receipt;
end $$;
revoke all on function public.require_agency_native_page_scope(uuid,uuid,uuid,text,text),public.read_agency_native_page_work(uuid,uuid,uuid,text,jsonb,uuid),
 public.read_agency_native_page_choices(uuid,uuid,uuid,text),public.read_agency_native_page_command(uuid,uuid,uuid,text,jsonb),
 public.submit_agency_native_page(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.read_agency_native_page_work(uuid,uuid,uuid,text,jsonb,uuid),public.read_agency_native_page_choices(uuid,uuid,uuid,text),
 public.read_agency_native_page_command(uuid,uuid,uuid,text,jsonb),public.submit_agency_native_page(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text) to service_role;
create table public.agency_native_page_contracts(signature text primary key,installed_hash text not null);
alter table public.agency_native_page_contracts enable row level security;
revoke all on public.agency_native_page_contracts from public,anon,authenticated,service_role;
insert into public.agency_native_page_contracts
 select signature,md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
 'public.require_agency_native_page_scope(uuid,uuid,uuid,text,text)',
 'public.read_agency_native_page_work(uuid,uuid,uuid,text,jsonb,uuid)',
 'public.read_agency_native_page_choices(uuid,uuid,uuid,text)',
 'public.read_agency_native_page_command(uuid,uuid,uuid,text,jsonb)',
 'public.submit_agency_native_page(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text)']) signature;
commit;
