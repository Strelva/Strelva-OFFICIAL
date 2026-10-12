-- AG2 fictional disposable fixture. No hosted or provider effect is exercised.
\set ON_ERROR_STOP on
begin;
create function pg_temp.page_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'agency native page: %',label; end if; end $$;
create function pg_temp.page_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end; raise exception 'expected %, statement succeeded',expected; end $$;
insert into public.users(id,email,verified_at) values
 ('7a210000-0000-4000-8000-000000000001','page-owner@example.test',now()),
 ('7a210000-0000-4000-8000-000000000002','page-agency@example.test',now()),
 ('7a210000-0000-4000-8000-000000000003','page-other@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('7a210000-0000-4000-8000-000000000011','customer','Page Bakery','7a210000-0000-4000-8000-000000000001'),
 ('7a210000-0000-4000-8000-000000000012','agency','Page Studio','7a210000-0000-4000-8000-000000000002'),
 ('7a210000-0000-4000-8000-000000000013','agency','Other Studio','7a210000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000001','owner','7a210000-0000-4000-8000-000000000001'),
 ('7a210000-0000-4000-8000-000000000012','7a210000-0000-4000-8000-000000000002','owner','7a210000-0000-4000-8000-000000000002'),
 ('7a210000-0000-4000-8000-000000000013','7a210000-0000-4000-8000-000000000003','owner','7a210000-0000-4000-8000-000000000003');
select public.choose_business_provider('7a210000-0000-4000-8000-000000000001','page-owner@example.test','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000012');
select public.set_agency_client_staff('7a210000-0000-4000-8000-000000000002','page-agency@example.test','7a210000-0000-4000-8000-000000000012','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000002',true);
insert into public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,level,status,consent,proposed_by,responded_by,responded_at)
 select '7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000012',scope,'prepare','active','Fictional accepted scope','7a210000-0000-4000-8000-000000000001','7a210000-0000-4000-8000-000000000002',now() from unnest(array['website','inquiries','bookings']) scope;
