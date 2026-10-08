\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.ol_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner link assertion failed: %',message; end if; end $$;
create or replace function pg_temp.ol_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected % for %',expected,statement;
end $$;
select pg_temp.ol_assert((select relrowsecurity from pg_class where oid='public.owner_decision_link_sessions'::regclass),'RLS on');
select pg_temp.ol_assert(not has_table_privilege('service_role','public.owner_decision_link_sessions','select'),'no direct table access');
select pg_temp.ol_assert(has_function_privilege('service_role','public.strelva_owner_decision_link_session(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.strelva_owner_decision_link_session(uuid,uuid,text,text)','execute')
  and not has_function_privilege('service_role','public.assert_owner_decision_link(uuid,uuid,uuid,text,text)','execute'),'narrow service-only entry');
select pg_temp.ol_assert('owner_decision_links'=any(public.workspace_release_flag_names()),'release flag registered');

do $$
declare
  ws uuid:='b2000000-0000-4000-8000-000000000001';
  actor uuid:='b2000000-0000-4000-8000-000000000002';
  work public.saved_product_work; item jsonb; link jsonb; id uuid; sid uuid;
  doc jsonb:='{"version":2,"siteName":"Owner link fixture","nodes":{},"pages":[],"facts":{}}';
  h text:=repeat('c',64); revision_hash text:=repeat('a',64); rec jsonb; published jsonb; reserved text; kind text; draft jsonb; applied jsonb;
