\set ON_ERROR_STOP on
begin;
create function pg_temp.ac_assert(ok boolean,m text) returns void language plpgsql as $$begin if ok is not true then raise exception 'agent-channel assertion: %',m;end if;end $$;
create function pg_temp.ac_expect(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm;end if;return;end;raise exception 'expected failure %',expected;end $$;
insert into public.users(id,email,verified_at) values
 ('ac161100-0000-4000-8000-000000000001','ac-owner@example.test',now()),
 ('ac161100-0000-4000-8000-000000000002','ac-agency@example.test',now()),
 ('ac161100-0000-4000-8000-000000000003','ac-staff@example.test',now()),
 ('ac161100-0000-4000-8000-000000000004','ac-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ac161100-0000-4000-8000-000000000010','customer','Agent fixture','ac161100-0000-4000-8000-000000000001'),
 ('ac161100-0000-4000-8000-000000000020','agency','Fixture agency','ac161100-0000-4000-8000-000000000002'),
 ('ac161100-0000-4000-8000-000000000030','customer','Other fixture','ac161100-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000001','owner','ac161100-0000-4000-8000-000000000001'),
 ('ac161100-0000-4000-8000-000000000020','ac161100-0000-4000-8000-000000000002','owner','ac161100-0000-4000-8000-000000000002'),
 ('ac161100-0000-4000-8000-000000000020','ac161100-0000-4000-8000-000000000003','member','ac161100-0000-4000-8000-000000000002');
insert into public.business_records(workspace_id,created_by,updated_by) values('ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000001','ac161100-0000-4000-8000-000000000001');
insert into public.business_pages(workspace_id,handle,published,published_at,updated_by) values('ac161100-0000-4000-8000-000000000010','agent-fixture',true,now(),'ac161100-0000-4000-8000-000000000001');
insert into public.business_services(id,workspace_id,name,source,verified,created_by,updated_by) values('ac161100-0000-4000-8000-000000000040','ac161100-0000-4000-8000-000000000010','Consulting','owner',true,'ac161100-0000-4000-8000-000000000001','ac161100-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
 ('ac161100-0000-4000-8000-000000000010','response_time','{"maximumHours":24}','owner',true,'ac161100-0000-4000-8000-000000000001'),
 ('ac161100-0000-4000-8000-000000000010','phone','"716-555-0100"','agent',false,'ac161100-0000-4000-8000-000000000001');
create temporary table ac_receipts(k text primary key,r jsonb);
create function pg_temp.ac_input(n text,quote boolean default false) returns jsonb language sql as $$select jsonb_build_object('origin','agent','type',case when quote then 'quote' else 'inquiry' end,'requestId','request-'||n,'agent',jsonb_build_object('name','Fixture Assistant'),'customer',jsonb_build_object('name','Dana','email','dana'||n||'@example.test'),'message','Please help with this work','serviceId','ac161100-0000-4000-8000-000000000040','fields',jsonb_build_object('scope','Review our proposal','area','Buffalo'))$$;
insert into ac_receipts values('inquiry',public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0001'),repeat('a',64),repeat('b',64),'encrypted-status-1',null));
select pg_temp.ac_assert((select count(*)=1 and bool_and(origin='agent' and source is null and agent_name='Fixture Assistant' and agent_workspace_id=workspace_id) from public.tenant_leads where workspace_id='ac161100-0000-4000-8000-000000000010'),'native canonical row, explicit attribution');
select pg_temp.ac_assert(public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0001'),repeat('a',64),repeat('c',64),'new-status',null)=(select r from ac_receipts where k='inquiry'),'replay original capability and receipt');
select pg_temp.ac_expect($q$select public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0001'),repeat('f',64),repeat('d',64),'changed-status',null)$q$,'agent_inquiry_request_conflict');
select pg_temp.ac_expect($q$select public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010','{"origin":"agent"}',repeat('f',64),repeat('d',64),'changed-status',null)$q$,'inquiry_record_invalid');
select pg_temp.ac_assert(public.read_agent_inquiry_status('workspace:ac161100-0000-4000-8000-000000000030',repeat('b',64)) is null,'cross-business status refused');
select pg_temp.ac_assert(not(public.read_agent_inquiry_status('workspace:ac161100-0000-4000-8000-000000000010',repeat('b',64)) ? 'email'),'status has no PII');
insert into ac_receipts values('quote',public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0002',true),repeat('e',64),repeat('f',64),'encrypted-status-2',null));
select pg_temp.ac_assert((select (r->>'replyBy')::timestamptz>now()+interval '23 hours' from ac_receipts where k='quote'),'owner response clock');
select pg_temp.ac_expect(format('select public.record_agent_quote(%L,%L,%L,%L,%L,10000,%L,%L)','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000004','ac-stranger@example.test',(select r->>'inquiryId' from ac_receipts where k='quote'),'ac161100-0000-4000-8000-000000000050','USD','Scope approved'),'inquiry_access_denied');
insert into ac_receipts values('price',public.record_agent_quote('ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000001','ac-owner@example.test',(select (r->>'inquiryId')::uuid from ac_receipts where k='quote'),'ac161100-0000-4000-8000-000000000050',10000,'USD','Scope approved'));
select pg_temp.ac_assert(public.read_agent_inquiry_status('workspace:ac161100-0000-4000-8000-000000000010',repeat('f',64))#>>'{quote,amountCents}'='10000','price only owner receipt');
select pg_temp.ac_expect(format('select public.record_agent_quote(%L,%L,%L,%L,%L,11000,%L,%L)','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000001','ac-owner@example.test',(select r->>'inquiryId' from ac_receipts where k='quote'),'ac161100-0000-4000-8000-000000000050','USD','Scope approved'),'agent_quote_conflict');
select public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0003'),repeat('1',64),repeat('2',64),'encrypted-status-3','content_score');
select pg_temp.ac_assert((select intake_state='held_as_spam' from public.tenant_leads where agent_request_id='request-0003'),'shared spam state');
select pg_temp.ac_assert((public.read_agent_business_profile('workspace:ac161100-0000-4000-8000-000000000010')#>>'{verification,ownerConfirmedFactCount}')::int=1,'scraped/agent facts do not verify');
-- OAuth owner tokens, code single-use, exact resource and business, expiry and revocation.
select public.issue_agent_oauth_code('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010',null,repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),array['business:read','quotes:approve']);
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),'wrong-client','https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('4',64))$q$,'oauth_invalid_grant');
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),'https://assistant.example.test/client.json','https://evil.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('4',64))$q$,'oauth_invalid_grant');
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),null,'https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('4',64))$q$,'oauth_invalid_grant');
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback','https://other.test/api/mcp/public',repeat('x',43),repeat('4',64))$q$,'oauth_invalid_grant');
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('y',43),repeat('4',64))$q$,'oauth_invalid_grant');
select public.exchange_agent_oauth_code(repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('4',64));
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('3',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('5',64))$q$,'oauth_invalid_grant');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('4',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is not null,'owner bound token live');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('4',64),'https://app.strelva.com/api/mcp/public','inquiries:read','ac161100-0000-4000-8000-000000000010') is null,'ungranted scope denied');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('4',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000030') is null,'cross-business token denied');
select public.call_agent_protected_tool(repeat('4',64),'https://app.strelva.com/api/mcp/public','read_business_context','ac161100-0000-4000-8000-000000000010','{}');
select public.revoke_agent_oauth_client_token(repeat('4',64),'wrong-client');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('4',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is not null,'wrong client cannot revoke');
select public.revoke_agent_oauth_client_token(repeat('4',64),'https://assistant.example.test/client.json');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('4',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is null,'client revocation immediately denies');
select public.issue_agent_oauth_code('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010',null,repeat('a',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),array['business:read']);
update public.assistant_authorization_codes set expires_at=clock_timestamp()-interval '1 second' where code_hash=repeat('a',64);
select pg_temp.ac_expect($q$select public.exchange_agent_oauth_code(repeat('a',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('b',64))$q$,'oauth_invalid_grant');
select public.issue_agent_oauth_code('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010',null,repeat('b',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),array['business:read']);
select public.exchange_agent_oauth_code(repeat('b',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('c',64));
update public.assistant_tokens set expires_at=clock_timestamp()-interval '1 second' where token_hash=repeat('c',64);
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('c',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is null,'expired OAuth token');
select pg_temp.ac_expect($q$select public.call_agent_protected_tool(repeat('c',64),'https://app.strelva.com/api/mcp/public','read_business_context','ac161100-0000-4000-8000-000000000010','{}')$q$,'oauth_invalid_token');
-- Exact agency × business grant. Ending and replacing a grant cannot revive its old token.
select public.choose_business_provider('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000020');
select public.set_agency_client_staff('ac161100-0000-4000-8000-000000000002','ac-agency@example.test','ac161100-0000-4000-8000-000000000020','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000003',true);
select pg_temp.ac_expect($q$select public.issue_agent_oauth_code('ac161100-0000-4000-8000-000000000003','ac-staff@example.test','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000020',repeat('6',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),array['quotes:approve'])$q$,'oauth_invalid_scope');
select public.issue_agent_oauth_code('ac161100-0000-4000-8000-000000000003','ac-staff@example.test','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000020',repeat('6',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),array['business:read']);
select public.exchange_agent_oauth_code(repeat('6',64),'client','https://a.test/callback','https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('7',64));
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('7',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is not null,'current exact agency seat');
select pg_temp.ac_assert(jsonb_array_length(public.read_agent_oauth_choices('ac161100-0000-4000-8000-000000000001','ac-owner@example.test'))=1,'business owner remains a choice while agency active');
select public.set_agency_client_staff('ac161100-0000-4000-8000-000000000002','ac-agency@example.test','ac161100-0000-4000-8000-000000000020','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000003',false);
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('7',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is null,'removed staff mandate');
select public.set_agency_client_staff('ac161100-0000-4000-8000-000000000002','ac-agency@example.test','ac161100-0000-4000-8000-000000000020','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000003',true);
select public.end_provider_seat('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000020','Fixture end');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('7',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is null,'ended agency seat');
select public.choose_business_provider('ac161100-0000-4000-8000-000000000001','ac-owner@example.test','ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000020');
select pg_temp.ac_assert(public.validate_agent_oauth_token(repeat('7',64),'https://app.strelva.com/api/mcp/public','business:read','ac161100-0000-4000-8000-000000000010') is null,'replacement provider seat cannot revive old token');
-- Disabled by default and explicit consent does not arm delivery alone.
select pg_temp.ac_assert(public.read_agent_channel_policy('workspace:ac161100-0000-4000-8000-000000000010')->>'enabled'='false','confirmation off by default');
select public.set_agent_channel_consent('ac161100-0000-4000-8000-000000000010','ac161100-0000-4000-8000-000000000001','ac-owner@example.test',true,'Customer confirmation consent');
select pg_temp.ac_assert(public.read_agent_channel_policy('workspace:ac161100-0000-4000-8000-000000000010')->>'enabled'='false','consent alone not release');
insert into public.workspace_release_flags(workspace_id,flag,state,changed_by) values('ac161100-0000-4000-8000-000000000010','agent_channel','off','ac161100-0000-4000-8000-000000000001');
select pg_temp.ac_expect($q$select public.receive_agent_inquiry('workspace:ac161100-0000-4000-8000-000000000010',pg_temp.ac_input('0004'),repeat('8',64),repeat('9',64),'encrypted-status-4',null)$q$,'inquiry_agent_disabled');
select pg_temp.ac_assert(public.read_agent_inquiry_status('workspace:ac161100-0000-4000-8000-000000000010',repeat('f',64)) is not null,'kill switch keeps existing status');
select pg_temp.ac_assert(not has_table_privilege('service_role','public.assistant_tokens','select') and not has_function_privilege('authenticated','public.issue_agent_oauth_code(uuid,text,uuid,uuid,text,text,text,text,text,text[])','execute'),'sealed table and commands');

-- Expiry is checked independently of the token's opaque format.
update public.tenant_leads set agent_status_expires_at=clock_timestamp()-interval '1 second' where agent_request_id='request-0001';
select pg_temp.ac_assert(public.read_agent_inquiry_status('workspace:ac161100-0000-4000-8000-000000000010',repeat('b',64)) is null,'expired inquiry capability');
select pg_temp.ac_expect('delete from public.agent_channel_consent_receipts','agent_channel_consent_receipt_immutable');
select pg_temp.ac_expect('delete from public.agent_quote_receipts','agent_quote_receipt_immutable');
select pg_temp.ac_expect(format('delete from public.tenant_leads where id=%L',(select r->>'inquiryId' from ac_receipts where k='quote')),'agent_quote_receipt_immutable');
-- Delete the fictional business through its existing cascade boundary: no
-- terms, visitor fields, opaque hashes/ciphertexts or grant survives it.
delete from public.workspaces where id='ac161100-0000-4000-8000-000000000010';
select pg_temp.ac_assert(not exists(select 1 from public.tenant_leads where agent_workspace_id='ac161100-0000-4000-8000-000000000010'),'native visitor records deleted with business');
select pg_temp.ac_assert(not exists(select 1 from public.agent_quote_receipts where workspace_id='ac161100-0000-4000-8000-000000000010'),'no orphan quote terms');
select pg_temp.ac_assert(not exists(select 1 from public.assistant_tokens where workspace_id='ac161100-0000-4000-8000-000000000010'),'no orphan auth token');
rollback;