insert into public.tenants(id,site_name,stable_id,active) values('page-bakery','Page Bakery','7a210000-0000-4000-8000-000000000021',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('7a210000-0000-4000-8000-000000000021','page-bakery','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000001','7a210000-0000-4000-8000-000000000031',repeat('a',64),'{}');
create temporary table page_fixture(input jsonb,document jsonb,payload jsonb) on commit drop;
do $$
declare ws uuid:='7a210000-0000-4000-8000-000000000011'; actor uuid:='7a210000-0000-4000-8000-000000000002'; work_id uuid:='7a210000-0000-4000-8000-000000000041';
 doc jsonb:='{"version":2,"siteName":"Page Bakery","theme":{},"assets":{},"redirects":[],"pages":[{"path":"/","title":"Home","description":"Home","root":"root"}],"nodes":{"root":{"id":"root","type":"Section","variant":"container","props":{},"children":[],"factIds":[]}},"facts":{},"capabilities":{"baseUrl":"https://fictional.example.test","tenant":"page-bakery","inquiry":{"capabilityId":"intake","version":1}}}';
 base jsonb; next_doc jsonb; next_payload jsonb; input jsonb;
begin
 base:=jsonb_build_object('version',2,'revision',1,'title','Page Bakery','createdBy',actor,'createdAt','2026-10-12T12:00:00Z','status','published','history','[]'::jsonb,'checkpoint',null,'audit',null,'lastError',null,'approvedCandidateRevision',1,'candidate',jsonb_build_object('revision',1,'contentHash',repeat('a',64),'document',doc,'previewHref','/api/websites/'||work_id||'/preview'));
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(work_id,ws,'websites','website','Page Bakery',base,actor);
 insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(ws,work_id,1,repeat('a',64),doc,actor);
 insert into public.website_document_heads(workspace_id,website_work_id,revision) values(ws,work_id,1);
 insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt) values('page-bakery',ws,work_id,1,repeat('a',64),'{}');
 insert into public.inquiry_workspaces(tenant_id,tenant_stable_id,business_id,state) values('page-bakery','7a210000-0000-4000-8000-000000000021',ws::text,jsonb_build_object('inquiries','[]'::jsonb,'capabilities',jsonb_build_array(jsonb_build_object('id','intake','businessId',ws,'status','live','live',jsonb_build_object('id','intake','businessId',ws,'version',1)))));
 input:=jsonb_build_object('workspaceId',ws,'workId',work_id,'commandId','7a210000-0000-4000-8000-000000000051','kind','form','expectedRevision',1,'candidateRevision',1,'candidateContentHash',repeat('a',64),'path','/inquiry','title','Tell us more','description','Your inquiry');
 next_doc:=jsonb_set(doc,'{pages}',doc->'pages'||jsonb_build_array(jsonb_build_object('path','/inquiry','title','Tell us more','description','Your inquiry','root','newroot')));
 next_doc:=jsonb_set(next_doc,'{nodes}',doc->'nodes'||'{"newroot":{"id":"newroot","type":"Section","variant":"container","props":{},"children":["heading","form"],"factIds":["titleFact","bodyFact"]},"heading":{"id":"heading","type":"PageHeader","variant":"standard","props":{"title":"Tell us more","body":"Your inquiry"},"children":[],"factIds":["titleFact","bodyFact"]},"form":{"id":"form","type":"InquiryForm","variant":"inline","props":{"title":"Tell us more"},"children":[],"factIds":["titleFact"]}}'::jsonb);
 next_doc:=jsonb_set(next_doc,'{facts}','{"titleFact":{"text":"Tell us more","origin":"owner_stated","kind":"claim","highRisk":true,"sources":[],"verification":{"supported":false,"confidence":0}},"bodyFact":{"text":"Your inquiry","origin":"owner_stated","kind":"claim","highRisk":true,"sources":[],"verification":{"supported":false,"confidence":0}}}');
 base:=base||jsonb_build_object('agencyPageOrigin',jsonb_build_object('kind','agency','displayName','Page Studio','agencyId','7a210000-0000-4000-8000-000000000012','userId',actor));
 next_payload:=base||jsonb_build_object('revision',2,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',2,'contentHash',encode(sha256(convert_to(next_doc::text,'UTF8')),'hex'),'document',next_doc,'previewHref','/api/websites/'||work_id||'/preview'),'history',jsonb_build_array(jsonb_build_object('revision',2,'kind','agency_document_draft','actorId',actor,'at','2026-10-12T12:01:00Z')));
 insert into page_fixture values(input,next_doc,next_payload);
end $$;
-- A second native site has an already published booking service and a
-- fictional connected calendar. These inserts simulate qualified prerequisites;
-- no calendar provider is contacted and no visitor reservation is made.
insert into public.tenants(id,site_name,stable_id,active) values('page-booking','Page Bookings','7a210000-0000-4000-8000-000000000022',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('7a210000-0000-4000-8000-000000000022','page-booking','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000001','7a210000-0000-4000-8000-000000000032',repeat('c',64),'{}');
do $$
declare ws uuid:='7a210000-0000-4000-8000-000000000011'; actor uuid:='7a210000-0000-4000-8000-000000000002'; owner_id uuid:='7a210000-0000-4000-8000-000000000001';
 work_id uuid:='7a210000-0000-4000-8000-000000000042'; schedule_id uuid:='7a210000-0000-4000-8000-000000000043'; seed record; base jsonb; doc jsonb; next_doc jsonb; next_payload jsonb; input jsonb;
begin
 select * into seed from page_fixture;
 select payload into base from public.saved_product_work where id='7a210000-0000-4000-8000-000000000041';
 doc:=jsonb_set(base->'candidate'->'document','{capabilities,tenant}','"page-booking"');
 doc:=jsonb_set(doc,'{capabilities,booking}','{"capabilityId":"visits","version":1,"range":{"from":"2026-11-01T10:00:00Z","to":"2026-11-01T11:00:00Z"}}');
 base:=jsonb_set(base,'{candidate,document}',doc);
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(work_id,ws,'websites','website','Page Bookings',base,actor);
 insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(ws,work_id,1,repeat('a',64),doc,actor);
 insert into public.website_document_heads(workspace_id,website_work_id,revision) values(ws,work_id,1);
 insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt) values('page-booking',ws,work_id,1,repeat('a',64),'{}');
 insert into public.inquiry_workspaces(tenant_id,tenant_stable_id,business_id,state) values('page-booking','7a210000-0000-4000-8000-000000000022',ws::text,jsonb_build_object('inquiries','[]'::jsonb,'capabilities',jsonb_build_array(jsonb_build_object('id','intake','businessId',ws,'status','live','live',jsonb_build_object('id','intake','businessId',ws,'version',1)))));
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(schedule_id,ws,'scheduling','schedule','Fictional visits','{"version":1,"revision":0,"title":"Fictional visits","availability":[{"start":"2026-11-01T10:00:00Z","end":"2026-11-01T11:00:00Z"}],"reservations":[],"history":[]}',owner_id);
 insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by) values(ws,'google','fictional-calendar','Fictional calendar','America/New_York','connected',owner_id);
 insert into public.public_website_booking_grants(tenant_stable_id,business_workspace_id,work_id,capability_id,capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by)
  values('7a210000-0000-4000-8000-000000000022',ws,schedule_id,'visits',1,'intake',1,'google','Fictional visits','America/New_York',owner_id);
 next_doc:=jsonb_set(seed.document,'{capabilities}',doc->'capabilities'); next_doc:=jsonb_set(next_doc,'{nodes,form,type}','"Booking"');
 input:=seed.input||jsonb_build_object('workId',work_id,'commandId','7a210000-0000-4000-8000-000000000052','kind','booking');
 next_payload:=jsonb_set(seed.payload,'{candidate,document}',next_doc);
 next_payload:=jsonb_set(next_payload,'{candidate,contentHash}',to_jsonb(encode(sha256(convert_to(next_doc::text,'UTF8')),'hex')));
 next_payload:=jsonb_set(next_payload,'{candidate,previewHref}',to_jsonb('/api/websites/'||work_id||'/preview'));
 insert into page_fixture values(input,next_doc,next_payload);
