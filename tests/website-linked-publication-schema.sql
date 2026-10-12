\set ON_ERROR_STOP on
-- Publishing a rebuild onto a linked tenant, current routing after a rename,
-- the business template for new hosted tenants, and operator domain work on
-- the owner's approval. Fictional local fixture only; never connects to
-- production.
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;

-- Exposure: every new function is service-role only; internal helpers are not even that.
select pg_temp.assert_true(not has_function_privilege('authenticated','public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb)','execute'),'linked publish is not callable by browsers');
select pg_temp.assert_true(has_function_privilege('service_role','public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb)','execute'),'linked publish is service-role');
select pg_temp.assert_true(not has_function_privilege('anon','public.read_website_current_tenant(uuid,uuid,uuid,text)','execute'),'current tenant read is not public');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text)','execute'),'domain authority is not callable by browsers');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.approve_website_domain_change(uuid,uuid,uuid,text,text,text)','execute'),'domain approval is not callable by browsers');
select pg_temp.assert_true(not has_function_privilege('service_role','public.website_business_template(uuid)','execute'),'template helper is internal');
select pg_temp.assert_true(not has_table_privilege('service_role','public.website_linked_publications','select'),'linked publications are reached through functions only');
select pg_temp.assert_true(not has_table_privilege('service_role','public.website_domain_approvals','insert'),'domain approvals are reached through functions only');

do $$
declare
  owner_id uuid := '62000000-0000-4000-8000-000000000101';
  operator_id uuid := '62000000-0000-4000-8000-000000000102';
  admin_id uuid := '62000000-0000-4000-8000-000000000103';
  member_id uuid := '62000000-0000-4000-8000-000000000104';
  outsider_id uuid := '62000000-0000-4000-8000-000000000105';
  ws uuid := '62000000-0000-4000-8000-000000000110';
  other_ws uuid := '62000000-0000-4000-8000-000000000111';
  fresh_ws uuid := '62000000-0000-4000-8000-000000000112';
  lp_agency uuid := '62000000-0000-4000-8000-000000000120';
  acting boolean := to_regprocedure('public.acting_provider(uuid,uuid,text,text,text)') is not null;
  host text;
  work public.saved_product_work;
  second public.saved_product_work;
  fresh public.saved_product_work;
  doc jsonb := '{"version":2,"siteName":"Linked fictional rebuild","nodes":{},"pages":[],"facts":{}}';
  doc2 jsonb := '{"version":2,"siteName":"Second fictional rebuild","nodes":{},"pages":[],"facts":{}}';
  h text := repeat('e',64);
  h2 text := repeat('f',64);
  stable uuid;
  rec jsonb;
  rec2 jsonb;
  result jsonb;
  payload jsonb;
  reserved text;
  authority text;