begin
  insert into public.users(id,email,verified_at) values(actor,'ol-operator@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Owner link business',actor);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'admin',actor);
  insert into public.tenants(id,site_name,owner_email,template,industry) values('ol-existing-fixture','Existing Owner Link','ol-owner@example.test','professional','consulting');
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    select t.stable_id,t.id,ws,actor,gen_random_uuid(),h,'{}'::jsonb from public.tenants t where t.id='ol-existing-fixture';
  -- Batch 7A: the platform serves a business through its agency of record,
  -- verified for email, the same for every agency (Strelva's included).
  insert into public.workspaces(id,kind,name,created_by) values('b2000000-0000-4000-8000-0000000000a1','agency','Owner link fixture agency',actor);
  insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values(ws,'b2000000-0000-4000-8000-0000000000a1','business_choice',actor);
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values('b2000000-0000-4000-8000-0000000000a1','email','verified','{"note":"fixture"}',actor,false);
  select * into work from public.claim_website_rebuild(ws,actor,'ol-operator@example.test','ol-request-one','ol-example.test','{"url":"https://ol-example.test"}',
    jsonb_build_object('version',2,'revision',0,'title','Owner link fixture','status','building','createdBy',actor,'createdAt','2026-10-08T10:00:00Z','history','[]'::jsonb));
  perform public.append_website_document(ws,work.id,actor,'ol-operator@example.test',0,h,doc);
  perform public.approve_website_document(ws,work.id,actor,'ol-operator@example.test',1,h);
  -- After 20261014101000 (#534) launching from the link also publishes: the
  -- agency needs its seat, publish verification and the website mandate
  -- (recorded at conversion; this business has no owner).
  if to_regprocedure('public.acting_provider(uuid,uuid,text,text,text)') is not null then
    insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by)
      values(ws,'b2000000-0000-4000-8000-0000000000a1','conversion',actor);
    insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
      values('b2000000-0000-4000-8000-0000000000a1','publish','verified','{"note":"fixture"}',actor,false);
    insert into public.client_resource_mandates(customer_workspace_id,agency_workspace_id,effect,resource_kind,resource_ref,
        granted_by_kind,granted_by,granter_is_agency_member,grant_note)
      values(ws,'b2000000-0000-4000-8000-0000000000a1','publish','website',public.system_origin_id(ws,'saved_work',work.id::text)::text,
        'conversion',actor,false,'Fixture conversion mandate.');
  end if;
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Launch exact site',
    'approveEffect','It goes live.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId',work.id::text||':launch','revisionHash',revision_hash,'adminMayDecide',false));
  id:=(item->>'id')::uuid;
  perform pg_temp.ol_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,id,h,'ol-owner@example.test'),'strelva_service_access_denied');
  perform pg_temp.ol_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,id,revision_hash,'intruder@example.test'),'owner_decision_recipient_not_owner');
  perform pg_temp.ol_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',gen_random_uuid(),id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
  link:=public.strelva_owner_decision_link_session(ws,id,revision_hash,' OL-Owner@Example.test ');
  sid:=(link->>'sessionId')::uuid;
  perform pg_temp.ol_assert(link->>'role'='admin' and link->>'recipient'='ol-owner@example.test' and link->>'decisionId'=id::text,'bound unchanged admin identity');
  perform pg_temp.ol_assert(link->>'providerWorkspaceId'='b2000000-0000-4000-8000-0000000000a1'
    and (select a.provider_workspace_id from public.strelva_service_actions a where a.id=sid)='b2000000-0000-4000-8000-0000000000a1','session names the agency of record');
  perform pg_temp.ol_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
  perform public.claim_owner_decision(ws,id,revision_hash,'approve','owner_link',null,null,'ol-owner@example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,id,revision_hash,'ol-owner@example.test');
  perform pg_temp.ol_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
  perform pg_temp.ol_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,'ol-existing-fixture',sid,id,revision_hash,'ol-owner@example.test'),'website_publication_conflict');
  perform pg_temp.ol_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',revision_hash,'ol-new-fixture',sid,id,revision_hash,'ol-owner@example.test'),'website_approval_required');
  if to_regprocedure('public.acting_provider(uuid,uuid,text,text,text)') is not null then
    -- An agency verified for email but not publish launches nothing (#534).
    insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
      values('b2000000-0000-4000-8000-0000000000a1','publish','unverified','Fixture revocation.',actor,false);
    perform pg_temp.ol_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,'ol-new-fixture',sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
    insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
      values('b2000000-0000-4000-8000-0000000000a1','publish','verified','{"note":"fixture"}',actor,false);
    -- Nor does a verified agency whose website mandate has ended.
    update public.client_resource_mandates set status='ended',ended_by_kind='owner',ended_by=actor,ended_at=now(),end_reason='Fixture end.'
      where customer_workspace_id=ws and status='active';
    perform pg_temp.ol_expect(format('select public.reserve_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,'ol-new-fixture',sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
    insert into public.client_resource_mandates(customer_workspace_id,agency_workspace_id,effect,resource_kind,resource_ref,
        granted_by_kind,granted_by,granter_is_agency_member,grant_note)
      values(ws,'b2000000-0000-4000-8000-0000000000a1','publish','website',public.system_origin_id(ws,'saved_work',work.id::text)::text,
        'conversion',actor,false,'Fixture conversion mandate.');
  end if;
  select tenant_id into reserved from public.reserve_website_by_owner_link(ws,work.id,actor,'ol-operator@example.test',1,h,'ol-new-fixture',sid,id,revision_hash,'ol-owner@example.test');
  perform pg_temp.ol_assert(reserved='ol-new-fixture','new hosted tenant reserved');
  perform pg_temp.ol_assert(not exists(select 1 from public.memberships where tenant_id=reserved),'no tenant membership granted');
  perform pg_temp.ol_assert(not exists(select 1 from public.workspace_memberships where workspace_id=ws and role='owner'),'no workspace owner synthesized');
  rec:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h,'candidateRevision',1,'receiptId','ol-receipt','providerUrl','https://ol-new-fixture.strelva.com/','evidence','Fictional','publishedAt','2026-10-08T10:00:00Z');
  perform pg_temp.ol_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,'ol-existing-fixture',rec,sid,id,revision_hash,'ol-owner@example.test'),'website_tenant_access_denied');
  perform pg_temp.ol_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,reserved,rec||'{"candidateRevision":2}',sid,id,revision_hash,'ol-owner@example.test'),'website_receipt_invalid');
  published:=public.publish_website_by_owner_link(ws,work.id,actor,'ol-operator@example.test',1,h,reserved,rec,sid,id,revision_hash,'ol-owner@example.test');
  perform pg_temp.ol_assert(published->>'tenant_id'=reserved,'publishes exact approved candidate');
  perform public.publish_website_by_owner_link(ws,work.id,actor,'ol-operator@example.test',1,h,reserved,rec,sid,id,revision_hash,'ol-owner@example.test');
  perform pg_temp.ol_assert((select count(*) from public.website_document_receipts where website_work_id=work.id)=1,'accepted write is never duplicated');
  -- Any owner-recipient change after claim revokes the capability immediately.
  update public.tenants t set owner_email='changed@example.test' where t.id='ol-existing-fixture';
  -- Recipient resolver prefers the first linked tenant; set both to remove ambiguity.
  update public.tenants t set owner_email='changed@example.test' where t.id=reserved;
  perform pg_temp.ol_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,reserved,rec,sid,id,revision_hash,'ol-owner@example.test'),'owner_decision_recipient_not_owner');
  update public.tenants t set owner_email='ol-owner@example.test' where t.id in ('ol-existing-fixture',reserved);
  delete from public.workspace_memberships where workspace_id=ws and user_id=actor;
  perform pg_temp.ol_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,reserved,rec,sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'admin',actor);
  perform public.finish_owner_decision(ws,id,'done',null,'website:'||work.id);
  perform pg_temp.ol_expect(format('select public.publish_website_by_owner_link(%L,%L,%L,%L,1,%L,%L,%L,%L,%L,%L,%L)',ws,work.id,actor,'ol-operator@example.test',h,reserved,rec,sid,id,revision_hash,'ol-owner@example.test'),'strelva_service_access_denied');
  -- The same account-free owner can decide an exact fact patch. This is the
  -- real writer RPC, with no owner account or synthetic membership.
  draft:=public.save_ask_business_draft(ws,actor,'ol-operator@example.test',null,0,
    '{"facts":{"phone":{"value":"716-555-0111"}}}','Change phone','ol-fact-one');
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Change exact phone',
    'approveEffect','Save phone.','notYetEffect','Nothing changes.','sourceLifecycle','business_record_draft','sourceId',draft->>'id','revisionHash',h));
  id:=(item->>'id')::uuid;
  link:=public.strelva_owner_decision_link_session(ws,id,h,'ol-owner@example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.ol_expect(format('select public.resolve_ask_business_draft_by_owner_link(%L,%L,%L,%L,%L,%L,%L,%L,%L)',ws,actor,'ol-operator@example.test',draft->>'id','approve',sid,id,h,'ol-owner@example.test'),'strelva_service_access_denied');
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'ol-owner@example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,id,h,'ol-owner@example.test');
  perform pg_temp.ol_expect(format('select public.resolve_ask_business_draft_by_owner_link(%L,%L,%L,%L,%L,%L,%L,%L,%L)',ws,actor,'ol-operator@example.test',gen_random_uuid(),'approve',sid,id,h,'ol-owner@example.test'),'strelva_service_access_denied');
  perform pg_temp.ol_expect(format('select public.resolve_ask_business_draft_by_owner_link(%L,%L,%L,%L,%L,%L,%L,%L,%L)',ws,actor,'ol-operator@example.test',draft->>'id','not_yet',sid,id,h,'ol-owner@example.test'),'strelva_service_access_denied');
  applied:=public.resolve_ask_business_draft_by_owner_link(ws,actor,'ol-operator@example.test',(draft->>'id')::uuid,'approve',sid,id,h,'ol-owner@example.test');
  perform pg_temp.ol_assert(applied->>'status'='approved' and applied->'receipt' is not null,'signed fact applied with receipt');
  perform pg_temp.ol_assert((select value #>> '{}' from public.business_record_facts where workspace_id=ws and fact_key='phone')='716-555-0111','exact approved phone');
  perform pg_temp.ol_assert(not exists(select 1 from public.workspace_memberships where workspace_id=ws and role='owner'),'fact approval grants no membership');
  perform public.finish_owner_decision(ws,id,'done',null,'business_record:'||ws);
  perform pg_temp.ol_expect(format('select public.resolve_ask_business_draft_by_owner_link(%L,%L,%L,%L,%L,%L,%L,%L,%L)',ws,actor,'ol-operator@example.test',draft->>'id','approve',sid,id,h,'ol-owner@example.test'),'strelva_service_access_denied');
  foreach kind in array array['money','access.grant','exit'] loop
    item:=public.open_owner_decision(ws,jsonb_build_object('kind',kind,'route','owner_decides','title','Sign-in boundary','approveEffect','A change.','notYetEffect','Nothing changes.',
      'sourceLifecycle','service_request','sourceId',kind,'revisionHash',h));
    perform pg_temp.ol_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,item->>'id',h,'ol-owner@example.test'),'strelva_service_access_denied');
  end loop;
end $$;
rollback;
\echo 'Owner decision link SQL checks passed.'
