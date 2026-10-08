\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.oe_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner effect assertion failed: %',message; end if; end $$;
create or replace function pg_temp.oe_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected % for %',expected,statement;
end $$;
-- Later owner-recipient trust also requires evidence that this exact link
-- was delivered while trusted. Record only a fictional receipt, never mail.
create or replace function pg_temp.oe_delivered(ws uuid,item uuid) returns void language plpgsql as $$
begin
  if to_regclass('public.owner_decision_link_bindings') is not null then
    perform public.record_owner_decision_delivery(ws,item,'digest','sent','oe-owner@example.test','oe-fictional-message',null);
  end if;
end $$;
select pg_temp.oe_assert(not has_function_privilege('service_role','public.owner_decision_execution_effects(text,text,text)','execute')
  and not has_function_privilege('service_role','public.owner_decision_provider_holds(uuid,uuid,text[])','execute'),'effect helpers private');
select pg_temp.oe_assert(has_function_privilege('service_role','public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)','execute')
  and not has_function_privilege('authenticated','public.strelva_owner_decision_link_session(uuid,uuid,text,text,text)','execute'),'intended-decision entry service-only');
do $$
declare ws uuid:='b2100000-0000-4000-8000-000000000001'; actor uuid:='b2100000-0000-4000-8000-000000000002';
  agency uuid:='b2100000-0000-4000-8000-000000000003'; item jsonb; link jsonb; decline_link jsonb; id uuid; sid uuid;
  h text:=repeat('d',64); kind text;