begin
  insert into public.users(id,email,verified_at) values
    (owner_id,'lp-owner@example.test',now()),(operator_id,'lp-operator@example.test',now()),(admin_id,'lp-admin@example.test',now()),
    (member_id,'lp-member@example.test',now()),(outsider_id,'lp-outsider@example.test',now());
  insert into public.super_admins(user_id,email) values(operator_id,'lp-operator@example.test');
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Linked fictional business',owner_id),(other_ws,'customer','Other fictional business',outsider_id),(fresh_ws,'customer','Fresh fictional business',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
    (ws,owner_id,'owner',owner_id),(ws,operator_id,'admin',owner_id),(ws,admin_id,'admin',owner_id),(ws,member_id,'member',owner_id),
    (other_ws,outsider_id,'owner',outsider_id),(fresh_ws,owner_id,'owner',owner_id);
  -- After 20261014112000 the operator's provider path is an agency's, as for
  -- every agency: a seat, a staff row, publish verification and the owner's
  -- mandate for each hostname. super_admins alone grants nothing.
  if acting then
    insert into public.workspaces(id,kind,name,created_by) values(lp_agency,'agency','Linked fixture agency',operator_id);
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(lp_agency,operator_id,'owner',operator_id);
    insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values(ws,lp_agency,'owner',owner_id);
    insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values(lp_agency,ws,operator_id,operator_id);
    perform public.record_agency_verification('lp-operator@example.test',lp_agency,'publish','verified','{"fixture":true}',null);
    foreach host in array array['www.linked-client.example.test','other.example.test','shop.linked-client.example.test','old.linked-client.example.test'] loop
      perform public.grant_client_resource_mandate(owner_id,'lp-owner@example.test',ws,lp_agency,'publish','domain',host);
    end loop;
  end if;
  -- A custom-repo client site, converted into this business. The owner holds no native tenant membership.
  insert into public.tenants(id,site_name,template,industry,delivery_model) values('linked-client','Linked Client Co','restaurant','food','custom_repo');
  insert into public.tenants(id,site_name,template,industry,delivery_model) values('unlinked-client','Unlinked Client Co','trades','trades','custom_repo');
  select stable_id into stable from public.tenants where id='linked-client';
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    values(stable,'linked-client',ws,operator_id,'62000000-0000-4000-8000-0000000001a1',repeat('a',64),'{"fixture":true}');

  payload := jsonb_build_object('version',2,'revision',0,'title','Linked fictional rebuild','status','building','createdBy',owner_id,'createdAt','2026-10-08T10:00:00Z','history','[]'::jsonb);
  select * into work from public.claim_website_rebuild(ws,owner_id,'lp-owner@example.test','lp-request-one','linked-client.example.test','{"url":"https://linked-client.example.test"}',payload);
  perform public.append_website_document(ws,work.id,owner_id,'lp-owner@example.test',0,h,doc);
  rec := jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h,'candidateRevision',1,'receiptId','linked-receipt-one','providerUrl','https://linked-client.strelva.com/','evidence','Fictional local publication','publishedAt','2026-10-08T10:00:00Z');

  -- Unapproved: refused.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,owner_id,'lp-owner@example.test',h,'linked-client',rec),'website_approval_required');
  perform public.approve_website_document(ws,work.id,owner_id,'lp-owner@example.test',1,h);
  -- Stale approval hash: refused.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,owner_id,'lp-owner@example.test',repeat('d',64),'linked-client',rec),'website_approval_required');
  -- Not the owner: an admin, a Strelva operator and a member are all refused.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,admin_id,'lp-admin@example.test',h,'linked-client',rec),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test',h,'linked-client',rec),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,member_id,'lp-member@example.test',h,'linked-client',rec),'workspace_access_denied');
  -- Another business's owner: refused.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,outsider_id,'lp-outsider@example.test',h,'linked-client',rec),'workspace_access_denied');
  -- A tenant not linked to this business: refused, and the tenant is untouched.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,owner_id,'lp-owner@example.test',h,'unlinked-client',rec),'website_tenant_not_linked');
  perform pg_temp.assert_true((select delivery_model from public.tenants where id='unlinked-client')='custom_repo','an unlinked tenant keeps its delivery model');
  -- A receipt for another revision: refused.
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,owner_id,'lp-owner@example.test',h,'linked-client',rec||'{"candidateRevision":2}'),'website_receipt_invalid');

  result := public.publish_website_document_to_linked_tenant(ws,work.id,owner_id,'lp-owner@example.test',1,h,'linked-client',rec);
  perform pg_temp.assert_true(result->>'tenant_id'='linked-client','publishes onto the linked tenant');
  perform pg_temp.assert_true(result->>'prior_delivery_model'='custom_repo','reports the prior delivery model');
  perform pg_temp.assert_true((result->>'fallback_until')::timestamptz between now()+interval '29 days' and now()+interval '31 days','records a 30-day fallback window');
  perform pg_temp.assert_true((select delivery_model from public.tenants where id='linked-client')='platform_template','delivery model flips');
  perform pg_temp.assert_true((select stable_id from public.tenants where id='linked-client')=stable,'stable_id is kept');
  perform pg_temp.assert_true((select template||'/'||industry||'/'||site_name from public.tenants where id='linked-client')='restaurant/food/Linked Client Co','template, industry and site name are kept');
  perform pg_temp.assert_true((select count(*) from public.read_published_website_documents('linked-client'))=1,'the document is the published revision');
  perform pg_temp.assert_true((select count(*) from public.website_linked_publications where website_work_id=work.id)=1,'one linked publication is recorded');
  perform pg_temp.assert_true(not exists(select 1 from public.memberships where tenant_id='linked-client'),'no native tenant membership is granted');
  -- Replay of the same revision is idempotent.
  result := public.publish_website_document_to_linked_tenant(ws,work.id,owner_id,'lp-owner@example.test',1,h,'linked-client',rec);
  perform pg_temp.assert_true((select count(*) from public.website_linked_publications where website_work_id=work.id)=1,'replay records nothing new');
  perform pg_temp.assert_true((select count(*) from public.website_document_receipts where website_work_id=work.id)=1,'replay issues no second receipt');
  -- Linked publications never rewrite.
  perform pg_temp.expect_error(format('update public.website_linked_publications set fallback_until=now() where website_work_id=%L',work.id),'website_linked_publication_immutable');
  perform pg_temp.expect_error(format('delete from public.website_linked_publications where website_work_id=%L',work.id),'website_linked_publication_immutable');

  -- A second document cannot take over the same site.
  select * into second from public.claim_website_rebuild(ws,owner_id,'lp-owner@example.test','lp-request-two','second-client.example.test','{"url":"https://second-client.example.test"}',payload);
  perform public.append_website_document(ws,second.id,owner_id,'lp-owner@example.test',0,h2,doc2);
  perform public.approve_website_document(ws,second.id,owner_id,'lp-owner@example.test',1,h2);
  rec2 := jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h2,'candidateRevision',1,'receiptId','linked-receipt-two','providerUrl','https://linked-client.strelva.com/','evidence','Fictional','publishedAt','2026-10-08T10:00:00Z');
  perform pg_temp.expect_error(format('select public.publish_website_document_to_linked_tenant(%L,%L,%L,%L,1,%L,%L,%L)',ws,second.id,owner_id,'lp-owner@example.test',h2,'linked-client',rec2),'website_publication_conflict');

  -- The workspace owner of a linked tenant manages its published site; others do not.
  perform public.manage_published_website_tenant(ws,work.id,owner_id,'lp-owner@example.test','linked-client');
  perform pg_temp.expect_error(format('select public.manage_published_website_tenant(%L,%L,%L,%L,%L)',ws,work.id,admin_id,'lp-admin@example.test','linked-client'),'website_tenant_access_denied');
  perform pg_temp.expect_error(format('select public.manage_published_website_tenant(%L,%L,%L,%L,%L)',ws,work.id,outsider_id,'lp-outsider@example.test','linked-client'),'workspace_access_denied');

  -- Current routing: members read it; another business cannot.
  perform pg_temp.assert_true((select tenant_id from public.read_website_current_tenant(ws,work.id,member_id,'lp-member@example.test'))='linked-client','a member reads the current tenant');
  perform pg_temp.expect_error(format('select * from public.read_website_current_tenant(%L,%L,%L,%L)',ws,work.id,outsider_id,'lp-outsider@example.test'),'workspace_access_denied');

  -- Operator domain work needs the owner's approval of that exact hostname.
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test','attach'),'website_domain_owner_approval_required');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,admin_id,'lp-admin@example.test','linked-client','www.linked-client.example.test','attach'),'website_tenant_access_denied');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,member_id,'lp-member@example.test','linked-client','www.linked-client.example.test','attach'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test','remove'),'website_domain_action_invalid');
  -- Only an owner approves; an operator cannot approve its own work.
  perform pg_temp.expect_error(format('select public.approve_website_domain_change(%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test'),'website_tenant_access_denied');
  perform pg_temp.expect_error(format('select public.approve_website_domain_change(%L,%L,%L,%L,%L,%L)',ws,work.id,owner_id,'lp-owner@example.test','linked-client','not a domain'),'website_domain_invalid');
  result := public.approve_website_domain_change(ws,work.id,owner_id,'lp-owner@example.test','linked-client','WWW.Linked-Client.example.test');
  perform pg_temp.assert_true(result->>'hostname'='www.linked-client.example.test','approval stores the normalized hostname');
  authority := public.authorize_website_domain_change(ws,work.id,owner_id,'lp-owner@example.test','linked-client','anything.example.test','attach');
  perform pg_temp.assert_true(authority='owner','the owner keeps owner authority');
  authority := public.authorize_website_domain_change(ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test','attach');
  perform pg_temp.assert_true(authority='provider','the operator works on the owner approval');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','other.example.test','attach'),'website_domain_owner_approval_required');
  -- Checking a hostname the site already holds needs no new approval.
  insert into public.domain_claims(tenant_id,domain,role,status) values('linked-client','shop.linked-client.example.test','additional','pending');
  authority := public.authorize_website_domain_change(ws,work.id,operator_id,'lp-operator@example.test','linked-client','shop.linked-client.example.test','refresh');
  perform pg_temp.assert_true(authority='provider','refreshing an attached domain is checking');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','shop.linked-client.example.test','attach'),'website_domain_owner_approval_required');
  -- A revoked operator loses it at once.
  if acting then
    perform public.set_agency_client_staff(operator_id,'lp-operator@example.test',lp_agency,ws,operator_id,false);
  else
    update public.super_admins set revoked_at=now() where user_id=operator_id;
  end if;
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test','attach'),'website_tenant_access_denied');
  if acting then
    perform public.set_agency_client_staff(operator_id,'lp-operator@example.test',lp_agency,ws,operator_id,true);
  else
    update public.super_admins set revoked_at=null where user_id=operator_id;
  end if;
  -- An expired approval does not count.
  insert into public.website_domain_approvals(workspace_id,website_work_id,tenant_stable_id,hostname,approved_by,approved_at,expires_at)
    values(ws,work.id,stable,'old.linked-client.example.test',owner_id,now()-interval '20 days',now()-interval '6 days');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','old.linked-client.example.test','attach'),'website_domain_owner_approval_required');
  perform pg_temp.expect_error(format('update public.website_domain_approvals set expires_at=now()+interval ''1 day'' where hostname=%L','old.linked-client.example.test'),'website_domain_approval_immutable');

  -- The focused cluster's domain_claims fixture has no on-update cascade
  -- (production's slug FKs do, 20260715160000); clear it before renaming.
  delete from public.domain_claims where tenant_id='linked-client';
  -- Rename: routing follows the slug, the issued receipt does not change, and
  -- the owner's domain approval (bound to stable identity) still holds.
  update public.tenants set id='linked-client-renamed' where id='linked-client';
  perform pg_temp.assert_true((select tenant_id from public.read_website_current_tenant(ws,work.id,owner_id,'lp-owner@example.test'))='linked-client-renamed','routing follows the rename');
  perform pg_temp.assert_true((select source from public.read_website_current_tenant(ws,work.id,owner_id,'lp-owner@example.test'))='publication','routing reads the publication');
  perform pg_temp.assert_true((select receipt->>'providerUrl' from public.website_document_receipts where website_work_id=work.id)='https://linked-client.strelva.com/','the issued receipt is unchanged');
  perform pg_temp.assert_true((select tenant_slug_at_publication from public.read_website_linked_publications(ws,work.id,owner_id,'lp-owner@example.test'))='linked-client','history keeps the slug at publication');
  perform pg_temp.assert_true((select tenant_id from public.read_website_linked_publications(ws,work.id,owner_id,'lp-owner@example.test'))='linked-client-renamed','history resolves the current slug');
  perform public.manage_published_website_tenant(ws,work.id,owner_id,'lp-owner@example.test','linked-client-renamed');
  authority := public.authorize_website_domain_change(ws,work.id,operator_id,'lp-operator@example.test','linked-client-renamed','www.linked-client.example.test','attach');
  perform pg_temp.assert_true(authority='provider','the approval survives the rename');
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client','www.linked-client.example.test','attach'),'website_tenant_access_denied');
  perform pg_temp.assert_true((select count(*) from public.read_website_domain_approvals(ws,work.id,member_id,'lp-member@example.test') where current)=1,'members read which approvals are current');
  -- An approver who is no longer an owner no longer authorizes the operator.
  update public.workspace_memberships set role='admin' where workspace_id=ws and user_id=owner_id;
  perform pg_temp.expect_error(format('select public.authorize_website_domain_change(%L,%L,%L,%L,%L,%L,%L)',ws,work.id,operator_id,'lp-operator@example.test','linked-client-renamed','www.linked-client.example.test','attach'),'website_domain_owner_approval_required');
  update public.workspace_memberships set role='owner' where workspace_id=ws and user_id=owner_id;

  -- A new hosted tenant takes the business's real template, never wellness by default.
  select * into fresh from public.claim_website_rebuild(fresh_ws,owner_id,'lp-owner@example.test','lp-request-three','fresh-client.example.test','{"url":"https://fresh-client.example.test"}',payload);
  perform public.append_website_document(fresh_ws,fresh.id,owner_id,'lp-owner@example.test',0,h,doc);
  perform public.approve_website_document(fresh_ws,fresh.id,owner_id,'lp-owner@example.test',1,h);
  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(fresh_ws,fresh.id,owner_id,'lp-owner@example.test',1,h,'fresh-hosted') r;
  perform pg_temp.assert_true((select template from public.tenants where id=reserved)='professional','no linked site: the neutral professional template');
  select * into fresh from public.claim_website_rebuild(ws,owner_id,'lp-owner@example.test','lp-request-four','another-client.example.test','{"url":"https://another-client.example.test"}',payload);
  perform public.append_website_document(ws,fresh.id,owner_id,'lp-owner@example.test',0,h,doc);
  perform public.approve_website_document(ws,fresh.id,owner_id,'lp-owner@example.test',1,h);
  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(ws,fresh.id,owner_id,'lp-owner@example.test',1,h,'another-hosted') r;
  perform pg_temp.assert_true((select template||'/'||industry from public.tenants where id=reserved)='restaurant/food','the business template and industry come from its linked site');
  perform pg_temp.assert_true((select tenant_id from public.read_website_current_tenant(ws,fresh.id,owner_id,'lp-owner@example.test'))='another-hosted','a reserved tenant routes before publication');
  update public.tenants set id='another-hosted-renamed' where id='another-hosted';
  perform pg_temp.assert_true((select tenant_id||'/'||source from public.read_website_current_tenant(ws,fresh.id,owner_id,'lp-owner@example.test'))='another-hosted-renamed/reservation','reservation routing follows the rename');
end $$;
