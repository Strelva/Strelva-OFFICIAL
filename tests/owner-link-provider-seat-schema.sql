\set ON_ERROR_STOP on
-- A trusted no-account recipient can decide through the serving agency's
-- current seat. Trust and publishing mandate are established by a real owner
-- first; fixture removal of that owner's membership exercises the no-account
-- execution identity without inventing trust or granting agency ownership.
begin;
create function pg_temp.ols_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner link seat: %',message; end if; end $$;
create function pg_temp.ols_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like '%'||expected||'%' then raise exception 'owner link seat expected %, got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'owner link seat expected %, command succeeded',expected;
end $$;
create temporary table ols_state(body jsonb not null) on commit drop;
grant all on ols_state to service_role;
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec

insert into public.users(id,email,verified_at) values
 ('af020000-0000-4000-8000-000000000001','aw-seat@agency.example.test',now()),
 ('af020000-0000-4000-8000-000000000002','aw-account@owner.example.test',now()),
 ('af020000-0000-4000-8000-000000000003','aw-seat-other@agency.example.test',now()),
 ('af020000-0000-4000-8000-000000000004','aw-seat-verifier@platform.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('af020000-0000-4000-8000-000000000010','agency','Owner Link Serving Agency','af020000-0000-4000-8000-000000000001'),
 ('af020000-0000-4000-8000-000000000011','agency','Owner Link Other Agency','af020000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('af020000-0000-4000-8000-000000000010','af020000-0000-4000-8000-000000000001','owner','af020000-0000-4000-8000-000000000001'),
 ('af020000-0000-4000-8000-000000000011','af020000-0000-4000-8000-000000000003','owner','af020000-0000-4000-8000-000000000003');
set local role service_role;
do $$
declare actor uuid:='af020000-0000-4000-8000-000000000001'; owner_id uuid:='af020000-0000-4000-8000-000000000002';
 agency uuid:='af020000-0000-4000-8000-000000000010'; ws uuid; added jsonb; work record; item jsonb; rev bigint;
 h text:=repeat('e',64); decision_hash text:=repeat('f',64); payload jsonb;
 doc jsonb:='{"version":2,"siteName":"Trusted owner link","nodes":{},"pages":[],"facts":{}}';
begin
 added:=public.agency_add_client(actor,'aw-seat@agency.example.test',agency,'{"name":"Trusted owner link"}',gen_random_uuid(),repeat('4',64));
 ws:=(added->>'customerWorkspaceId')::uuid;
 select * into work from public.claim_website_rebuild(ws,actor,'aw-seat@agency.example.test','ols-request-one','ols-business.example.test','{"businessName":"Trusted owner link"}',
  jsonb_build_object('version',2,'revision',0,'title','Trusted owner link','status','building','createdBy',actor,'createdAt','2026-10-07T12:00:00Z','history','[]'::jsonb));
 payload:=work.payload||jsonb_build_object('revision',1,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',1,'contentHash',h,'document',doc),
  'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','candidate','actorId',actor,'at','2026-10-07T12:01:00Z')));
 select * into work from public.commit_website_document_candidate(ws,work.id,actor,'aw-seat@agency.example.test',0,0,h,doc,payload);
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Approve trusted preview',
  'approveEffect','Records this exact approval.','notYetEffect','Nothing publishes.','sourceLifecycle','website_document','sourceId',work.id::text||':approve','revisionHash',decision_hash,'adminMayDecide',false));
 perform pg_temp.ols_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,item->>'id',decision_hash,'aw-noaccount@owner.example.test'),'owner_decision_recipient_not_owner');
 perform public.issue_agency_client_owner_claim(actor,'aw-seat@agency.example.test',agency,ws,'aw-account@owner.example.test',repeat('5',64),now()+interval '14 days');
 perform public.accept_agency_client_owner_claim(repeat('5',64),owner_id,'aw-account@owner.example.test');
 rev:=(public.read_business_record(ws,owner_id,'aw-account@owner.example.test')->>'revision')::bigint;
 perform public.patch_business_record(ws,owner_id,'aw-account@owner.example.test','owner',rev,
  '{"facts":{"owner_recipient":{"value":{"email":"aw-noaccount@owner.example.test"}}}}',gen_random_uuid(),repeat('6',64));
 perform public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',work.id::text)::text);
 perform pg_temp.ols_assert((public.resolve_business_owner_recipient(ws)->>'trusted')::boolean,'verified owner independently established recipient trust');
 -- Simulated link issuance binds this decision to the already trusted address;
 -- the test never calls an email provider or authorizes a live send.
 perform public.record_owner_decision_delivery(ws,(item->>'id')::uuid,'urgent','sent','aw-noaccount@owner.example.test',null,'Simulated issued link; no email');
 insert into ols_state values(jsonb_build_object('workspaceId',ws,'workId',work.id,'decisionId',item->>'id','hash',h,'decisionHash',decision_hash));
