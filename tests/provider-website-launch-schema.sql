\set ON_ERROR_STOP on
-- Scoped provider launch authority (audit 2026-10-05, finding 6). Fictional
-- local fixture only; never connects to production.
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;
select pg_temp.assert_true(not has_function_privilege('service_role','public.website_document_launch_authority(uuid,uuid,uuid)','execute'),'launch authority helper is internal');

do $$
declare
  owner_id uuid := '61000000-0000-4000-8000-000000000101';
  operator_id uuid := '61000000-0000-4000-8000-000000000102';
  admin_id uuid := '61000000-0000-4000-8000-000000000103';
  ws uuid := '61000000-0000-4000-8000-000000000104';
  personal_ws uuid := '61000000-0000-4000-8000-000000000105';
  work public.saved_product_work;
  personal_work public.saved_product_work;
  doc jsonb := '{"version":2,"siteName":"Provider launch fictional","nodes":{},"pages":[],"facts":{}}';
  h text := repeat('c',64);
  rec jsonb;
  reserved text;
  payload jsonb;
begin
  insert into public.users(id,email,verified_at) values(owner_id,'pl-owner@example.test',now()),(operator_id,'pl-operator@example.test',now()),(admin_id,'pl-admin@example.test',now());
  insert into public.super_admins(user_id,email) values(operator_id,'pl-operator@example.test');
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Provider launch fictional',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id),(ws,operator_id,'admin',owner_id),(ws,admin_id,'admin',owner_id);
  payload := jsonb_build_object('version',2,'revision',0,'title','Provider launch fictional','status','building','createdBy',owner_id,'createdAt','2026-10-07T10:00:00Z','history','[]'::jsonb);
  select * into work from public.claim_website_rebuild(ws,owner_id,'pl-owner@example.test','pl-request-one','provider-launch.example.test','{"url":"https://provider-launch.example.test"}',payload);
  perform public.append_website_document(ws,work.id,operator_id,'pl-operator@example.test',0,h,doc);

  -- An operator's own approval never authorizes the operator's launch.
  perform public.approve_website_document(ws,work.id,operator_id,'pl-operator@example.test',1,h);
  perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',ws,work.id,operator_id,'pl-operator@example.test',h,'provider-launch'),'website_customer_approval_required');

  -- The customer approves the exact preview.
  perform public.approve_website_document(ws,work.id,owner_id,'pl-owner@example.test',1,h);
  -- A plain admin is still denied; only an active Strelva operator is a provider.
  perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',ws,work.id,admin_id,'pl-admin@example.test',h,'provider-launch'),'workspace_access_denied');
  -- A stale or different revision still requires approval.
  perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',ws,work.id,operator_id,'pl-operator@example.test',repeat('d',64),'provider-launch'),'website_approval_required');

  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(ws,work.id,operator_id,'pl-operator@example.test',1,h,'provider-launch') r;
  perform pg_temp.assert_true(reserved='provider-launch','provider reserves the hosted tenant on the customer approval');
  perform pg_temp.assert_true(exists(select 1 from public.memberships where tenant_id='provider-launch' and user_id=owner_id and role='owner'),'the business owner owns the hosted tenant');
  perform pg_temp.assert_true(not exists(select 1 from public.memberships where tenant_id='provider-launch' and user_id in (operator_id,admin_id)),'the provider gains no native tenant membership');
  perform pg_temp.assert_true((select owner_email from public.tenants where id='provider-launch')='pl-owner@example.test','tenant owner email is the approving owner, not the operator');
  perform pg_temp.assert_true((select created_by from public.website_hosted_tenant_reservations where website_work_id=work.id)=operator_id,'reservation records who launched');
  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(ws,work.id,operator_id,'pl-operator@example.test',1,h,'renamed-hint') r;
  perform pg_temp.assert_true(reserved='provider-launch','provider reservation replay reopens the same tenant');

  rec := jsonb_build_object('status','published','provider','strelva-hosted','artifactHash',h,'candidateRevision',1,'receiptId','provider-launch-receipt','providerUrl','https://provider-launch.strelva.com','evidence','Fictional local publication','publishedAt','2026-10-07T10:00:00Z');
  perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,admin_id,'pl-admin@example.test',h,'provider-launch',rec),'workspace_access_denied');
  perform public.publish_website_document(ws,work.id,operator_id,'pl-operator@example.test',1,h,'provider-launch',rec);
  perform pg_temp.assert_true((select count(*) from public.read_published_website_documents('provider-launch'))=1,'provider publishes the approved revision');
  perform pg_temp.assert_true((select approved_by from public.website_document_heads where website_work_id=work.id)=owner_id,'the customer approval is preserved through launch');

  -- A revoked operator loses provider authority immediately.
  update public.super_admins set revoked_at=now() where user_id=operator_id;
  perform pg_temp.expect_error(format('select public.publish_website_document(%L,%L,%L,%L,1,%L,%L,%L)',ws,work.id,operator_id,'pl-operator@example.test',h,'provider-launch',rec),'workspace_access_denied');
  update public.super_admins set revoked_at=null where user_id=operator_id;

  -- Provider authority is scoped to customer workspaces.
  insert into public.workspaces(id,kind,name,created_by) values(personal_ws,'personal','Personal provider fictional',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(personal_ws,owner_id,'owner',owner_id),(personal_ws,operator_id,'admin',owner_id);
  select * into personal_work from public.claim_website_rebuild(personal_ws,owner_id,'pl-owner@example.test','pl-request-two','provider-personal.example.test','{}',payload);
  perform public.append_website_document(personal_ws,personal_work.id,owner_id,'pl-owner@example.test',0,h,doc);
  perform public.approve_website_document(personal_ws,personal_work.id,owner_id,'pl-owner@example.test',1,h);
  perform pg_temp.expect_error(format('select public.reserve_website_hosted_tenant(%L,%L,%L,%L,1,%L,%L)',personal_ws,personal_work.id,operator_id,'pl-operator@example.test',h,'provider-personal'),'workspace_access_denied');
  -- Owners keep launching exactly as before.
  select r.tenant_id into reserved from public.reserve_website_hosted_tenant(personal_ws,personal_work.id,owner_id,'pl-owner@example.test',1,h,'provider-personal') r;
  perform pg_temp.assert_true(reserved='provider-personal','owner launch is unchanged');
end $$;
