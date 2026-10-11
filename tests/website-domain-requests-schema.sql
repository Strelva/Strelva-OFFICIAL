\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.dr_assert(v boolean,message text) returns void language plpgsql as $$ begin if v is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.dr_error(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end; raise exception 'Expected %',expected; end $$;
select pg_temp.dr_assert(not has_table_privilege('service_role','public.website_domain_requests','select'),'requests have no direct service grants');
select pg_temp.dr_assert(not has_function_privilege('authenticated','public.approve_website_domain_request(uuid,uuid,uuid,text)','execute'),'browser cannot consume decisions');
select pg_temp.dr_assert(has_function_privilege('service_role','public.approve_website_domain_request(uuid,uuid,uuid,text)','execute'),'service consumes recorded decisions');
do $$
declare
 ws uuid := '62000000-0000-4000-8000-000000000110';
 owner_id uuid := '62000000-0000-4000-8000-000000000101';
 operator_id uuid := '62000000-0000-4000-8000-000000000102';
 admin_id uuid := '62000000-0000-4000-8000-000000000103';
 req uuid := '64000000-0000-4000-8000-000000000101';
 pub public.website_document_publications;
 records jsonb := '[{"type":"A","name":"website.example.test","value":"203.0.113.10"}]';
 proposal jsonb; item jsonb; result jsonb; decision_id uuid;
 h text := repeat('a',64);
begin
 select * into pub from public.website_document_publications where workspace_id=ws and tenant_id='linked-client-renamed';
 perform pg_temp.dr_assert(pub.website_work_id is not null,'published hosted fixture exists');
 update public.tenants set owner_email='lp-owner@example.test' where id=pub.tenant_id;
 proposal:=public.prepare_website_domain_request(req,ws,pub.website_work_id,operator_id,'lp-operator@example.test',pub.tenant_id,pub.revision,pub.content_hash,'website.example.test',records,h);
 perform pg_temp.dr_assert(proposal->>'hostname'='website.example.test' and proposal->'records'=records,'provider DNS records retained exactly');
 perform pg_temp.dr_assert(proposal->>'current'='true','proposal pins current publication');
 perform pg_temp.dr_assert(public.prepare_website_domain_request(req,ws,pub.website_work_id,operator_id,'lp-operator@example.test',pub.tenant_id,pub.revision,pub.content_hash,'website.example.test',records,h)=proposal,'request replay is idempotent');
 perform pg_temp.dr_error(format('select public.prepare_website_domain_request(%L,%L,%L,%L,%L,%L,%s,%L,%L,%L,%L)',gen_random_uuid(),ws,pub.website_work_id,admin_id,'lp-admin@example.test',pub.tenant_id,pub.revision,pub.content_hash,'other.example.test',records,h),'workspace_access_denied');
 perform pg_temp.dr_error(format('select public.authorize_website_domain_request(%L,%L)',ws,req),'website_domain_owner_approval_required');
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','system.go_live','route','owner_decides','title','Connect website.example.test','detail','A website.example.test → 203.0.113.10','approveEffect','Strelva attaches this domain; DNS verification waits for you.','notYetEffect','Nothing changes.','sourceLifecycle','website_domain','sourceId',req::text,'revisionHash',h,'urgent',false,'adminMayDecide',false));
 decision_id:=(item->>'id')::uuid;
 perform pg_temp.dr_error(format('select public.approve_website_domain_request(%L,%L,%L,%L)',ws,req,decision_id,h),'website_domain_owner_approval_required');
 perform pg_temp.dr_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)',ws,decision_id,h,'approve','session',admin_id,'lp-admin@example.test'),'owner_decision_permission_denied');
 -- The owner can approve through their signed link without a session actor.
 result:=public.claim_owner_decision(ws,decision_id,h,'approve','owner_link',null,null,'lp-owner@example.test');
 perform pg_temp.dr_assert(result->>'status'='claimed','signed owner link claims domain decision');
 result:=public.approve_website_domain_request(ws,req,decision_id,h);
 perform pg_temp.dr_assert(result->>'decisionId'=decision_id::text,'request binds the recorded signed-link decision');
 result:=public.authorize_website_domain_request(ws,req);
 perform pg_temp.dr_assert(result->>'tenantId'='linked-client-renamed','authority follows stable tenant routing');
 perform pg_temp.dr_error(format('select public.approve_website_domain_request(%L,%L,%L,%L)',ws,req,decision_id,repeat('b',64)),'website_domain_request_conflict');
 -- Revoked signed-in owner authority fails even though the decision exists.
 update public.owner_decisions set decided_by_kind='owner_session',decided_by=owner_id::text where id=decision_id;
 update public.workspace_memberships set role='admin' where workspace_id=ws and user_id=owner_id;
 perform pg_temp.dr_error(format('select public.authorize_website_domain_request(%L,%L)',ws,req),'website_domain_owner_approval_required');
 -- Provider receipts remain durable even after revocation; storing evidence is no new outside write.
 result:=public.record_website_domain_request(ws,req,'{"status":"pending"}',null);
 perform pg_temp.dr_assert(result->'result'->>'status'='pending','accepted effect remains recordable after revocation');
 update public.workspace_memberships set role='owner' where workspace_id=ws and user_id=owner_id;
 update public.tenants set delivery_model='custom_repo' where id=pub.tenant_id;
 perform pg_temp.dr_error(format('select public.authorize_website_domain_request(%L,%L)',ws,req),'website_domain_request_conflict');
 perform pg_temp.dr_assert((public.list_website_domain_requests(ws)->0->>'current')='false','old links become stale when the publication no longer routes');
 update public.tenants set delivery_model='platform_template' where id=pub.tenant_id;
 update public.website_domain_requests set expires_at=clock_timestamp()-interval '1 second' where id=req;
 perform pg_temp.dr_error(format('select public.authorize_website_domain_request(%L,%L)',ws,req),'website_domain_owner_approval_required');
end $$;
rollback;
