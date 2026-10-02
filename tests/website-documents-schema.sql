\set ON_ERROR_STOP on
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;
select pg_temp.assert_true(not has_table_privilege('service_role','public.website_documents','select'),'service role must use document RPCs');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.read_published_website_documents(text)','execute'),'anonymous/authenticated cannot call service public read RPC');
select pg_temp.assert_true(not has_function_privilege('anon','public.claim_website_rebuild(uuid,uuid,text,text,text,jsonb,jsonb)','execute'),'anon cannot start rebuilds');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.read_website_document_receipts(uuid,uuid,uuid,text)','execute') and not has_function_privilege('anon','public.read_website_document_receipts(uuid,uuid,uuid,text)','execute'),'receipt history is service-RPC only');
select pg_temp.assert_true(has_function_privilege('service_role','public.read_website_document_receipts(uuid,uuid,uuid,text)','execute') and not has_table_privilege('service_role','public.website_document_receipts','select'),'service receipt reads require actor RPC');
select pg_temp.assert_true(not has_function_privilege('service_role','public.website_document_assert_launch_owner(uuid,uuid)','execute'),'launch authorization helper is internal');

do $$
declare
  owner_id uuid := '61000000-0000-4000-8000-000000000001';
  other_id uuid := '61000000-0000-4000-8000-000000000004';
  member_id uuid := '61000000-0000-4000-8000-000000000005';
  ws uuid := '61000000-0000-4000-8000-000000000002';
  work public.saved_product_work;
  repeated public.saved_product_work;
  doc jsonb := '{"version":2,"siteName":"Fictional","nodes":{},"pages":[],"facts":{"risk":{"text":"Licensed in 1992","kind":"credential","origin":"source","highRisk":true,"sources":[{"sourceId":"one","quote":"Licensed in 1992"}],"verification":{"supported":true,"confidence":1}}}}';
  h text := repeat('a',64);
  rec jsonb;
  payload jsonb;
