\set ON_ERROR_STOP on
-- Final 181310 policy: a provider seat alone is never anonymous execution
-- identity, even for an independently trusted no-account recipient. A current
-- verified owner remains the execution identity; provider assignment, effect
-- verification and the exact publication mandate are rechecked natively.
begin;
create function pg_temp.olr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner link refusal: %',message; end if; end $$;
create function pg_temp.olr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like '%'||expected||'%' then raise exception 'owner link seat expected %, got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'owner link seat expected %, command succeeded',expected;
end $$;
create temporary table olr_state(body jsonb not null) on commit drop;
grant all on olr_state to service_role;
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec

insert into public.users(id,email,verified_at) values
 ('af080000-0000-4000-8000-000000000001','aw-seat@agency.example.test',now()),
 ('af080000-0000-4000-8000-000000000002','aw-account@owner.example.test',now()),
 ('af080000-0000-4000-8000-000000000003','aw-seat-other@agency.example.test',now()),
 ('af080000-0000-4000-8000-000000000004','aw-seat-verifier@platform.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('af080000-0000-4000-8000-000000000010','agency','Owner Link Serving Agency','af080000-0000-4000-8000-000000000001'),
 ('af080000-0000-4000-8000-000000000011','agency','Owner Link Other Agency','af080000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('af080000-0000-4000-8000-000000000010','af080000-0000-4000-8000-000000000001','owner','af080000-0000-4000-8000-000000000001'),
 ('af080000-0000-4000-8000-000000000011','af080000-0000-4000-8000-000000000003','owner','af080000-0000-4000-8000-000000000003');
set local role service_role;
do $$
declare actor uuid:='af080000-0000-4000-8000-000000000001'; owner_id uuid:='af080000-0000-4000-8000-000000000002';
 agency uuid:='af080000-0000-4000-8000-000000000010'; ws uuid; added jsonb; work record; item jsonb; rev bigint;
 h text:=repeat('e',64); decision_hash text:=repeat('f',64); payload jsonb;
 doc jsonb:='{"version":2,"siteName":"Trusted owner link","nodes":{},"pages":[],"facts":{}}';
begin
 added:=public.agency_add_client(actor,'aw-seat@agency.example.test',agency,'{"name":"Trusted owner link"}',gen_random_uuid(),repeat('4',64));
 ws:=(added->>'customerWorkspaceId')::uuid;
 select * into work from public.claim_website_rebuild(ws,actor,'aw-seat@agency.example.test','olr-request-one','ols-business.example.test','{"businessName":"Trusted owner link"}',
  jsonb_build_object('version',2,'revision',0,'title','Trusted owner link','status','building','createdBy',actor,'createdAt','2026-10-07T12:00:00Z','history','[]'::jsonb));
 payload:=work.payload||jsonb_build_object('revision',1,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',1,'contentHash',h,'document',doc),
  'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','candidate','actorId',actor,'at','2026-10-07T12:01:00Z')));
 select * into work from public.commit_website_document_candidate(ws,work.id,actor,'aw-seat@agency.example.test',0,0,h,doc,payload);
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Approve trusted preview',
  'approveEffect','Records this exact approval.','notYetEffect','Nothing publishes.','sourceLifecycle','website_document','sourceId',work.id::text||':approve','revisionHash',decision_hash,'adminMayDecide',false));
 perform pg_temp.olr_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,item->>'id',decision_hash,'aw-noaccount@owner.example.test'),'owner_decision_recipient_not_owner');
 perform public.issue_agency_client_owner_claim(actor,'aw-seat@agency.example.test',agency,ws,'aw-account@owner.example.test',repeat('5',64),now()+interval '14 days');
 perform public.accept_agency_client_owner_claim(repeat('5',64),owner_id,'aw-account@owner.example.test');
 rev:=(public.read_business_record(ws,owner_id,'aw-account@owner.example.test')->>'revision')::bigint;
 perform public.patch_business_record(ws,owner_id,'aw-account@owner.example.test','owner',rev,
  '{"facts":{"owner_recipient":{"value":{"email":"aw-noaccount@owner.example.test"}}}}',gen_random_uuid(),repeat('6',64));
 perform public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',work.id::text)::text);
 perform pg_temp.olr_assert((public.resolve_business_owner_recipient(ws)->>'trusted')::boolean,'verified owner independently established recipient trust');
 -- Simulated link issuance binds this decision to the already trusted address;
 -- the test never calls an email provider or authorizes a live send.
 perform public.record_owner_decision_delivery(ws,(item->>'id')::uuid,'urgent','sent','aw-noaccount@owner.example.test',null,'Simulated issued link; no email');
 insert into olr_state values(jsonb_build_object('workspaceId',ws,'workId',work.id,'decisionId',item->>'id','hash',h,'decisionHash',decision_hash));