begin
  insert into public.users(id,email,verified_at) values(actor,'oe-operator@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Owner effects business',actor),(agency,'agency','Owner effects agency',actor);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'admin',actor);
  insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values(ws,agency,'business_choice',actor);
  insert into public.tenants(id,site_name,owner_email) values('oe-existing-fixture','Owner effects','oe-owner@example.test');
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    select t.stable_id,t.id,ws,actor,gen_random_uuid(),h,'{}'::jsonb from public.tenants t where t.id='oe-existing-fixture';
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values(agency,'email','verified','{"note":"fixture"}',actor,false);

  -- Another agency's platform verification is irrelevant to this business.
  insert into public.workspaces(id,kind,name,created_by) values('b2100000-0000-4000-8000-000000000004','agency','Unrelated verified agency',actor);
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values('b2100000-0000-4000-8000-000000000004','google','verified','{"note":"unrelated fixture"}',actor,false),
      ('b2100000-0000-4000-8000-000000000004','publish','verified','{"note":"unrelated fixture"}',actor,false);
  foreach kind in array array['google.post','google.photo','review.reply','review.reply_critical'] loop
    perform pg_temp.oe_assert(public.owner_decision_execution_effects(kind,'service_request',kind)=array['google'],'Google kind maps independently');
    item:=public.open_owner_decision(ws,jsonb_build_object('kind',kind,'route','owner_decides','title','Google effect fixture','approveEffect','Google changes.','notYetEffect','Nothing changes.',
      'sourceLifecycle','service_request','sourceId',kind,'revisionHash',h)); id:=(item->>'id')::uuid;
    perform pg_temp.oe_assert(public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test') is null,'email-only agency cannot admit Google');
  end loop;
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values(agency,'google','verified','{"note":"fixture"}',actor,false);
  link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.oe_assert(link->>'providerWorkspaceId'=agency::text,'Google session names same provider');
  perform pg_temp.oe_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,gen_random_uuid(),h,'oe-owner@example.test'),'strelva_service_access_denied');
  perform pg_temp.oe_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,repeat('e',64),'oe-owner@example.test'),'strelva_service_access_denied');

  perform pg_temp.oe_delivered(ws,id);
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
    values(agency,'google','unverified','Google revoked after session',actor,false);
  perform pg_temp.oe_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,h,'oe-owner@example.test'),'strelva_service_access_denied');
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values(agency,'google','verified','{"note":"fixture reverified"}',actor,false);
  perform public.authorize_owner_decision_link_run(ws,sid,id,h,'oe-owner@example.test');
  insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
    values(agency,'google','unverified','Google revoked after run',actor,false);
  perform pg_temp.oe_expect(format('select public.strelva_service_session(%L,%L,%L)',ws,sid,'owner_decision_link'),'strelva_service_access_denied');

  foreach kind in array array['customer.message','customer.commitment','customer.broadcast'] loop
    perform pg_temp.oe_assert(public.owner_decision_execution_effects(kind,'service_request',kind)=array['email'],'email kind maps independently');
    item:=public.open_owner_decision(ws,jsonb_build_object('kind',kind,'route','owner_decides','title','Email effect fixture','approveEffect','Email sends.','notYetEffect','Nothing changes.',
      'sourceLifecycle','service_request','sourceId',kind,'revisionHash',h)); id:=(item->>'id')::uuid;
    perform pg_temp.oe_assert(public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test') is not null,'email decision needs only email');
  end loop;
  link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.oe_delivered(ws,id);
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,id,h,'oe-owner@example.test');
  insert into public.agency_verifications(agency_workspace_id,effect,status,reason,verified_by,verifier_is_agency_member)
    values(agency,'email','unverified','Email revoked after run',actor,false);
  perform pg_temp.oe_expect(format('select public.strelva_service_session(%L,%L,%L)',ws,sid,'owner_decision_link'),'strelva_service_access_denied');

  foreach kind in array array['fact.owner_stated','fact.inferred','request.scope','running.approve'] loop
    perform pg_temp.oe_assert(public.owner_decision_execution_effects(kind,'service_request',kind)='{}'::text[],'internal has no immediate outside effect');
    item:=public.open_owner_decision(ws,jsonb_build_object('kind',kind,'route','owner_decides','title','Internal effect fixture','approveEffect','Internal changes.','notYetEffect','Nothing changes.',
      'sourceLifecycle','service_request','sourceId',kind,'revisionHash',h)); id:=(item->>'id')::uuid;
    link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test'); sid:=(link->>'sessionId')::uuid;
    perform pg_temp.oe_assert(link is not null,'internal admitted without any verified outside effect');
    perform pg_temp.oe_delivered(ws,id);
    perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
    perform public.authorize_owner_decision_link_run(ws,sid,id,h,'oe-owner@example.test');
    perform public.strelva_service_session(ws,sid,'owner_decision_link');
  end loop;
  foreach kind in array array['system.go_live','system.change_live','copy.routine','copy.marketing','structure'] loop
    perform pg_temp.oe_assert(public.owner_decision_execution_effects(kind,'service_request',kind)=array['publish'],'publishing kinds require publish');
  end loop;
  perform pg_temp.oe_assert(public.owner_decision_execution_effects('system.go_live','website_document',id::text||':approve')='{}'::text[],'preview approval stays draft');
  perform pg_temp.oe_assert(public.owner_decision_execution_effects('system.go_live','website_document',id::text||':launch')=array['publish'],'website launch publishes');
  perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)','fact.inferred','website_document',id::text||':launch'),'owner_decision_effect_unknown');
  perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)','system.go_live','website_document',id::text||':unknown'),'owner_decision_effect_unknown');
  foreach kind in array array['system.pause','health.fix','verify.failed'] loop
    perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)',kind,'service_request',kind),'owner_decision_effect_unknown');
    perform pg_temp.oe_assert(public.owner_decision_execution_effects(kind,'website_document',id::text||':launch')=array['publish'],'repair uses actual source effect');
  end loop;
  foreach kind in array array['money','access.grant','exit','suggestion','health.owner_action'] loop
    perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)',kind,'service_request',kind),'strelva_service_access_denied');
  end loop;
  -- A decline session cannot be reused to execute an approval, even if the
  -- relevant agency effect later becomes verified.
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Decline boundary','approveEffect','Publishes.','notYetEffect','Nothing changes.',
    'sourceLifecycle','service_request','sourceId','decline-boundary','revisionHash',h)); id:=(item->>'id')::uuid;
  decline_link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test','not_yet'); sid:=(decline_link->>'sessionId')::uuid;
  perform pg_temp.oe_assert(decline_link is not null,'decline admitted without publish');
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
    values(agency,'publish','verified','{"note":"fixture"}',actor,false);
  perform pg_temp.oe_delivered(ws,id);
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  perform pg_temp.oe_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,h,'oe-owner@example.test'),'strelva_service_access_denied');
  -- Releases without a session-aware atomic native write require sign-in.
  foreach kind in array array['application_release','version_release'] loop
    item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Unsupported release',
      'approveEffect','Publishes.','notYetEffect','Nothing changes.','sourceLifecycle',kind,
      'sourceId',case kind when 'application_release' then 'native:'||id::text else id::text end,'revisionHash',h));
    perform pg_temp.oe_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',ws,item->>'id',h,'oe-owner@example.test'),'strelva_service_access_denied');
  end loop;
  -- An exact, active assignment is required. Another agency's verification
  -- cannot authorize this provider, nor can ending and granting it again
  -- resurrect a session admitted on the former relationship.
  perform pg_temp.oe_assert(not public.owner_decision_provider_holds(ws,agency,array['publish','email']),
    'every effect required, not any effect');
  perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)',
    'system.go_live','unknown_lifecycle',id::text),'owner_decision_effect_unknown');
  perform pg_temp.oe_expect(format('select public.owner_decision_execution_effects(%L,%L,%L)',
    'system.go_live','service_request',''),'owner_decision_effect_unknown');
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','request.scope','route','owner_decides','title','Assignment fixture',
    'approveEffect','Internal draft.','notYetEffect','Nothing changes.','sourceLifecycle','service_request','sourceId','assignment-boundary','revisionHash',h));
  id:=(item->>'id')::uuid;
  link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.oe_assert((select provider_assignment_id is not null from public.owner_decision_link_sessions where session_id=sid),
    'session binds actual assignment identity');
  perform pg_temp.oe_delivered(ws,id);
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,id,h,'oe-owner@example.test');
  update public.workspace_providers set status='ended',ended_by=actor,ended_at=now(),end_reason='Fixture relationship ended'
    where customer_workspace_id=ws and status='active';
  perform pg_temp.oe_expect(format('select public.strelva_service_session(%L,%L,%L)',ws,sid,'owner_decision_link'),'strelva_service_access_denied');
  insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values(ws,agency,'business_choice',actor);
  perform pg_temp.oe_expect(format('select public.strelva_service_session(%L,%L,%L)',ws,sid,'owner_decision_link'),'strelva_service_access_denied');
  -- A provider seat grants no implicit owner-link execution identity.
  delete from public.workspace_memberships where workspace_id=ws and user_id=actor;
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(agency,actor,'admin',actor);
  insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values(ws,agency,'owner',actor);
  insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values(agency,ws,actor,actor);
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','request.scope','route','owner_decides','title','Seat fixture',
    'approveEffect','Internal draft.','notYetEffect','Nothing changes.','sourceLifecycle','service_request','sourceId','seat-boundary','revisionHash',h));
  id:=(item->>'id')::uuid;
  perform pg_temp.oe_assert(public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test') is null,'seat alone does not impersonate a direct business member');
  -- Restore the explicit business member and prepare a real, narrow session
  -- for the shell harness's concurrent revocation checks.
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'admin',actor);
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Race boundary',
    'approveEffect','Publish effect fixture.','notYetEffect','Nothing changes.','sourceLifecycle','service_request','sourceId','race-boundary','revisionHash',h));
  id:=(item->>'id')::uuid;
  link:=public.strelva_owner_decision_link_session(ws,id,h,'oe-owner@example.test'); sid:=(link->>'sessionId')::uuid;
  perform pg_temp.oe_delivered(ws,id);
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  perform public.authorize_owner_decision_link_run(ws,sid,id,h,'oe-owner@example.test');
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','request.scope','route','owner_decides','title','Service-role boundary',
    'approveEffect','Internal draft.','notYetEffect','Nothing changes.','sourceLifecycle','service_request','sourceId','rpc-boundary','revisionHash',h));
end $$;
-- Execute as the application database role, rather than merely inspecting ACLs.
select id as rpc_decision from public.owner_decisions where workspace_id='b2100000-0000-4000-8000-000000000001' and source_id='rpc-boundary' \gset
set local role service_role;
select pg_temp.oe_assert(public.strelva_owner_decision_link_session('b2100000-0000-4000-8000-000000000001', :'rpc_decision', repeat('d',64), 'oe-owner@example.test') is not null,
  'service-role narrow session entry works');
select pg_temp.oe_expect('select * from public.owner_decision_link_sessions', 'permission denied');
select pg_temp.oe_expect('select public.owner_decision_provider_holds(null,null,array[''publish''])', 'permission denied');
set local role authenticated;
select pg_temp.oe_expect(format('select public.strelva_owner_decision_link_session(%L,%L,%L,%L)',
  'b2100000-0000-4000-8000-000000000001', :'rpc_decision', repeat('d',64), 'oe-owner@example.test'), 'permission denied');
reset role;
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
\echo 'Owner decision effect checks passed.'