begin
  insert into public.users(id,email,verified_at) values(owner_id,'v2-owner@example.test',now()),(other_id,'v2-other@example.test',now()),(member_id,'v2-member@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional v2 business',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id),(ws,member_id,'member',owner_id);
  payload := jsonb_build_object('version',2,'revision',0,'title','Fictional','status','building','createdBy',owner_id,'createdAt','2026-10-01T12:00:00Z','history','[]'::jsonb);
  select * into work from public.claim_website_rebuild(ws,owner_id,'v2-owner@example.test','v2-request-one','fictional.example.test','{"url":"https://fictional.example.test"}',payload);
  select * into repeated from public.claim_website_rebuild(ws,owner_id,'v2-owner@example.test','v2-request-one','fictional.example.test','{"url":"https://fictional.example.test"}',payload);
  perform pg_temp.assert_true(work.id=repeated.id,'intake replay reopens exact work');
  perform pg_temp.expect_error(format('select public.claim_website_rebuild(%L,%L,%L,%L,%L,%L,%L)',ws,owner_id,'v2-owner@example.test','v2-request-two','fictional.example.test','{"url":"https://fictional.example.test"}',payload),'website_rebuild_in_progress');
  perform pg_temp.expect_error(format('select public.claim_website_rebuild(%L,%L,%L,%L,%L,%L,%L)',ws,owner_id,'v2-owner@example.test','v2-request-one','different.example.test','{"url":"https://different.example.test"}',payload),'website_request_conflict');
  perform public.append_website_document(ws,work.id,owner_id,'v2-owner@example.test',0,h,doc);
  perform pg_temp.expect_error(format('select public.append_website_document(%L,%L,%L,%L,0,%L,%L)',ws,work.id,owner_id,'v2-owner@example.test',h,doc),'website_revision_conflict');
  perform pg_temp.expect_error(format('select public.read_website_documents(%L,%L,%L,%L,null,false)',ws,work.id,other_id,'v2-other@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.approve_website_document(%L,%L,%L,%L,1,%L)',ws,work.id,owner_id,'v2-owner@example.test',h),'website_facts_unresolved');
  perform pg_temp.expect_error(format('select public.approve_website_document(%L,%L,%L,%L,1,%L)',ws,work.id,member_id,'v2-member@example.test',h),'workspace_access_denied');
  doc := jsonb_set(doc,'{facts,risk,origin}','"owner_confirmed"');
  perform public.append_website_document(ws,work.id,owner_id,'v2-owner@example.test',1,h,doc);
  insert into public.tenants(id,site_name) values('v2-fictional','Fictional hosted');
  insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) select owner_id,id,stable_id,'owner' from public.tenants where id='v2-fictional';
  rec := jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h,'candidateRevision',2,'receiptId','fictional-receipt','providerUrl','https://v2-fictional.strelva.com','evidence','Fictional local publication','publishedAt','2026-10-01T12:00:00Z');
  perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',ws,work.id,owner_id,'v2-owner@example.test',h,'v2-fictional',rec),'website_approval_required');
  perform public.approve_website_document(ws,work.id,owner_id,'v2-owner@example.test',2,h);
  perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',ws,work.id,owner_id,'v2-owner@example.test',h,'gldf',rec),'website_tenant_access_denied');
  perform public.publish_website_document(ws,work.id,owner_id,'v2-owner@example.test',2,h,'v2-fictional',rec);
  perform public.publish_website_document(ws,work.id,owner_id,'v2-owner@example.test',2,h,'v2-fictional',rec);
  perform pg_temp.assert_true((select count(*) from public.website_document_receipts where website_work_id=work.id)=1,'publish replay records a single receipt');
  perform pg_temp.assert_true((select count(*) from public.read_published_website_documents('v2-fictional'))=1,'published pointer is durable and queryable');
  perform public.record_website_document_health(ws,work.id,2,h,'2026-10-01T13:00:00Z','healthy',h);
  perform public.append_website_document(ws,work.id,owner_id,'v2-owner@example.test',2,h,doc);
  perform pg_temp.assert_true((select approved_revision is null from public.website_document_heads where website_work_id=work.id),'append clears approval');
  perform pg_temp.assert_true((select revision from public.read_published_website_documents('v2-fictional'))=2,'draft append leaves published pointer unchanged');
  perform public.manage_published_website_tenant(ws,work.id,owner_id,'v2-owner@example.test','v2-fictional');
  perform public.approve_website_document(ws,work.id,owner_id,'v2-owner@example.test',3,h);
  rec:=rec||jsonb_build_object('candidateRevision',3,'receiptId','fictional-second-receipt');
  perform public.publish_website_document(ws,work.id,owner_id,'v2-owner@example.test',3,h,'v2-fictional',rec);
  perform pg_temp.assert_true((select count(*) from public.read_website_document_receipts(ws,work.id,owner_id,'v2-owner@example.test'))=2,'private receipt history includes both publications');
  perform pg_temp.assert_true((select array_agg(revision) from public.read_website_document_receipts(ws,work.id,owner_id,'v2-owner@example.test'))=array[3,2],'receipt history newest revision first');
  perform pg_temp.expect_error(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,work.id,other_id,'v2-other@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,work.id,owner_id,'wrong@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.manage_website_document(%L,%L,%L,%L)',ws,work.id,member_id,'v2-member@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('update public.website_documents set document=%L where website_work_id=%L',doc,work.id),'website_document_immutable');
  payload := payload||jsonb_build_object('revision',1,'status','review','history',jsonb_build_array(jsonb_build_object('revision',1,'kind','rebuilt','actorId',owner_id,'at','2026-10-01T12:01:00Z')));
  perform public.update_bounded_product_work(work.id,ws,owner_id,'v2-owner@example.test','websites',0,payload);
  perform pg_temp.assert_true((select s.payload->>'revision' from public.saved_product_work s where s.id=work.id)='1','existing bounded mutation accepts v2 websites');
  payload := payload||jsonb_build_object('version',1,'revision',2,'history',(payload->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','invalid','actorId',owner_id,'at','2026-10-01T12:02:00Z')));
  perform pg_temp.expect_error(format('select public.update_bounded_product_work(%L,%L,%L,%L,%L,1,%L)',work.id,ws,owner_id,'v2-owner@example.test','websites',payload),'bounded_payload_invalid');
  perform pg_temp.assert_true(jsonb_array_length(public.export_workspace_snapshot(ws,owner_id,'v2-owner@example.test')->'websiteDocuments')=3,'workspace export includes all immutable website revisions');
  perform pg_temp.assert_true(jsonb_array_length(public.export_workspace_snapshot(ws,owner_id,'v2-owner@example.test')->'websiteReceipts')=2,'workspace export includes actual immutable publication history');
  delete from public.workspace_memberships where workspace_id=ws and user_id=owner_id;
  perform pg_temp.expect_error(format('select public.read_website_documents(%L,%L,%L,%L,null,false)',ws,work.id,owner_id,'v2-owner@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,work.id,owner_id,'v2-owner@example.test'),'workspace_access_denied');
end $$;

-- Native recipient acceptance copies documents atomically and starts a fresh
-- owner review, never transplanting the agency's approvals or tenant grants.
do $$
declare agency_id uuid:='61000000-0000-4000-8000-000000000010'; source_id uuid:='61000000-0000-4000-8000-000000000011'; target_id uuid:='61000000-0000-4000-8000-000000000012'; accepted record; replay record; owner_id uuid:='61000000-0000-4000-8000-000000000001'; recipient uuid:='61000000-0000-4000-8000-000000000004'; doc jsonb:='{"version":2,"siteName":"Fictional prospect","nodes":{},"pages":[],"facts":{}}';
begin
 insert into public.workspaces(id,kind,name,created_by) values(agency_id,'agency','Fictional agency',owner_id),(target_id,'customer','Fictional recipient',recipient);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(agency_id,owner_id,'owner',owner_id),(target_id,recipient,'owner',recipient);
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(source_id,agency_id,'websites','website','Fictional prospect',jsonb_build_object('version',2,'revision',0,'title','Fictional prospect','status','approved','createdBy',owner_id,'createdAt','2026-10-01T12:00:00Z','history','[]'::jsonb,'approvedCandidateRevision',1,'tenantId',null,'launch',jsonb_build_object('receipt',null,'readBack',null),'candidate',jsonb_build_object('revision',1,'contentHash',repeat('b',64),'document',doc)),owner_id);
 perform public.append_website_document(agency_id,source_id,owner_id,'v2-owner@example.test',0,repeat('b',64),doc);
 perform public.approve_website_document(agency_id,source_id,owner_id,'v2-owner@example.test',1,repeat('b',64));
 perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',agency_id,source_id,owner_id,'v2-owner@example.test',repeat('b',64),'private-agency-prospect'),'workspace_access_denied');
 perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,1,%L,%L,%L)',agency_id,source_id,owner_id,'v2-owner@example.test',repeat('b',64),'v2-fictional','{}'::jsonb),'workspace_access_denied');
 perform pg_temp.assert_true(not exists(select 1 from public.tenants where id='private-agency-prospect'),'agency prospect remains private without tenant provision');
 insert into public.workspace_handoffs(agency_workspace_id,source_work_id,recipient_email,token_hash,expires_at,created_by) values(agency_id,source_id,'v2-other@example.test',repeat('61',32),now()+interval '1 hour',owner_id);
 select * into accepted from public.accept_workspace_handoff(repeat('61',32),recipient,'v2-other@example.test',target_id,null,true);
 perform pg_temp.assert_true((select count(*) from public.website_documents where website_work_id=accepted.customer_work_id)=1,'accepted website copies separate document revision');
 perform pg_temp.assert_true((select approved_revision is null from public.website_document_heads where website_work_id=accepted.customer_work_id),'received website has no agency approval');
 perform pg_temp.assert_true((select payload->'candidate'='null'::jsonb and payload->>'status'='building' and payload->>'createdBy'=recipient::text and payload->>'revision'='0' from public.saved_product_work where id=accepted.customer_work_id),'received website must initialize new owner review');
 select * into replay from public.accept_workspace_handoff(repeat('61',32),recipient,'v2-other@example.test',target_id,null,true);
 perform pg_temp.assert_true(replay.customer_work_id=accepted.customer_work_id and replay.already_accepted,'accepted retry reopens the same copied document');
 perform pg_temp.assert_true((select count(*) from public.website_documents where website_work_id=accepted.customer_work_id)=1,'accept replay does not duplicate immutable revisions');
 perform public.append_website_document(agency_id,source_id,owner_id,'v2-owner@example.test',1,repeat('d',64),doc||'{"capabilities":{"tenant":"private-other-tenant"}}'::jsonb);
 insert into public.workspace_handoffs(agency_workspace_id,source_work_id,recipient_email,token_hash,expires_at,created_by) values(agency_id,source_id,'v2-other@example.test',repeat('62',32),now()+interval '1 hour',owner_id);
 perform pg_temp.expect_error(format('select public.accept_workspace_handoff(%L,%L,%L,%L,null,true)',repeat('62',32),recipient,'v2-other@example.test',target_id),'handoff_product_unsupported');
 perform pg_temp.assert_true((select status from public.workspace_handoffs where token_hash=repeat('62',32))='pending','unsafe native capability handoff rolls back acceptance');
 perform pg_temp.assert_true((select count(*) from public.saved_product_work where workspace_id=target_id)=1,'unsafe capability handoff leaves no destination copy');
end $$;

do $$
declare actor uuid:='61000000-0000-4000-8000-000000000004'; ws uuid:='61000000-0000-4000-8000-000000000012'; work public.saved_product_work; initial jsonb; next_payload jsonb; doc jsonb:='{"version":2,"siteName":"Atomic fictional","nodes":{},"pages":[],"facts":{}}'; prepared record; page jsonb; removed record; i integer; html text;
begin
 insert into public.users(id,email) values('61000000-0000-4000-8000-000000000021','v2-unverified@example.test');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,'61000000-0000-4000-8000-000000000001','owner',actor),(ws,'61000000-0000-4000-8000-000000000005','admin',actor),(ws,'61000000-0000-4000-8000-000000000021','owner',actor);
 initial:=jsonb_build_object('version',2,'revision',0,'title','Atomic fictional','status','building','createdBy',actor,'createdAt','2026-10-01T12:00:00Z','history','[]'::jsonb);
 select * into work from public.claim_website_rebuild(ws,actor,'v2-other@example.test','v2-atomic-request','atomic.example.test','{}',initial);
 next_payload:=initial||jsonb_build_object('revision',1,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',1,'contentHash',repeat('a',64),'document',doc),'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','candidate','actorId',actor,'at','2026-10-01T12:01:00Z')));
 perform public.commit_website_document_candidate(ws,work.id,actor,'v2-other@example.test',0,0,repeat('a',64),doc,next_payload);
 perform pg_temp.assert_true((select revision from public.website_document_heads where website_work_id=work.id)=1,'candidate transaction writes document/head');
 -- A losing saved-work CAS must roll back the append, including its head.
 next_payload:=next_payload||jsonb_build_object('candidate',jsonb_build_object('revision',2,'contentHash',repeat('b',64),'document',doc));
 perform pg_temp.expect_error(format('select public.commit_website_document_candidate(%L,%L,%L,%L,1,0,%L,%L,%L)',ws,work.id,actor,'v2-other@example.test',repeat('b',64),doc,next_payload),'bounded_revision_conflict');
 perform pg_temp.assert_true((select revision from public.website_document_heads where website_work_id=work.id)=1 and (select count(*) from public.website_documents where website_work_id=work.id)=1,'failed candidate work CAS rolls back orphan document/head');
 -- Admin can approve a draft but cannot create/publish its live tenant.
 perform public.approve_website_document(ws,work.id,'61000000-0000-4000-8000-000000000005','v2-member@example.test',1,repeat('a',64));
 perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',ws,work.id,'61000000-0000-4000-8000-000000000005','v2-member@example.test',repeat('a',64),'admin-takeover'),'workspace_access_denied');
 perform public.approve_website_document(ws,work.id,actor,'v2-other@example.test',1,repeat('a',64));
 select * into prepared from public.reserve_website_hosted_tenant(ws,work.id,actor,'v2-other@example.test',1,repeat('a',64),'atomic-fictional');
 perform pg_temp.assert_true(prepared.tenant_id='atomic-fictional','reservation returns created tenant');
 perform pg_temp.assert_true(exists(select 1 from public.memberships where user_id=actor and tenant_id='atomic-fictional' and role='owner'),'reservation grants owner in same transaction');
 perform pg_temp.assert_true((select count(*) from public.memberships where tenant_id='atomic-fictional' and role='owner')=2,'all current verified workspace owners receive native ownership');
 perform pg_temp.assert_true(not exists(select 1 from public.memberships where tenant_id='atomic-fictional' and user_id in ('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000021')),'admins and unverified owners gain no native membership');
 -- Even preexisting native tenant ownership does not authorize a workspace admin.
 insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) select '61000000-0000-4000-8000-000000000005',id,stable_id,'owner' from public.tenants where id='atomic-fictional';
 perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,'61000000-0000-4000-8000-000000000005','v2-member@example.test',repeat('a',64),'atomic-fictional','{}'::jsonb),'workspace_access_denied');
 perform pg_temp.assert_true((select owner_email from public.tenants where id='atomic-fictional')='v2-other@example.test','tenant contact email belongs to the verified publishing owner');
 perform pg_temp.assert_true(exists(select 1 from public.offering_website_bindings b join public.tenants t on t.stable_id=b.tenant_stable_id where b.business_workspace_id=ws and t.id='atomic-fictional' and b.status='active'),'reservation binds hosted tenant to customer business');
 select * into prepared from public.reserve_website_hosted_tenant(ws,work.id,actor,'v2-other@example.test',1,repeat('a',64),'renamed-business-hint');
 perform pg_temp.assert_true(prepared.tenant_id='atomic-fictional','partial provisioning replay preserves the reserved tenant after a business name changes');
 perform pg_temp.assert_true((select count(*) from public.website_hosted_tenant_reservations where website_work_id=work.id)=1,'reservation replay preserves exact owner/tenant');
 delete from public.memberships where user_id=actor and tenant_id='atomic-fictional';
 perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',ws,work.id,actor,'v2-other@example.test',repeat('a',64),'atomic-fictional'),'website_tenant_access_denied');
 perform pg_temp.assert_true(not exists(select 1 from public.memberships where user_id=actor and tenant_id='atomic-fictional'),'reservation replay never restores revoked tenant ownership');
 perform public.reserve_website_hosted_tenant(ws,work.id,'61000000-0000-4000-8000-000000000001','v2-owner@example.test',1,repeat('a',64),'atomic-fictional');
 perform pg_temp.assert_true(not exists(select 1 from public.memberships where user_id=actor and tenant_id='atomic-fictional'),'another owner reservation replay never repairs revoked owner');
 perform public.manage_website_document(ws,work.id,actor,'v2-other@example.test');
 -- A deliberate undo can append the identical document as a newly reviewed
 -- revision, while ordinary unchanged candidates may reuse the current head.
 next_payload:=initial||jsonb_build_object('revision',2,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',2,'contentHash',repeat('a',64),'document',doc),'history',(select w.payload->'history' from public.saved_product_work w where w.id=work.id)||jsonb_build_array(jsonb_build_object('revision',2,'kind','undo','actorId',actor,'at','2026-10-01T12:02:00Z')));
 perform public.commit_website_document_candidate(ws,work.id,actor,'v2-other@example.test',1,1,repeat('a',64),doc,next_payload);
 perform pg_temp.assert_true((select revision=2 and approved_revision is null from public.website_document_heads where website_work_id=work.id),'force-review samehash append creates new revision/clears approval');
 for i in 1..25 loop
  html:='<p>Fictional source '||i||'</p>';
  page:=jsonb_build_object('url','https://atomic.example.test/'||i,'sourceId','https://atomic.example.test/'||i||'#sha256='||encode(sha256(convert_to(html,'UTF8')),'hex'),'html',html,'visibleText','Fictional source','title','Fictional','headings','[]'::jsonb,'links','[]'::jsonb,'assets','[]'::jsonb);
  perform public.retain_website_crawl_page(ws,work.id,actor,'v2-other@example.test',page);
  perform public.retain_website_crawl_page(ws,work.id,actor,'v2-other@example.test',page);
 end loop;
 perform pg_temp.assert_true((select count(*) from public.website_crawl_pages where website_work_id=work.id)=25,'crawl retention/retry stays bounded/idempotent');
 page:=page||jsonb_build_object('sourceId','https://atomic.example.test/new#sha256='||encode(sha256(convert_to(html,'UTF8')),'hex'),'url','https://atomic.example.test/new');
 perform pg_temp.expect_error(format('select public.retain_website_crawl_page(%L,%L,%L,%L,%L)',ws,work.id,actor,'v2-other@example.test',page),'website_crawl_limit_conflict');
 page:=page||jsonb_build_object('sourceId','https://atomic.example.test/new#sha256='||repeat('f',64));
 perform pg_temp.expect_error(format('select public.retain_website_crawl_page(%L,%L,%L,%L,%L)',ws,work.id,actor,'v2-other@example.test',page),'website_crawl_source_invalid');
 perform pg_temp.expect_error(format('update public.website_crawl_pages set page=%L where website_work_id=%L',page,work.id),'website_crawl_page_immutable');
 insert into public.website_crawl_pages(workspace_id,website_work_id,source_id,page,html_bytes,created_by,created_at,expires_at) values(ws,work.id,'expired-fixture',page,0,actor,now()-interval '31 days',now()-interval '1 day');
 select * into removed from public.prune_website_crawl_pages();
 perform pg_temp.assert_true(removed.removed=1 and (select count(*) from public.website_crawl_pages where website_work_id=work.id)=25,'pruning removes expired source HTML only');

end $$;

-- Description-built personal sites may launch without another onboarding step.
do $$
declare actor uuid:='61000000-0000-4000-8000-000000000004'; ws uuid:='61000000-0000-4000-8000-000000000030'; work public.saved_product_work; doc jsonb:='{"version":2,"siteName":"Personal fictional","nodes":{},"pages":[],"facts":{}}'; rec jsonb;
begin
 insert into public.workspaces(id,kind,name,created_by) values(ws,'personal','Personal fictional',actor);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'owner',actor);
 select * into work from public.claim_website_rebuild(ws,actor,'v2-other@example.test','v2-personal-request','personal.example.test','{}',jsonb_build_object('version',2,'revision',0,'title','Personal fictional','createdBy',actor,'status','building','history','[]'::jsonb));
 perform public.append_website_document(ws,work.id,actor,'v2-other@example.test',0,repeat('e',64),doc);
 perform public.approve_website_document(ws,work.id,actor,'v2-other@example.test',1,repeat('e',64));
 perform public.reserve_website_hosted_tenant(ws,work.id,actor,'v2-other@example.test',1,repeat('e',64),'personal-fictional');
 rec:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',repeat('e',64),'candidateRevision',1,'receiptId','personal-receipt','providerUrl','https://personal-fictional.strelva.com','evidence','Local personal fixture','publishedAt','2026-10-01T12:00:00Z');
 perform public.publish_website_document(ws,work.id,actor,'v2-other@example.test',1,repeat('e',64),'personal-fictional',rec);
 perform pg_temp.assert_true((select count(*) from public.read_published_website_documents('personal-fictional'))=1,'personal owner hosted launch remains supported');
 perform pg_temp.assert_true(not exists(select 1 from public.offering_website_bindings where business_workspace_id=ws),'personal launch does not invent customer capability binding');
end $$;