end $$;
reset role;
-- Fictional setup: the trusted owner keeps their established consent but has
-- no current member identity. No agency is ever added to the business.
delete from public.workspace_memberships where workspace_id=(select (body->>'workspaceId')::uuid from olr_state)
 and user_id='af080000-0000-4000-8000-000000000002';

update olr_state set body=body||jsonb_build_object(
 'sessionsBefore',(select count(*) from public.owner_decision_link_sessions where workspace_id=(body->>'workspaceId')::uuid),
 'actionsBefore',(select count(*) from public.strelva_service_actions where workspace_id=(body->>'workspaceId')::uuid),
 'receiptsBefore',(select count(*) from public.website_document_receipts where workspace_id=(body->>'workspaceId')::uuid),
 'providerAssignmentId',(select id from public.workspace_providers where customer_workspace_id=(body->>'workspaceId')::uuid and status='active'));
set local role service_role;
do $$
declare s jsonb:=(select body from olr_state); link jsonb;
begin
 link:=public.strelva_owner_decision_link_session((s->>'workspaceId')::uuid,(s->>'decisionId')::uuid,s->>'decisionHash','aw-noaccount@owner.example.test');
 perform pg_temp.olr_assert(link is null,'trusted recipient plus ordinary staffed seat has no anonymous execution identity');
end $$;
reset role;
-- Catalog/private evidence checks remain privileged; native admissions above
-- and below execute as service_role without any new public-table grants.
do $$
declare s jsonb:=(select body from olr_state); ws uuid:=(s->>'workspaceId')::uuid;
begin
 perform pg_temp.olr_assert((select state='open' and outcome is null from public.owner_decisions where id=(s->>'decisionId')::uuid),'refusal keeps exact decision open');
 perform pg_temp.olr_assert((select count(*) from public.owner_decision_link_sessions where workspace_id=ws)=(s->>'sessionsBefore')::bigint
  and (select count(*) from public.strelva_service_actions where workspace_id=ws)=(s->>'actionsBefore')::bigint
  and (select count(*) from public.website_document_receipts where workspace_id=ws)=(s->>'receiptsBefore')::bigint,
  'seat-only refusal creates no session, service action or publication receipt');
 perform pg_temp.olr_assert((select approved_revision is null from public.website_document_heads where website_work_id=(s->>'workId')::uuid),'seat-only refusal leaves candidate unapproved');
