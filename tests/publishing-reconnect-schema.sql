\set ON_ERROR_STOP on
begin;
create function pg_temp.pr_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'publishing reconnect assertion failed: %', message; end if; end; $$;
select pg_temp.pr_assert((select relrowsecurity from pg_class where oid = 'public.publishing_google_outages'::regclass), 'RLS');
select pg_temp.pr_assert(not has_table_privilege('service_role','public.publishing_google_outages','select')
  and not has_function_privilege('anon','public.publishing_google_reconnect(text,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','public.publishing_google_reconnect(text,uuid,jsonb)','execute'), 'service-only RPC, no direct table access');
insert into public.users(id,email,verified_at) values ('ac000000-0000-4000-8000-000000000001','reconnect-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('ac000000-0000-4000-8000-000000000010','customer','Reconnect fixture','ac000000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values ('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values
  ('ac000000-0000-4000-8000-000000000010','owner_recipient','{"email":"reconnect-owner@example.test","name":"Fixture owner"}','owner','ac000000-0000-4000-8000-000000000001');
insert into public.workspace_account_bindings(id,workspace_id,provider,status,migrated_from) values
  ('ac000000-0000-4000-8000-000000000012','ac000000-0000-4000-8000-000000000010','google','revoked','oauth');
create temp table pr_target as select public.publishing_google_reconnect('prepare','ac000000-0000-4000-8000-000000000012') as target;
select pg_temp.pr_assert(target->>'recipient'='reconnect-owner@example.test', 'owner without a membership receives a capability') from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('prepare','ac000000-0000-4000-8000-000000000012')->>'id'=target->>'id', 'one outage across repeated prepare') from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('read',(target->>'id')::uuid) is not null, 'read does not consume') from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('notice_claim',(target->>'id')::uuid) is not null, 'one delivery claim') from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('notice_claim',(target->>'id')::uuid) is null, 'concurrent delivery cannot claim again') from pr_target;
select public.publishing_google_reconnect('notice',(target->>'id')::uuid,'{"status":"accepted","providerMessageId":"fixture-email"}') from pr_target;
select public.publishing_google_reconnect('notice',(target->>'id')::uuid,'{"status":"failed"}') from pr_target;
select pg_temp.pr_assert((select notice_status='accepted' and provider_message_id='fixture-email' from public.publishing_google_outages), 'accepted notice is never made retryable');
select public.publishing_google_reconnect('begin',(target->>'id')::uuid,jsonb_build_object('browserHash',repeat('a',64),'stateHash',repeat('b',64))) from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('begin',(target->>'id')::uuid,jsonb_build_object('browserHash',repeat('a',64),'stateHash',repeat('b',64))) is null, 'single OAuth initiation') from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('consume',(target->>'id')::uuid,jsonb_build_object('browserHash',repeat('c',64),'stateHash',repeat('b',64))) is null, 'different browser refused') from pr_target;
select public.publishing_google_reconnect('consume',(target->>'id')::uuid,jsonb_build_object('browserHash',repeat('a',64),'stateHash',repeat('b',64))) from pr_target;
select pg_temp.pr_assert(public.publishing_google_reconnect('consume',(target->>'id')::uuid,jsonb_build_object('browserHash',repeat('a',64),'stateHash',repeat('b',64))) is null, 'callback replay refused') from pr_target;
update public.business_record_facts set value='{"email":"replacement@example.test","name":"New owner"}' where workspace_id='ac000000-0000-4000-8000-000000000010';
select pg_temp.pr_assert(public.publishing_google_reconnect('read',(target->>'id')::uuid) is null, 'owner replacement revokes old link') from pr_target;
update public.workspace_account_bindings set status='connected' where id='ac000000-0000-4000-8000-000000000012';
select public.publishing_google_reconnect('list');
select pg_temp.pr_assert((select restored_at is not null from public.publishing_google_outages), 'session reconnect ends outage episode');
update public.workspace_account_bindings set status='revoked' where id='ac000000-0000-4000-8000-000000000012';
select pg_temp.pr_assert(public.publishing_google_reconnect('prepare','ac000000-0000-4000-8000-000000000012')->>'id'<>target->>'id', 'later revocation creates a distinct episode') from pr_target;
update public.publishing_google_outages set expires_at=clock_timestamp()-interval '1 second' where restored_at is null;
select pg_temp.pr_assert(public.publishing_google_reconnect('prepare','ac000000-0000-4000-8000-000000000012') is null, 'expired capability cannot begin');
rollback;
