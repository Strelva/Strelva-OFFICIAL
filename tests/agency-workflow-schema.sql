\set ON_ERROR_STOP on
-- One complete job through actor-bearing service_role RPCs. The agency
-- never receives customer membership or super_admin status. Platform
-- verification records are fictional setup; public readback below records
-- a simulated local result, not evidence of a deployed or operated website.
begin;
create function pg_temp.aw_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency workflow: %', message; end if; end $$;
create function pg_temp.aw_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like '%' || expected || '%' then raise exception 'agency workflow expected %, got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'agency workflow expected %, statement succeeded: %', expected, statement;
end $$;
create temporary table aw_state(body jsonb not null) on commit drop;
grant all on aw_state to service_role;
select format('grant usage on schema %I to service_role', nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec

insert into public.users(id,email,verified_at) values
  ('af010000-0000-4000-8000-000000000001','aw-agency@a.example.test',now()),
  ('af010000-0000-4000-8000-000000000002','aw-owner@client.example.test',now()),
  ('af010000-0000-4000-8000-000000000003','aw-other@b.example.test',now()),
  ('af010000-0000-4000-8000-000000000004','aw-verifier@platform.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('af010000-0000-4000-8000-000000000010','agency','Workflow Agency A','af010000-0000-4000-8000-000000000001'),
  ('af010000-0000-4000-8000-000000000011','agency','Workflow Agency B','af010000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('af010000-0000-4000-8000-000000000010','af010000-0000-4000-8000-000000000001','owner','af010000-0000-4000-8000-000000000001'),
  ('af010000-0000-4000-8000-000000000011','af010000-0000-4000-8000-000000000003','owner','af010000-0000-4000-8000-000000000003');

set local role service_role;
do $$
declare
  actor uuid:='af010000-0000-4000-8000-000000000001'; owner_id uuid:='af010000-0000-4000-8000-000000000002';
  other_id uuid:='af010000-0000-4000-8000-000000000003'; agency uuid:='af010000-0000-4000-8000-000000000010';
  command_id uuid:='af010000-0000-4000-8000-000000000020'; ws uuid; work record; replay record;
  added jsonb; claim jsonb; item jsonb; result jsonb; next_payload jsonb; recipient jsonb; system_id uuid;
  doc jsonb:='{"version":2,"siteName":"Workflow Bakery","theme":{},"assets":{},"redirects":[],"pages":[],"nodes":{},"facts":{}}';
  h text:=repeat('a',64); h2 text:=repeat('b',64); decision_hash text:=repeat('c',64); rev bigint;
begin
  perform pg_temp.aw_assert(current_user='service_role','commands actually execute as service_role');
  added:=public.agency_add_client(actor,'aw-agency@a.example.test',agency,
    '{"name":"Workflow Bakery","sourceUrl":"https://workflow-bakery.example.test"}',command_id,repeat('1',64));
  ws:=(added->>'customerWorkspaceId')::uuid;
  result:=public.agency_add_client(actor,'aw-agency@a.example.test',agency,
    '{"name":"Workflow Bakery","sourceUrl":"https://workflow-bakery.example.test"}',command_id,repeat('1',64));
  perform pg_temp.aw_assert(result->>'customerWorkspaceId'=ws::text and (result->>'replayed')::boolean,'add replay returns same business');
  perform pg_temp.aw_assert(public.read_business_record(ws,actor,'aw-agency@a.example.test')->>'access'='admin','ordinary staffed provider seat reaches business');
  perform pg_temp.aw_expect(format('select public.read_business_record(%L,%L,%L)',ws,other_id,'aw-other@b.example.test'),'business_record_access_denied');

  select * into work from public.claim_website_rebuild(ws,actor,'aw-agency@a.example.test','aw-request-one','workflow-bakery.example.test',
    '{"url":"https://workflow-bakery.example.test"}',jsonb_build_object('version',2,'revision',0,'title','Workflow Bakery','status','building',
    'createdBy',actor,'createdAt','2026-10-07T12:00:00Z','history','[]'::jsonb));
  select * into replay from public.claim_website_rebuild(ws,actor,'aw-agency@a.example.test','aw-request-one','workflow-bakery.example.test',
    '{"url":"https://workflow-bakery.example.test"}',work.payload);
  perform pg_temp.aw_assert(replay.id=work.id,'rebuild replay returns same saved work');
  next_payload:=work.payload||jsonb_build_object('revision',1,'status','review_ready','approvedCandidateRevision',null,
    'candidate',jsonb_build_object('revision',1,'contentHash',h,'document',doc),
    'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','candidate','actorId',actor,'at','2026-10-07T12:01:00Z')));
  select * into work from public.commit_website_document_candidate(ws,work.id,actor,'aw-agency@a.example.test',0,0,h,doc,next_payload);
  perform pg_temp.aw_assert(work.payload->'candidate'->'document'=doc,'seat-only candidate and saved-work CAS commit together');
  perform pg_temp.aw_assert((select count(*) from public.read_website_documents(ws,work.id,actor,'aw-agency@a.example.test'))=1,'agency reads its draft');
  perform pg_temp.aw_expect(format('select public.read_website_documents(%L,%L,%L,%L)',ws,work.id,other_id,'aw-other@b.example.test'),'workspace_access_denied');
  perform pg_temp.aw_expect(format('select public.commit_website_document_candidate(%L,%L,%L,%L,0,0,%L,%L,%L)',ws,work.id,actor,'aw-agency@a.example.test',h,doc,next_payload),'website_revision_conflict');

  -- Ownership remains a separate verified-account claim; issuance explicitly
  -- records R08's not-sent boundary. No live invitation or email is sent.
  perform pg_temp.aw_assert(public.resolve_business_owner_recipient(ws) is null,'agency cannot manufacture a trusted recipient');
  claim:=public.issue_agency_client_owner_claim(actor,'aw-agency@a.example.test',agency,ws,'aw-owner@client.example.test',repeat('d',64),now()+interval '14 days');
  perform pg_temp.aw_assert(claim->'delivery'->>'status'='not_sent','owner claim email remains gated');
  perform pg_temp.aw_expect(format('select public.accept_agency_client_owner_claim(%L,%L,%L)',repeat('d',64),actor,'aw-agency@a.example.test'),'agency_client_claim_recipient_mismatch');
  result:=public.accept_agency_client_owner_claim(repeat('d',64),owner_id,'aw-owner@client.example.test');
  perform pg_temp.aw_assert(result->>'status'='accepted','verified owner takes ownership');
  perform pg_temp.aw_assert((public.accept_agency_client_owner_claim(repeat('d',64),owner_id,'aw-owner@client.example.test')->>'alreadyAccepted')::boolean,'claim replay changes no ownership');
  -- The owner may explicitly name the address that receives decisions.
  rev:=(public.read_business_record(ws,owner_id,'aw-owner@client.example.test')->>'revision')::bigint;
  perform public.patch_business_record(ws,owner_id,'aw-owner@client.example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"aw-owner@client.example.test"}}}}',gen_random_uuid(),repeat('2',64));
  recipient:=public.resolve_business_owner_recipient(ws);
  perform pg_temp.aw_assert(recipient->>'email'='aw-owner@client.example.test' and (recipient->>'trusted')::boolean,'owner write establishes trusted address');

  item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Approve the exact preview',
    'approveEffect','Records this preview approval.','notYetEffect','Nothing publishes.','sourceLifecycle','website_document',
    'sourceId',work.id::text||':approve','revisionHash',decision_hash,'adminMayDecide',false));
  perform pg_temp.aw_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)',ws,item->>'id',decision_hash,'approve','session',actor,'aw-agency@a.example.test'),'owner_decision_permission_denied');
  result:=public.claim_owner_decision(ws,(item->>'id')::uuid,decision_hash,'approve','session',owner_id,'aw-owner@client.example.test',null);
  perform pg_temp.aw_assert(result->>'status'='claimed','owner claims exact approval decision');
  perform public.approve_website_document(ws,work.id,owner_id,'aw-owner@client.example.test',1,h);
  perform public.finish_owner_decision(ws,(item->>'id')::uuid,'done',null,'website_document:'||work.id::text||':approved:1');

  -- Replacing an approved preview clears its approval. The old decision and
  -- hash cannot launch the newly changed document.
  doc:=doc||'{"siteName":"Workflow Bakery approved revision"}';
  next_payload:=work.payload||jsonb_build_object('revision',2,'approvedCandidateRevision',null,
    'candidate',jsonb_build_object('revision',2,'contentHash',h2,'document',doc),
    'history',(work.payload->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','candidate','actorId',actor,'at','2026-10-07T12:02:00Z')));
  select * into work from public.commit_website_document_candidate(ws,work.id,actor,'aw-agency@a.example.test',1,1,h2,doc,next_payload);
  perform pg_temp.aw_expect(format('select public.approve_website_document(%L,%L,%L,%L,1,%L)',ws,work.id,owner_id,'aw-owner@client.example.test',h),'website_revision_conflict');
  perform public.approve_website_document(ws,work.id,owner_id,'aw-owner@client.example.test',2,h2);
  system_id:=public.system_origin_id(ws,'saved_work',work.id::text);
  perform pg_temp.aw_expect(format('select public.assert_acting_provider(%L,%L,%L,%L,%L,%L)',ws,actor,'aw-agency@a.example.test','publish','website',system_id),'unverified');
  insert into aw_state values(jsonb_build_object('workspaceId',ws,'workId',work.id,'systemId',system_id,'contentHash',h2,'document',doc));
end $$;
reset role;

-- Readiness is a platform verification fixture, never an agency privilege.
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
  values('af010000-0000-4000-8000-000000000010','publish','verified','{"fixture":"local only"}',
    'af010000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from aw_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  actor uuid:='af010000-0000-4000-8000-000000000001'; owner_id uuid:='af010000-0000-4000-8000-000000000002';
  agency uuid:='af010000-0000-4000-8000-000000000010'; mandate jsonb; tenant text;
begin
  perform pg_temp.aw_expect(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,2,%L,%L)',ws,wid,actor,'aw-agency@a.example.test',s->>'contentHash','aw-bakery'),'no_mandate');
  mandate:=public.grant_client_resource_mandate(owner_id,'aw-owner@client.example.test',ws,agency,'publish','website',s->>'systemId');
  perform pg_temp.aw_assert((public.grant_client_resource_mandate(owner_id,'aw-owner@client.example.test',ws,agency,'publish','website',s->>'systemId')->>'replayed')::boolean,'mandate replay preserves authority record');
  select tenant_id into tenant from public.reserve_website_hosted_tenant(ws,wid,actor,'aw-agency@a.example.test',2,s->>'contentHash','aw-bakery');
  perform pg_temp.aw_assert(tenant='aw-bakery','ordinary agency reserves on owner approval');
  perform public.end_client_resource_mandate(owner_id,'aw-owner@client.example.test',ws,(mandate->>'id')::uuid,'Owner withdrew permission before publish');
  perform pg_temp.aw_expect(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',ws,wid,actor,'aw-agency@a.example.test',s->>'contentHash',tenant,'{}'),'no_mandate');
  perform public.grant_client_resource_mandate(owner_id,'aw-owner@client.example.test',ws,agency,'publish','website',s->>'systemId');
  perform public.set_agency_client_staff(actor,'aw-agency@a.example.test',agency,ws,actor,false);
  perform pg_temp.aw_expect(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',ws,wid,actor,'aw-agency@a.example.test',s->>'contentHash',tenant,'{}'),'workspace_access_denied');
  perform public.set_agency_client_staff(actor,'aw-agency@a.example.test',agency,ws,actor,true);
end $$;
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
  values('af010000-0000-4000-8000-000000000010','publish','unverified','Fixture revocation before publish',
    'af010000-0000-4000-8000-000000000004',false);
set local role service_role;
select pg_temp.aw_expect(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',body->>'workspaceId',body->>'workId',
  'af010000-0000-4000-8000-000000000001','aw-agency@a.example.test',body->>'contentHash','aw-bakery','{}'),'unverified') from aw_state;
reset role;
select pg_temp.aw_assert(not exists(select 1 from public.website_document_publications) and not exists(select 1 from public.website_document_receipts),'all refused publishes leave no publication or receipt');
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
  values('af010000-0000-4000-8000-000000000010','publish','verified','{"fixture":"restored local verification"}',
    'af010000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from aw_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  actor uuid:='af010000-0000-4000-8000-000000000001'; owner_id uuid:='af010000-0000-4000-8000-000000000002';
  receipt jsonb:=jsonb_build_object('status','published','provider','strelva-hosted','candidateRevision',2,'artifactHash',s->>'contentHash',
    'readBack','confirmed','readBackEvidence','simulated local fixture','url','https://aw-bakery.example.test','undo','Republish the previous approved revision');
  result jsonb; receipts bigint;
begin
  perform pg_temp.aw_expect(format('select public.publish_website_document(%L,%L,%L,%L,1,%L,%L,%L)',ws,wid,actor,'aw-agency@a.example.test',repeat('a',64),'aw-bakery',receipt),'website_approval_required');
  perform pg_temp.aw_expect(format('select public.publish_website_document(%L,%L,%L,%L,2,%L,%L,%L)',ws,wid,'af010000-0000-4000-8000-000000000003','aw-other@b.example.test',s->>'contentHash','aw-bakery',receipt),'workspace_access_denied');
  result:=public.publish_website_document(ws,wid,actor,'aw-agency@a.example.test',2,s->>'contentHash','aw-bakery',receipt);
  perform pg_temp.aw_assert(result->'document'=s->'document' and result->'receipt'=receipt,'publish returns exact approved document and receipt');
  perform public.record_website_document_health(ws,wid,2,s->>'contentHash',clock_timestamp(),'healthy',s->>'contentHash');
  select count(*) into receipts from public.read_website_document_receipts(ws,wid,actor,'aw-agency@a.example.test');
  perform pg_temp.aw_assert(receipts=1 and (select r.receipt from public.read_website_document_receipts(ws,wid,owner_id,'aw-owner@client.example.test') r)=receipt,'agency and owner read authorized receipt');
  perform public.publish_website_document(ws,wid,actor,'aw-agency@a.example.test',2,s->>'contentHash','aw-bakery',receipt);
  perform pg_temp.aw_assert((select count(*) from public.read_website_document_receipts(ws,wid,actor,'aw-agency@a.example.test'))=receipts,'publish replay writes no second receipt');
  perform pg_temp.aw_expect(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,wid,'af010000-0000-4000-8000-000000000003','aw-other@b.example.test'),'workspace_access_denied');
  perform public.end_provider_seat(owner_id,'aw-owner@client.example.test',ws,'af010000-0000-4000-8000-000000000010','Owner ended agency service');
  perform pg_temp.aw_expect(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,wid,actor,'aw-agency@a.example.test'),'workspace_access_denied');
  perform pg_temp.aw_assert((select count(*) from public.read_website_document_receipts(ws,wid,owner_id,'aw-owner@client.example.test'))=receipts,'owner keeps receipt when agency seat ends');
end $$;
reset role;

select pg_temp.aw_assert(not exists(select 1 from public.super_admins),'no platform operator powers used by any workflow actor');
select pg_temp.aw_assert(not exists(select 1 from public.workspace_memberships where workspace_id=(select (body->>'workspaceId')::uuid from aw_state)
  and user_id in ('af010000-0000-4000-8000-000000000001','af010000-0000-4000-8000-000000000003')),'agencies never become business members');
select pg_temp.aw_assert(not exists(select 1 from public.memberships where user_id='af010000-0000-4000-8000-000000000001'),'agency never becomes native tenant owner');
select pg_temp.aw_assert((select approved_by='af010000-0000-4000-8000-000000000002' from public.website_document_heads),'publishing preserves owner approver');
select pg_temp.aw_assert((select count(*) from public.website_documents)=2 and (select count(*) from public.website_document_receipts)=1
  and (select count(*) from public.website_document_health where status='healthy')=1,'draft history, publish receipt and local readback retained');
select pg_temp.aw_assert((select additions from public.agency_client_add_quota)=1 and (select count(*) from public.agency_client_additions)=1,'replay consumes no extra client quota');
select pg_temp.aw_expect('delete from public.website_document_receipts','website_document_immutable');
select pg_temp.aw_expect('update public.website_documents set document=''{}''','website_document_immutable');
rollback;
\echo 'Agency workflow contract passed (isolated SQL; simulated readback, no deployment or email).'