end $$;
-- Real owner identity is restored by fictional fixture setup, not manufactured
-- by the admission RPC. The separate trusted recipient still has no account.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select (body->>'workspaceId')::uuid,'af080000-0000-4000-8000-000000000002','owner','af080000-0000-4000-8000-000000000002' from olr_state;
set local role service_role;
do $$
declare s jsonb:=(select body from olr_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  owner_id uuid:='af080000-0000-4000-8000-000000000002'; agency uuid:='af080000-0000-4000-8000-000000000010';
  link jsonb; sid uuid; item jsonb; assignment uuid;
begin
  link:=public.strelva_owner_decision_link_session(ws,(s->>'decisionId')::uuid,s->>'decisionHash','aw-noaccount@owner.example.test');
  perform pg_temp.olr_assert(link->>'userId'=owner_id::text and link->>'role'='owner'
    and link->>'verifiedEmail'='aw-account@owner.example.test' and link->>'providerWorkspaceId'=agency::text,
    'current verified owner is the execution identity; provider is separately attributed');
  sid:=(link->>'sessionId')::uuid;
  assignment:=(s->>'providerAssignmentId')::uuid;
  perform public.claim_owner_decision(ws,(s->>'decisionId')::uuid,s->>'decisionHash','approve','owner_link',null,null,'aw-noaccount@owner.example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,(s->>'decisionId')::uuid,s->>'decisionHash','aw-noaccount@owner.example.test');
  perform public.approve_website_document(ws,wid,owner_id,'aw-account@owner.example.test',1,s->>'hash');
  perform public.finish_owner_decision(ws,(s->>'decisionId')::uuid,'done',null,'website_document:'||wid::text||':approved:1');
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Launch exact trusted preview',
    'approveEffect','Publishes this approved candidate.','notYetEffect','Nothing publishes.','sourceLifecycle','website_document','sourceId',wid::text||':launch','revisionHash',repeat('7',64),'adminMayDecide',false));
  perform public.record_owner_decision_delivery(ws,(item->>'id')::uuid,'urgent','sent','aw-noaccount@owner.example.test',null,'Simulated local issuance; no email');
  perform pg_temp.olr_assert(public.strelva_owner_decision_link_session(ws,(item->>'id')::uuid,repeat('7',64),'aw-noaccount@owner.example.test') is null,'internal approval does not substitute publish verification');
  update olr_state set body=body||jsonb_build_object('launchId',item->>'id','providerAssignmentId',assignment,'approvalSessionId',sid);
end $$;
reset role;
do $$
declare s jsonb:=(select body from olr_state);
begin
 perform pg_temp.olr_assert((select provider_assignment_id=(s->>'providerAssignmentId')::uuid from public.owner_decision_link_sessions where session_id=(s->>'approvalSessionId')::uuid),'session binds the exact active provider assignment');
 perform pg_temp.olr_assert((select approved_by='af080000-0000-4000-8000-000000000002' and approved_revision=1 and approved_hash=s->>'hash' from public.website_document_heads where website_work_id=(s->>'workId')::uuid),'native approval attributes exact candidate to verified owner');
 perform pg_temp.olr_assert((select state='open' from public.owner_decisions where id=(s->>'launchId')::uuid),'unverified launch stays open');
