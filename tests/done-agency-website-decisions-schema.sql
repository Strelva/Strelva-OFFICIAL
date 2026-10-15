\set ON_ERROR_STOP on
-- Ordered-schema local proof. All fictional data rolls back. No provider call.
begin;
\ir support/agency-proposal-response.sql
create function pg_temp.daw_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is not true then raise exception 'agency website: %',message; end if; end$$;
create function pg_temp.daw_refuse(statement text,message text) returns void language plpgsql as $$begin begin execute statement; exception when others then if sqlerrm like '%'||message||'%' then return; end if; raise; end; raise exception 'expected refusal: %',message; end$$;
select pg_temp.daw_assert(not has_function_privilege('authenticated','public.publish_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,text)','execute'),'no browser publish bypass');
select pg_temp.daw_assert(not has_table_privilege('service_role','public.done_agency_website_executions','insert'),'no service table bypass');
select pg_temp.daw_assert(not has_function_privilege('service_role','public.assert_website_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text,text)','execute'),'internal exact assertion');
do $$
declare
 owner_id uuid:='da130000-0000-4000-8000-000000000001'; lead uuid:='da130000-0000-4000-8000-000000000002'; reviewer uuid:='da130000-0000-4000-8000-000000000003';
 ws uuid:='da130000-0000-4000-8000-0000000000b1'; agency uuid:='da130000-0000-4000-8000-0000000000a1'; work_id uuid:='da130000-0000-4000-8000-0000000000c1';
 qualification uuid:='da130000-0000-4000-8000-0000000000d1'; request_id uuid:='da130000-0000-4000-8000-0000000000e1';
 doc jsonb:='{"version":2,"siteName":"Agency proof","facts":{},"nodes":{},"pages":[]}'; h text:=repeat('a',64); revision_hash text; item jsonb; did uuid; launch_id uuid; domain_id uuid; rec jsonb; result jsonb; reserved text;