end $$;
reset role;
-- Fictional setup: the trusted owner keeps their established consent but has
-- no current member identity. No agency is ever added to the business.
delete from public.workspace_memberships where workspace_id=(select (body->>'workspaceId')::uuid from ols_state)
 and user_id='af020000-0000-4000-8000-000000000002';
set local role service_role;
do $$
declare s jsonb:=(select body from ols_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
 actor uuid:='af020000-0000-4000-8000-000000000001'; link jsonb; sid uuid; item jsonb;
begin
 link:=public.strelva_owner_decision_link_session(ws,(s->>'decisionId')::uuid,s->>'decisionHash','aw-noaccount@owner.example.test');
 perform pg_temp.ols_assert(link->>'userId'=actor::text and link->>'role'='admin'
  and link->>'providerWorkspaceId'='af020000-0000-4000-8000-000000000010','session uses this provider seated identity: '||coalesce(link::text,'null'));
 sid:=(link->>'sessionId')::uuid;
 perform public.claim_owner_decision(ws,(s->>'decisionId')::uuid,s->>'decisionHash','approve','owner_link',null,null,'aw-noaccount@owner.example.test');
 perform public.authorize_owner_decision_link_run(ws,sid,(s->>'decisionId')::uuid,s->>'decisionHash','aw-noaccount@owner.example.test');
 perform public.approve_website_document(ws,wid,actor,'aw-seat@agency.example.test',1,s->>'hash');
 perform public.finish_owner_decision(ws,(s->>'decisionId')::uuid,'done',null,'website_document:'||wid::text||':approved:1');
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Launch trusted preview',
  'approveEffect','Publishes this exact approval.','notYetEffect','Nothing publishes.','sourceLifecycle','website_document','sourceId',wid::text||':launch','revisionHash',repeat('7',64),'adminMayDecide',false));
 perform public.record_owner_decision_delivery(ws,(item->>'id')::uuid,'urgent','sent','aw-noaccount@owner.example.test',null,'Simulated issued link; no email');
 perform pg_temp.ols_assert(public.strelva_owner_decision_link_session(ws,(item->>'id')::uuid,repeat('7',64),'aw-noaccount@owner.example.test') is null,'internal approval never authorizes unverified publication');
 update ols_state set body=body||jsonb_build_object('launchId',item->>'id');
end $$;
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
 values('af020000-0000-4000-8000-000000000010','publish','verified','{"fixture":"no live provider effect"}','af020000-0000-4000-8000-000000000004',false);