end $$;
-- Fictional independently recorded verification, never a live provider effect.
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
 values('af080000-0000-4000-8000-000000000010','publish','verified','{"fixture":"no live provider effect"}','af080000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from olr_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  owner_id uuid:='af080000-0000-4000-8000-000000000002'; agency uuid:='af080000-0000-4000-8000-000000000010';
  link jsonb; sid uuid; mandate jsonb; tenant text;
begin
  link:=public.strelva_owner_decision_link_session(ws,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.olr_assert(sid is not null and link->>'userId'=owner_id::text and link->>'role'='owner','verified launch retains direct owner execution identity');
  perform public.claim_owner_decision(ws,(s->>'launchId')::uuid,repeat('7',64),'approve','owner_link',null,null,'aw-noaccount@owner.example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
  perform pg_temp.olr_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,wid,'af080000-0000-4000-8000-000000000001','aw-seat@agency.example.test',s->>'hash','olr-hosted',sid,s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  perform pg_temp.olr_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,wid,'af080000-0000-4000-8000-000000000003','aw-seat-other@agency.example.test',s->>'hash','olr-hosted',sid,s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  mandate:=public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
  perform public.end_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,(mandate->>'id')::uuid,'Owner ended mandate after signed run');
  perform pg_temp.olr_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,wid,owner_id,'aw-account@owner.example.test',s->>'hash','olr-hosted',sid,s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  perform public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
  select tenant_id into tenant from public.reserve_website_by_owner_link(ws,wid,owner_id,'aw-account@owner.example.test',1,s->>'hash','olr-hosted',sid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
  update olr_state set body=body||jsonb_build_object('sessionId',sid,'tenantId',tenant);
end $$;
reset role;
select pg_temp.olr_assert((select provider_assignment_id=(s.body->>'providerAssignmentId')::uuid from public.owner_decision_link_sessions where session_id=(s.body->>'sessionId')::uuid),'launch uses the same active assignment, not only provider UUID') from olr_state s;
-- Revoke verification after admission and reservation: publish must recheck it.
insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
 values('af080000-0000-4000-8000-000000000010','publish','unverified','Fictional verification ended after run admission','af080000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from olr_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  owner_id uuid:='af080000-0000-4000-8000-000000000002'; receipt jsonb;
begin
  receipt:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',s->>'hash','candidateRevision',1,'receiptId','olr-receipt','providerUrl','https://olr-hosted.strelva.com','readBackEvidence','simulated local fixture');
  perform pg_temp.olr_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,wid,owner_id,'aw-account@owner.example.test',s->>'hash',s->>'tenantId',receipt,s->>'sessionId',s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  perform pg_temp.olr_assert(not exists(select 1 from public.read_website_document_receipts(ws,wid,owner_id,'aw-account@owner.example.test')),'verification revocation writes no accepted receipt');
end $$;
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
 values('af080000-0000-4000-8000-000000000010','publish','verified','{"fixture":"restored fictional verification; no live effect"}','af080000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from olr_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
  owner_id uuid:='af080000-0000-4000-8000-000000000002'; agency uuid:='af080000-0000-4000-8000-000000000010';
  receipt jsonb; result jsonb; mandate jsonb;
begin
  receipt:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',s->>'hash','candidateRevision',1,'receiptId','olr-receipt','providerUrl','https://olr-hosted.strelva.com','readBackEvidence','simulated local fixture');
  mandate:=public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
  perform public.end_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,(mandate->>'id')::uuid,'Owner ended mandate after tenant reservation');
  perform pg_temp.olr_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,wid,owner_id,'aw-account@owner.example.test',s->>'hash',s->>'tenantId',receipt,s->>'sessionId',s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  perform pg_temp.olr_assert(not exists(select 1 from public.read_website_document_receipts(ws,wid,owner_id,'aw-account@owner.example.test')),'publish rechecks mandate after reservation without writing a receipt');
  perform public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
  result:=public.publish_website_by_owner_link(ws,wid,owner_id,'aw-account@owner.example.test',1,s->>'hash',s->>'tenantId',receipt,(s->>'sessionId')::uuid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
  perform pg_temp.olr_assert(result->'receipt'=receipt,'owner identity publishes exact approved candidate through native signed gate');
  perform pg_temp.olr_assert((select count(*) from public.read_website_document_receipts(ws,wid,owner_id,'aw-account@owner.example.test'))=1,'owner reads accepted publication receipt');
  perform pg_temp.olr_assert((select count(*) from public.read_website_document_receipts(ws,wid,'af080000-0000-4000-8000-000000000001','aw-seat@agency.example.test'))=1,'ordinary staffed agency reads client receipt');
  perform public.end_provider_seat(owner_id,'aw-account@owner.example.test',ws,agency,'Owner ended exact serving assignment');
  perform pg_temp.olr_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,wid,owner_id,'aw-account@owner.example.test',s->>'hash',s->>'tenantId',receipt,s->>'sessionId',s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
  perform pg_temp.olr_expect(format('select public.read_website_document_receipts(%L,%L,%L,%L)',ws,wid,'af080000-0000-4000-8000-000000000001','aw-seat@agency.example.test'),'workspace_access_denied');
  perform pg_temp.olr_assert((select count(*) from public.read_website_document_receipts(ws,wid,owner_id,'aw-account@owner.example.test'))=1,'owner receipt survives provider assignment revocation');
end $$;
reset role;
select pg_temp.olr_assert(not exists(select 1 from public.workspace_memberships where workspace_id=(select (body->>'workspaceId')::uuid from olr_state)
 and user_id in ('af080000-0000-4000-8000-000000000001','af080000-0000-4000-8000-000000000003')),'no agency business membership synthesized');
select pg_temp.olr_assert(not exists(select 1 from public.memberships where user_id in ('af080000-0000-4000-8000-000000000001','af080000-0000-4000-8000-000000000002')),'signed execution synthesizes no native tenant ownership');
select pg_temp.olr_assert(not exists(select 1 from public.super_admins where user_id in (
 'af080000-0000-4000-8000-000000000001','af080000-0000-4000-8000-000000000002',
 'af080000-0000-4000-8000-000000000003','af080000-0000-4000-8000-000000000004')),'no workflow actor has platform powers');
rollback;
\echo 'Owner link final policy passed: seat-only anonymous execution refused; verified owner, bound provider and native publish guards preserved.'
