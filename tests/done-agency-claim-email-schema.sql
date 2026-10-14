\set ON_ERROR_STOP on
-- Local disposable database only. Reservation proof; never sends real mail.
begin;
create function pg_temp.claim_assert(ok boolean,note text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'claim email assertion: %',note; end if; end$$;
insert into public.users(id,email,verified_at) values
 ('25132000-0000-4000-8000-000000000001','claim-agency@example.test',now()),
 ('25132000-0000-4000-8000-000000000002','claim-reviewer@example.test',now());
insert into public.super_admins(user_id,email) values ('25132000-0000-4000-8000-000000000002','claim-reviewer@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('25132000-0000-4000-8000-000000000010','agency','Claim agency','25132000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('25132000-0000-4000-8000-000000000010','25132000-0000-4000-8000-000000000001','owner','25132000-0000-4000-8000-000000000001');
create temporary table claim_client as select public.agency_add_client('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',
 '{"name":"Claim bakery"}',gen_random_uuid(),repeat('1',64)) body;
create temporary table claim_email as select public.issue_agency_client_owner_claim('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',
 (body->>'customerWorkspaceId')::uuid,'claim-owner@example.test',repeat('a',64),now()+interval '7 days') body from claim_client;
select pg_temp.claim_assert(not has_function_privilege('anon','public.prepare_agency_owner_claim_email(uuid,text,uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.record_agency_owner_claim_email(uuid,text,uuid,uuid,text,jsonb)','EXECUTE'),'browser roles refused');
-- Email verification is required even though this only invites ownership.
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('a',64)),'unverified email refused') from claim_email;
select public.submit_agency_qualification('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010','25132000-0000-4000-8000-000000000100','email','https://example.test/claim-proof','Tested owner invitation suppression and delivery receipt recovery');
select public.decide_agency_qualification('claim-reviewer@example.test','25132000-0000-4000-8000-000000000100','verified','Checked invitation suppression and receipt recovery evidence');
-- Wrong token cannot reserve an email. A linked existing client stays silent.
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('b',64)),'wrong token refused') from claim_email;
insert into public.tenant_workspace_links(tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 select 'claim-historical-client',(body->>'customerWorkspaceId')::uuid,'25132000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('c',64),'{}'::jsonb from claim_client;
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('a',64)),'linked legacy client refused') from claim_email;
-- A separate newly added business has no historical tenant link.
create temporary table fresh_client as select public.agency_add_client('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',
 '{"name":"New claim studio"}',gen_random_uuid(),repeat('2',64)) body;
create temporary table fresh_claim as select public.issue_agency_client_owner_claim('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',
 (body->>'customerWorkspaceId')::uuid,'new-owner@example.test',repeat('d',64),now()+interval '7 days') body from fresh_client;
-- A historical owner address is silent even on a different, unlinked business.
insert into public.tenants(id,site_name,owner_email) values('claim-email-historical','Historical client','new-owner@example.test');
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('d',64)),'historical recipient excluded across workspaces') from fresh_claim;
update public.tenants set owner_email='historical-owner@example.test' where id='claim-email-historical';
select pg_temp.claim_assert(public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('d',64)),'fresh qualified claim reserved') from fresh_claim;
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('d',64)),'lost response does not reserve twice') from fresh_claim;
select pg_temp.claim_assert(public.record_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('d',64),'{"status":"accepted","reason":"provider_accepted","decision":"R08","agencyEmailVerified":true,"providerMessageId":"fictional"}'),'acceptance saved') from fresh_claim;
select pg_temp.claim_assert(not public.prepare_agency_owner_claim_email('25132000-0000-4000-8000-000000000001','claim-agency@example.test','25132000-0000-4000-8000-000000000010',(body->>'claimId')::uuid,repeat('d',64)),'accepted delivery never retryable') from fresh_claim;
rollback;
