\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.entry_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business entry assertion failed: %',message; end if; end; $$;
select pg_temp.entry_assert(
 not has_function_privilege('anon','public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)','EXECUTE')
 and has_function_privilege('service_role','public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)','EXECUTE')
 and not has_table_privilege('service_role','public.workspace_creation_receipts','SELECT'),
 'only the actor-checked server RPC is exposed');
insert into public.users(id,email,verified_at) values
 ('b9100000-0000-4000-8000-000000000001','business-owner@example.test',now()),
 ('b9100000-0000-4000-8000-000000000002','business-stranger@example.test',now()),
 ('b9100000-0000-4000-8000-000000000003','business-unverified@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
 ('b9100000-0000-4000-8000-000000000010','personal','Unrelated personal work','b9100000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b9100000-0000-4000-8000-000000000010','b9100000-0000-4000-8000-000000000001','owner','b9100000-0000-4000-8000-000000000001');
create temporary table entry_result(value jsonb);
insert into entry_result select public.enter_customer_business(
 'b9100000-0000-4000-8000-000000000001','business-owner@example.test','Juniper',null,'Have Strelva build our website.',
 'b9100000-0000-4000-8000-000000000020',repeat('a',64));
select pg_temp.entry_assert((select count(*) from public.workspaces where created_by='b9100000-0000-4000-8000-000000000001')=2,'one customer business plus unchanged personal workspace');
select pg_temp.entry_assert((select kind from public.workspaces where id='b9100000-0000-4000-8000-000000000010')='personal','personal work is not converted');
select pg_temp.entry_assert(exists(select 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id where w.id=(select (value->>'workspaceId')::uuid from entry_result) and w.kind='customer' and m.user_id='b9100000-0000-4000-8000-000000000001' and m.role='owner'),'explicit customer ownership exists');
select pg_temp.entry_assert(exists(select 1 from public.service_requests where id=(select (value->>'requestId')::uuid from entry_result) and business_workspace_id=(select (value->>'workspaceId')::uuid from entry_result) and provider_acceptance='pending' and accepted_by is null and delivery_commitment is null and delivery_id is null),'request saved without accepting provider, terms, or delivery');
select pg_temp.entry_assert(not exists(select 1 from public.offering_website_bindings where business_workspace_id=(select (value->>'workspaceId')::uuid from entry_result)),'setup does not fabricate a website');
select pg_temp.entry_assert(public.enter_customer_business('b9100000-0000-4000-8000-000000000001','business-owner@example.test','Juniper',null,'Have Strelva build our website.','b9100000-0000-4000-8000-000000000020',repeat('a',64)) = ((select value from entry_result)||'{"alreadyCreated":true}'::jsonb),'retry recovers exact business and request');
select pg_temp.entry_assert((select count(*) from public.service_requests where business_workspace_id=(select (value->>'workspaceId')::uuid from entry_result))=1,'retry did not duplicate request');
do $$ begin
 begin perform public.enter_customer_business('b9100000-0000-4000-8000-000000000001','business-owner@example.test','Different',null,'Another request','b9100000-0000-4000-8000-000000000020',repeat('b',64)); raise exception 'expected digest conflict'; exception when others then if sqlerrm <> 'business_entry_idempotency_conflict' then raise; end if; end;
 begin perform public.enter_customer_business('b9100000-0000-4000-8000-000000000002','business-stranger@example.test',null,(select (value->>'workspaceId')::uuid from entry_result),null,'b9100000-0000-4000-8000-000000000021',repeat('c',64)); raise exception 'expected access denial'; exception when others then if sqlerrm <> 'service_request_access_denied' then raise; end if; end;
 begin perform public.enter_customer_business('b9100000-0000-4000-8000-000000000003','business-unverified@example.test','Unverified',null,null,'b9100000-0000-4000-8000-000000000022',repeat('d',64)); raise exception 'expected identity denial'; exception when others then if sqlerrm <> 'verified_identity_required' then raise; end if; end;
end; $$;
select pg_temp.entry_assert((public.enter_customer_business('b9100000-0000-4000-8000-000000000001','business-owner@example.test',null,(select (value->>'workspaceId')::uuid from entry_result),null,'b9100000-0000-4000-8000-000000000023',repeat('e',64))->>'workspaceId')=(select value->>'workspaceId' from entry_result),'existing selection keeps business identity');
-- A storage failure after creating ownership must roll the entire operation back.
create function pg_temp.reject_entry_request() returns trigger language plpgsql as $$ begin if new.request_text='__reject_test__' then raise exception 'synthetic_request_failure'; end if; return new; end; $$;
create trigger entry_reject_test before insert on public.service_requests for each row execute function pg_temp.reject_entry_request();
do $$ begin
 begin perform public.enter_customer_business('b9100000-0000-4000-8000-000000000001','business-owner@example.test','Rolled back business',null,'__reject_test__','b9100000-0000-4000-8000-000000000024',repeat('f',64)); raise exception 'expected synthetic failure'; exception when others then if sqlerrm <> 'synthetic_request_failure' then raise; end if; end;
end; $$;
drop trigger entry_reject_test on public.service_requests;
select pg_temp.entry_assert(not exists(select 1 from public.workspaces where name='Rolled back business'),'failed request leaves no orphan business');
select pg_temp.entry_assert(not exists(select 1 from public.workspace_creation_receipts where command_id='b9100000-0000-4000-8000-000000000024'),'failed request leaves no success receipt');
-- Replays cannot recover formerly authorized private data after revocation.
delete from public.workspace_memberships where workspace_id=(select (value->>'workspaceId')::uuid from entry_result) and user_id='b9100000-0000-4000-8000-000000000001';
do $$ begin
 begin perform public.enter_customer_business('b9100000-0000-4000-8000-000000000001','business-owner@example.test','Juniper',null,'Have Strelva build our website.','b9100000-0000-4000-8000-000000000020',repeat('a',64)); raise exception 'expected revoked replay denial'; exception when others then if sqlerrm <> 'service_request_access_denied' then raise; end if; end;
end; $$;
rollback;
