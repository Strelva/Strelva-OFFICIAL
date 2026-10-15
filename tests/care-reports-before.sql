-- Fictional rows for the Care plan reports fixture. Everything is dated this month.
\set ON_ERROR_STOP on
insert into public.users(id,email,verified_at) values
 ('c0100000-0000-4000-8000-000000000001','cr-owner@example.test',now()),
 ('c0100000-0000-4000-8000-000000000002','cr-staff@example.test',now()),
 ('c0100000-0000-4000-8000-000000000003','cr-other-owner@example.test',now()),
 ('c0100000-0000-4000-8000-000000000004','cr-client-owner@example.test',now()),
 ('c0100000-0000-4000-8000-000000000005','cr-stranger@example.test',now()),
 ('c0100000-0000-4000-8000-000000000006','cr-ended-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('c0100000-0000-4000-8000-000000000010','customer','Harbor Dental','c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-000000000011','customer','Ended Client','c0100000-0000-4000-8000-000000000006'),
 ('c0100000-0000-4000-8000-000000000020','agency','North Studio','c0100000-0000-4000-8000-000000000001'),
 ('c0100000-0000-4000-8000-000000000030','agency','Other Studio','c0100000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-000000000004','owner','c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-000000000011','c0100000-0000-4000-8000-000000000006','owner','c0100000-0000-4000-8000-000000000006'),
 ('c0100000-0000-4000-8000-000000000020','c0100000-0000-4000-8000-000000000001','owner','c0100000-0000-4000-8000-000000000001'),
 ('c0100000-0000-4000-8000-000000000020','c0100000-0000-4000-8000-000000000002','member','c0100000-0000-4000-8000-000000000001'),
 ('c0100000-0000-4000-8000-000000000030','c0100000-0000-4000-8000-000000000003','owner','c0100000-0000-4000-8000-000000000003');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-000000000020','owner','c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-000000000011','c0100000-0000-4000-8000-000000000020','owner','c0100000-0000-4000-8000-000000000006');
update public.provider_seats set status='ended',ended_by='c0100000-0000-4000-8000-000000000001',ended_at=now(),end_reason='fixture'
 where customer_workspace_id='c0100000-0000-4000-8000-000000000011';
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('c0100000-0000-4000-8000-000000000020','c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-000000000002','c0100000-0000-4000-8000-000000000001');

-- A website System with an initial baseline and four Releases.
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010','Harbor Dental website','website',
  'c0100000-0000-4000-8000-0000000000f0',repeat('a',64),'c0100000-0000-4000-8000-000000000004','c0100000-0000-4000-8000-000000000004');
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,
    provider_acceptance,accepted_by,accepted_at,created_by,delivery_commitment) values
 ('c0100000-0000-4000-8000-0000000000a1','c0100000-0000-4000-8000-000000000010','requested','Change the opening hours','Hours are right',
  '{"source":"website_change"}',array['website.repo_change'],'agency','c0100000-0000-4000-8000-000000000020',
  'accepted','c0100000-0000-4000-8000-000000000001',now(),'c0100000-0000-4000-8000-000000000004',null),
 ('c0100000-0000-4000-8000-0000000000a2','c0100000-0000-4000-8000-000000000010','requested','Write the spring newsletter','A newsletter',
  '{}',array['content.write'],'agency','c0100000-0000-4000-8000-000000000020',
  'accepted','c0100000-0000-4000-8000-000000000001',now(),'c0100000-0000-4000-8000-000000000004',
  jsonb_build_object('version','1','status','accepted','customerAcceptedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
 ('c0100000-0000-4000-8000-0000000000a3','c0100000-0000-4000-8000-000000000010','requested','Add a booking link','A link',
  '{}',array['website.repo_change'],'agency','c0100000-0000-4000-8000-000000000020',
  'accepted','c0100000-0000-4000-8000-000000000001',now(),'c0100000-0000-4000-8000-000000000004',null);
insert into public.website_change_receipts(id,workspace_id,request_id,system_id,kind,commit_sha,deployment_url,read_back,recorded_by) values
 ('c0100000-0000-4000-8000-0000000000b1','c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-0000000000a1','c0100000-0000-4000-8000-0000000000e1',
  'deployed','abcdef1','https://harbor.example.test/','confirmed','c0100000-0000-4000-8000-000000000004');
insert into public.website_code_releases(id,workspace_id,system_id,tenant_stable_id,request_key,commit_sha,deployment_url,read_back,summary,reported_by) values
 ('c0100000-0000-4000-8000-0000000000b2','c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-0000000000e1',
  'c0100000-0000-4000-8000-0000000000a0','c0100000-0000-4000-8000-0000000000a9','abcdef2','https://harbor.example.test/','confirmed','Code Release','c0100000-0000-4000-8000-000000000004');
insert into public.system_revisions(system_id,business_workspace_id,number,implementation,summary,command_id,command_digest,created_by) values
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010',1,'{"kind":"website","ref":"harbor@initial"}','Adopted website implementation.',
  gen_random_uuid(),repeat('b',64),'c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010',2,
  '{"kind":"website","ref":"deploy:c0100000-0000-4000-8000-0000000000b1@abcdef1"}','Opening hours changed.',gen_random_uuid(),repeat('b',64),'c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010',3,
  '{"kind":"website_document","ref":"c0100000-0000-4000-8000-0000000000d1@1"}','Home page rebuilt.',gen_random_uuid(),repeat('b',64),'c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010',4,
  '{"kind":"website","ref":"content:menu"}','Menu text updated.',gen_random_uuid(),repeat('b',64),'c0100000-0000-4000-8000-000000000004'),
 ('c0100000-0000-4000-8000-0000000000e1','c0100000-0000-4000-8000-000000000010',5,
  '{"kind":"website","ref":"code:c0100000-0000-4000-8000-0000000000b2@abcdef2"}','Code Release',gen_random_uuid(),repeat('b',64),'c0100000-0000-4000-8000-000000000004');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('c0100000-0000-4000-8000-0000000000d1','c0100000-0000-4000-8000-000000000010','websites','website_rebuild','Harbor home','{}','c0100000-0000-4000-8000-000000000004');
insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values
 ('c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-0000000000d1',1,repeat('a',64),'{"version":2}','c0100000-0000-4000-8000-000000000004');
insert into public.website_document_health(workspace_id,website_work_id,revision,content_hash,checked_at,status) values
 ('c0100000-0000-4000-8000-000000000010','c0100000-0000-4000-8000-0000000000d1',1,repeat('a',64),clock_timestamp(),'healthy');

-- Two assistant runs this month.
select public.record_model_calls(jsonb_build_array(
 jsonb_build_object('calledAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'purpose','ask','actorKind','owner','modelLabel','google/gemini-2.5-flash','attempt',1,'step',1,
  'inputTokens',100,'outputTokens',20,'latencyMs',500,'outcome','ok','costUsd','0.00010000','costSource','estimate','priceTableVersion','2026-10-06','workspaceId','c0100000-0000-4000-8000-000000000010'),
 jsonb_build_object('calledAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'purpose','report','actorKind','strelva','modelLabel','google/gemini-2.5-flash','attempt',1,'step',1,
  'inputTokens',100,'outputTokens',20,'latencyMs',500,'outcome','ok','costUsd','0.00010000','costSource','estimate','priceTableVersion','2026-10-06','workspaceId','c0100000-0000-4000-8000-000000000010')));
