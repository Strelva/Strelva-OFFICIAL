\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.oe_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner effect assertion failed: %',message; end if; end $$;
create or replace function pg_temp.oe_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected % for %',expected,statement;
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
  perform public.claim_owner_decision(ws,id,h,'approve','owner_link',null,null,'oe-owner@example.test');
  perform pg_temp.oe_expect(format('select public.authorize_owner_decision_link_run(%L,%L,%L,%L,%L)',ws,sid,id,h,'oe-owner@example.test'),'strelva_service_access_denied');
end $$;
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
\echo 'Owner decision effect checks passed.'
