\set ON_ERROR_STOP on
begin;
create function pg_temp.claim_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'owner claim assertion failed: %', label; end if; end; $$;
insert into public.users(id,email,verified_at) values
 ('ca000000-0000-4000-8000-000000000001','claim-operator@example.test',now()),
 ('ca000000-0000-4000-8000-000000000002','claim-owner@example.test',now()),
 ('ca000000-0000-4000-8000-000000000003','claim-other@example.test',now());
insert into public.super_admins(user_id,email) values ('ca000000-0000-4000-8000-000000000001','claim-operator@example.test');
insert into public.tenants(id) values ('claim-site'), ('claim-other-site');
select public.convert_tenant_to_business('claim-operator@example.test','claim-site',
 jsonb_build_object('tenantId','claim-site','tenantStableId',(select stable_id from public.tenants where id='claim-site'),
 'workspaceName','Claim Fixture','billing',null,'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),
 'ca000000-0000-4000-8000-000000000010',repeat('c',64));
select public.create_operator_owner_invitation('claim-operator@example.test',
 (select workspace_id from public.tenant_workspace_links where tenant_slug_at_link='claim-site'),
 'claim-owner@example.test',encode(sha256(convert_to('owner-invitation-claim-fixture','UTF8')),'hex'),now()+interval '14 days');
select pg_temp.claim_assert(public.claim_pending_business_owner('ca000000-0000-4000-8000-000000000003','claim-other@example.test','claim-site') is null,'address match alone grants nothing');
select pg_temp.claim_assert(public.claim_pending_business_owner('ca000000-0000-4000-8000-000000000002','claim-owner@example.test','claim-other-site') is null,'invitation scoped to trusted tenant');
select pg_temp.claim_assert(public.claim_pending_business_owner('ca000000-0000-4000-8000-000000000002','CLAIM-OWNER@example.test','claim-site') =
 (select workspace_id from public.tenant_workspace_links where tenant_slug_at_link='claim-site'),'claims exactly issued invitation');
select pg_temp.claim_assert(exists(select 1 from public.workspace_memberships where user_id='ca000000-0000-4000-8000-000000000002' and role='owner') and
 exists(select 1 from public.memberships where user_id='ca000000-0000-4000-8000-000000000002' and tenant_id='claim-site' and role='owner'),'both memberships');
select pg_temp.claim_assert(public.claim_pending_business_owner('ca000000-0000-4000-8000-000000000002','claim-owner@example.test','claim-site') is null,'replay grants nothing again');
select pg_temp.claim_assert(not has_function_privilege('anon','public.claim_pending_business_owner(uuid,text,text)','execute') and
 not has_function_privilege('authenticated','public.claim_pending_business_owner(uuid,text,text)','execute'),'service only');
rollback;