end $$;
-- Exact grant mismatch and revocation must not silently choose another service.
savepoint booking_mismatch;
update public.public_website_booking_grants set inquiry_version=99 where tenant_stable_id='7a210000-0000-4000-8000-000000000022';
select pg_temp.page_expect($q$select public.read_agency_native_page_work('7a210000-0000-4000-8000-000000000012','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000002','page-agency@example.test','{"kind":"booking"}','7a210000-0000-4000-8000-000000000042')$q$,'agency_page_stale');
rollback to booking_mismatch;
savepoint booking_revoked;
update public.public_website_booking_grants set status='revoked',revoked_by='7a210000-0000-4000-8000-000000000001',revoked_at=now(),revocation_reason='Fictional revoked service' where tenant_stable_id='7a210000-0000-4000-8000-000000000022';
select pg_temp.page_expect($q$select public.read_agency_native_page_work('7a210000-0000-4000-8000-000000000012','7a210000-0000-4000-8000-000000000011','7a210000-0000-4000-8000-000000000002','page-agency@example.test','{"kind":"booking"}','7a210000-0000-4000-8000-000000000042')$q$,'agency_page_stale');
rollback to booking_revoked;
grant all on page_fixture to service_role;
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec
set local role service_role;
do $$
declare agency uuid:='7a210000-0000-4000-8000-000000000012'; ws uuid:='7a210000-0000-4000-8000-000000000011'; actor uuid:='7a210000-0000-4000-8000-000000000002'; fixture record; choices jsonb; receipt jsonb; replay jsonb;
begin
 select * into fixture from page_fixture where input->>'kind'='form';
 perform pg_temp.page_assert(not has_function_privilege('authenticated','public.submit_agency_native_page(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text)','EXECUTE'),'anonymous actor-bearing mutator unavailable');
 perform pg_temp.page_expect(format('select public.read_agency_native_page_choices(%L,%L,%L,%L)','7a210000-0000-4000-8000-000000000013',ws,actor,'page-agency@example.test'),'agency_page_scope_required');
 choices:=public.read_agency_native_page_choices(agency,ws,actor,'page-agency@example.test');
 perform pg_temp.page_assert(jsonb_array_length(choices->'choices')=2 and (choices->'choices'->0->>'inquiry')::boolean and not (choices->'choices'->0->>'booking')::boolean and (choices->'choices'->1->>'booking')::boolean,'only own qualified current form is offered');
 perform pg_temp.page_expect(format('select public.submit_agency_native_page(%L,%L,%L,%L,%L,%L,%L,%L,%L)',agency,ws,actor,'page-agency@example.test',fixture.input,jsonb_set(fixture.document,'{nodes,root,props}','{"body":"Unauthorised change"}'),fixture.payload,encode(sha256(convert_to(fixture.document::text,'UTF8')),'hex'),fixture.document::text),'agency_page_invalid');
 receipt:=public.submit_agency_native_page(agency,ws,actor,'page-agency@example.test',fixture.input,fixture.document,fixture.payload,encode(sha256(convert_to(fixture.document::text,'UTF8')),'hex'),fixture.document::text);
 replay:=public.submit_agency_native_page(agency,ws,actor,'page-agency@example.test',fixture.input,fixture.document,fixture.payload,encode(sha256(convert_to(fixture.document::text,'UTF8')),'hex'),fixture.document::text);
 perform pg_temp.page_assert(receipt=replay and receipt->>'candidateRevision'='2','exact retry returns durable receipt after changed website');
 perform pg_temp.page_expect(format('select public.read_agency_native_page_command(%L,%L,%L,%L,%L)',agency,ws,actor,'page-agency@example.test',fixture.input||'{"title":"Altered retry"}'::jsonb),'agency_page_conflict');
 select * into fixture from page_fixture where input->>'kind'='booking';
 receipt:=public.submit_agency_native_page(agency,ws,actor,'page-agency@example.test',fixture.input,fixture.document,fixture.payload,encode(sha256(convert_to(fixture.document::text,'UTF8')),'hex'),fixture.document::text);
 perform pg_temp.page_assert(receipt->>'candidateRevision'='2' and receipt->'actor'->>'displayName'='Page Studio','booking draft records named agency, not calendar write');
 perform public.set_agency_client_staff(actor,'page-agency@example.test',agency,ws,actor,false);
 perform pg_temp.page_expect(format('select public.read_agency_native_page_command(%L,%L,%L,%L,%L)',agency,ws,actor,'page-agency@example.test',fixture.input),'agency_page_scope_required');
end $$;
reset role;
select pg_temp.page_assert((select count(*)=2 from public.agency_native_page_commands),'one retained command receipt per page');
select pg_temp.page_assert((select count(*)=2 from public.website_documents where website_work_id='7a210000-0000-4000-8000-000000000041'),'one appended native document');
select pg_temp.page_assert((select payload->>'status'='review_ready' and payload->'approvedCandidateRevision'='null'::jsonb from public.saved_product_work where id='7a210000-0000-4000-8000-000000000041'),'owner review, no agency approval');
select pg_temp.page_assert((select revision=1 from public.website_document_publications where website_work_id='7a210000-0000-4000-8000-000000000041'),'live publication unchanged');
select pg_temp.page_assert(not exists(select 1 from public.workspace_memberships where workspace_id='7a210000-0000-4000-8000-000000000011' and user_id='7a210000-0000-4000-8000-000000000002'),'agency acquired no direct membership');
rollback;