begin
 insert into public.users(id,email,verified_at) values(owner_id,'daw-owner@example.test',now()),(lead,'daw-agency@example.test',now()),(reviewer,'daw-reviewer@example.test',now());
 insert into public.super_admins(user_id,email) values(reviewer,'daw-reviewer@example.test');
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Agency proof business',owner_id),(agency,'agency','Independent agency',lead);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id),(agency,lead,'owner',lead);
 insert into public.business_owner_recipient_trust(workspace_id,email,verified,trusted_via) values(ws,'daw-owner@example.test',true,'owner_write');
 perform public.set_agency_directory_listing(lead,'daw-agency@example.test',agency,'Websites',true);
 perform public.bring_in_agency(owner_id,'daw-owner@example.test',ws,agency,'[{"scope":"website","level":"full_control"}]','Full control of website work');
 perform pg_temp.respond_to_agency_proposal(lead,'daw-agency@example.test',agency,ws,true);
 perform public.set_agency_client_staff(lead,'daw-agency@example.test',agency,ws,lead,true);
 insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,payload,created_by) values(work_id,ws,'websites','website','{"revision":0}',owner_id);
 perform public.append_website_document(ws,work_id,owner_id,'daw-owner@example.test',0,h,doc);
 update public.saved_product_work set payload=jsonb_build_object('revision',1,'status','review_ready','candidate',jsonb_build_object('revision',1,'contentHash',h,'document',doc)) where id=work_id;
 revision_hash:=encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(jsonb_build_array('website_document',work_id::text,'approve',1,1,h)),'UTF8')),'hex');
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Review exact website','approveEffect','Approve this preview','notYetEffect','Keep draft','sourceLifecycle','website_document','sourceId',work_id::text||':approve','revisionHash',revision_hash,'adminMayDecide',false));
 did:=(item->>'id')::uuid;
 perform pg_temp.daw_refuse(format('select public.approve_website_by_agency_decision(%L,%L,%L,%L,1,%L,%L,%L)',ws,work_id,lead,'daw-agency@example.test',h,did,revision_hash),'owner_decision_owner_only');
 result:=public.claim_scoped_agency_owner_decision(ws,did,revision_hash,'approve',lead,'daw-agency@example.test',agency);
 perform pg_temp.daw_assert(result->>'status'='claimed','Full control claims exact native approval');
 perform pg_temp.daw_refuse(format('select public.approve_website_by_agency_decision(%L,%L,%L,%L,1,%L,%L,%L)',ws,work_id,lead,'daw-agency@example.test',repeat('b',64),did,revision_hash),'website_revision_conflict');
 perform public.approve_website_by_agency_decision(ws,work_id,lead,'daw-agency@example.test',1,h,did,revision_hash);
 perform pg_temp.daw_assert((select approved_by=lead from public.website_document_heads where website_work_id=work_id),'agency is the actual approver');
 perform public.finish_owner_decision(ws,did,'done',null,'website-proof:approve');
 update public.saved_product_work set payload=payload||'{"status":"approved","approvedCandidateRevision":1,"revision":2}'::jsonb where id=work_id;
 revision_hash:=encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(jsonb_build_array('website_document',work_id::text,'launch',2,1,h)),'UTF8')),'hex');
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Publish exact website','approveEffect','Publish preview','notYetEffect','Keep private','sourceLifecycle','website_document','sourceId',work_id::text||':launch','revisionHash',revision_hash,'adminMayDecide',false));
 launch_id:=(item->>'id')::uuid;
 perform public.claim_scoped_agency_owner_decision(ws,launch_id,revision_hash,'approve',lead,'daw-agency@example.test',agency);
 -- Full control alone never replaces publish verification and resource consent.
 perform pg_temp.daw_refuse(format('select public.reserve_website_by_agency_decision(%L,%L,%L,%L,1,%L,%L,%L,%L)',ws,work_id,lead,'daw-agency@example.test',h,'done-agency-proof',launch_id,revision_hash),'owner_decision_owner_only');
 perform public.submit_agency_qualification(lead,'daw-agency@example.test',agency,qualification,'publish','https://example.test/proof','Fictional publication and recovery evidence');
 perform public.decide_agency_qualification('daw-reviewer@example.test',qualification,'verified','Independent fictional evidence checked');
 perform public.grant_client_resource_mandate(owner_id,'daw-owner@example.test',ws,agency,'publish','website',public.system_origin_id(ws,'saved_work',work_id::text)::text);
 select r.tenant_id into reserved from public.reserve_website_by_agency_decision(ws,work_id,lead,'daw-agency@example.test',1,h,'done-agency-proof',launch_id,revision_hash) r;
 perform pg_temp.daw_assert(reserved='done-agency-proof','native site reserved under exact claim');
 perform pg_temp.daw_assert(not exists(select 1 from public.memberships where tenant_id=reserved and user_id=lead),'agency receives no tenant owner membership');
 -- Bookkeeping changes the work revision while the immutable candidate stays fixed.
 update public.saved_product_work set payload=payload||'{"revision":3,"tenantId":"done-agency-proof"}'::jsonb where id=work_id;
 rec:=jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h,'candidateRevision',1,'receiptId','done-agency-receipt','providerUrl','https://done-agency-proof.strelva.com/','publishedAt','2026-10-14T12:00:00Z','evidence','Fictional local native pointer');
 perform public.publish_website_by_agency_decision(ws,work_id,lead,'daw-agency@example.test',1,h,reserved,rec,launch_id,revision_hash);
 perform public.publish_website_by_agency_decision(ws,work_id,lead,'daw-agency@example.test',1,h,reserved,rec,launch_id,revision_hash);
 perform pg_temp.daw_assert((select count(*)=1 from public.website_document_receipts where website_work_id=work_id),'native retry retains one accepted publication');
 perform public.finish_owner_decision(ws,launch_id,'done_unverified','Public read-back pending','website-proof:publish');
 result:=public.read_agency_decision_receipt(ws,agency,launch_id,revision_hash,lead,'daw-agency@example.test');
 perform pg_temp.daw_assert(result->>'outcome'='done_unverified' and result->'decidedActor'->>'agencyId'=agency::text,'exact accepted receipt retains agency actor');
 -- Domain preparation still belongs to an authorized business owner. Execution
 -- consumes the scoped agency decision and exact hostname mandate.
 perform public.prepare_website_domain_request(request_id,ws,work_id,owner_id,'daw-owner@example.test',reserved,1,h,'daw.example.test','[{"type":"A","name":"daw.example.test","value":"203.0.113.10"}]',repeat('d',64));
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Connect exact domain','approveEffect','Attach exact hostname','notYetEffect','No DNS changes','sourceLifecycle','website_domain','sourceId',request_id::text,'revisionHash',repeat('d',64),'adminMayDecide',false));
 domain_id:=(item->>'id')::uuid;
 perform public.claim_scoped_agency_owner_decision(ws,domain_id,repeat('d',64),'approve',lead,'daw-agency@example.test',agency);
 perform pg_temp.daw_refuse(format('select public.approve_website_domain_request(%L,%L,%L,%L)',ws,request_id,domain_id,repeat('d',64)),'website_domain_owner_approval_required');
 perform public.grant_client_resource_mandate(owner_id,'daw-owner@example.test',ws,agency,'publish','domain','daw.example.test');
 result:=public.approve_website_domain_request(ws,request_id,domain_id,repeat('d',64));
 perform pg_temp.daw_assert(result->>'decisionId'=domain_id::text,'domain consumes exact approved agency decision');
 update public.agency_scope_grants set status='ended',ended_by=owner_id,ended_at=clock_timestamp() where customer_workspace_id=ws and agency_workspace_id=agency and status='active';
 perform pg_temp.daw_refuse(format('select public.authorize_website_domain_request(%L,%L)',ws,request_id),'website_domain_owner_approval_required');
 perform pg_temp.daw_assert(not exists(select 1 from public.workspace_memberships where workspace_id=ws and user_id=lead),'no business owner identity borrowed');
end $$;
rollback;