set local role service_role;
do $$
declare s jsonb:=(select body from ols_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
 actor uuid:='af020000-0000-4000-8000-000000000001'; agency uuid:='af020000-0000-4000-8000-000000000010';
 link jsonb; sid uuid; tenant text;
begin
 link:=public.strelva_owner_decision_link_session(ws,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test'); sid:=(link->>'sessionId')::uuid;
 perform pg_temp.ols_assert(sid is not null,'verified publish session admits ordinary seated provider');
 perform public.claim_owner_decision(ws,(s->>'launchId')::uuid,repeat('7',64),'approve','owner_link',null,null,'aw-noaccount@owner.example.test');
 perform public.set_agency_client_staff(actor,'aw-seat@agency.example.test',agency,ws,actor,false);
 perform pg_temp.ols_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
 perform public.set_agency_client_staff(actor,'aw-seat@agency.example.test',agency,ws,actor,true);
 perform public.authorize_owner_decision_link_run(ws,sid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
 perform pg_temp.ols_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,wid,'af020000-0000-4000-8000-000000000003','aw-seat-other@agency.example.test',s->>'hash','ols-hosted',sid,s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
 update ols_state set body=body||jsonb_build_object('sessionId',sid);
end $$;
reset role;
-- Restore the verified owner only for the explicit native revocation command.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select (body->>'workspaceId')::uuid,'af020000-0000-4000-8000-000000000002','owner','af020000-0000-4000-8000-000000000002' from ols_state;
set local role service_role;
do $$
declare s jsonb:=(select body from ols_state); ws uuid:=(s->>'workspaceId')::uuid; wid uuid:=(s->>'workId')::uuid;
 actor uuid:='af020000-0000-4000-8000-000000000001'; owner_id uuid:='af020000-0000-4000-8000-000000000002';
 agency uuid:='af020000-0000-4000-8000-000000000010'; mandate jsonb; tenant text; receipt jsonb; result jsonb; item jsonb; link jsonb;
begin
 mandate:=public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
 perform public.end_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,(mandate->>'id')::uuid,'Owner ended authority after signed run');
 perform pg_temp.ols_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,wid,actor,'aw-seat@agency.example.test',s->>'hash','ols-hosted',s->>'sessionId',s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
 perform public.grant_client_resource_mandate(owner_id,'aw-account@owner.example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',wid::text)::text);
 select tenant_id into tenant from public.reserve_website_by_owner_link(ws,wid,actor,'aw-seat@agency.example.test',1,s->>'hash','ols-hosted',(s->>'sessionId')::uuid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
 receipt:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',s->>'hash','candidateRevision',1,'receiptId','ols-receipt','providerUrl','https://ols-hosted.strelva.com','readBackEvidence','simulated local fixture');
 result:=public.publish_website_by_owner_link(ws,wid,actor,'aw-seat@agency.example.test',1,s->>'hash',tenant,receipt,(s->>'sessionId')::uuid,(s->>'launchId')::uuid,repeat('7',64),'aw-noaccount@owner.example.test');
 perform pg_temp.ols_assert(result->'receipt'=receipt,'signed decision publishes exact candidate through native gate');
 perform pg_temp.ols_assert((select count(*) from public.read_website_document_receipts(ws,wid,actor,'aw-seat@agency.example.test'))=1,'serving seated actor reads accepted receipt');
 -- New sessions preserve direct-owner priority over provider staff.
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.change_live','route','owner_decides','title','New exact review','approveEffect','Records review.','notYetEffect','Nothing changes.',
  'sourceLifecycle','website_document','sourceId',wid::text||':approve','revisionHash',repeat('8',64),'adminMayDecide',false));
 link:=public.strelva_owner_decision_link_session(ws,(item->>'id')::uuid,repeat('8',64),'aw-noaccount@owner.example.test');
 perform pg_temp.ols_assert(link->>'userId'=owner_id::text and link->>'role'='owner','direct owner remains preferred execution identity');
 perform public.end_provider_seat(owner_id,'aw-account@owner.example.test',ws,agency,'Owner ended serving seat');
 perform pg_temp.ols_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,wid,actor,'aw-seat@agency.example.test',s->>'hash',tenant,receipt,s->>'sessionId',s->>'launchId',repeat('7',64),'aw-noaccount@owner.example.test'),'strelva_service_access_denied');
end $$;
reset role;
select pg_temp.ols_assert(not exists(select 1 from public.workspace_memberships where workspace_id=(select (body->>'workspaceId')::uuid from ols_state)
 and user_id in ('af020000-0000-4000-8000-000000000001','af020000-0000-4000-8000-000000000003')),'no agency business membership synthesized');
select pg_temp.ols_assert(not exists(select 1 from public.memberships where user_id='af020000-0000-4000-8000-000000000001'),'no native tenant ownership synthesized');
select pg_temp.ols_assert(not exists(select 1 from public.super_admins where user_id in (
 'af020000-0000-4000-8000-000000000001','af020000-0000-4000-8000-000000000002',
 'af020000-0000-4000-8000-000000000003','af020000-0000-4000-8000-000000000004')),
 'no platform powers used by serving actors');
rollback;
\echo 'Owner link seated-provider contract passed (trusted fixture recipient; no email or deployment).'
