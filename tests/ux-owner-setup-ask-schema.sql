\set ON_ERROR_STOP on
begin;
create function pg_temp.owner_setup_assert(condition boolean, detail text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner setup assertion failed: %',detail; end if; end; $$;
insert into public.users(id,email,verified_at) values
 ('ab200000-0000-4000-8000-000000000001','ux-owner@example.test',now()),
 ('ab200000-0000-4000-8000-000000000002','ux-other@example.test',now()),
 ('ab200000-0000-4000-8000-000000000003','ux-unverified@example.test',null);
create temporary table setup_result(value jsonb);
insert into setup_result select public.enter_customer_business(
 'ab200000-0000-4000-8000-000000000001','ux-owner@example.test','Owner setup fixture',null,'Build a website with booking information.',
 'ab200000-0000-4000-8000-000000000010',repeat('a',64));
select pg_temp.owner_setup_assert((select value->>'requestId' is null and value->>'askConversationId' is not null from setup_result),'no agency job; own ask saved');
select pg_temp.owner_setup_assert(exists(select 1 from public.ask_messages m join public.ask_conversations c on c.id=m.conversation_id
 where m.conversation_id=(select (value->>'askConversationId')::uuid from setup_result)
 and m.workspace_id=(select (value->>'workspaceId')::uuid from setup_result) and m.role='user'
 and m.content='Build a website with booking information.' and c.created_by='ab200000-0000-4000-8000-000000000001'),'exact owner words in exact business');
select pg_temp.owner_setup_assert(public.enter_customer_business('ab200000-0000-4000-8000-000000000001','ux-owner@example.test','Owner setup fixture',null,
 'Build a website with booking information.','ab200000-0000-4000-8000-000000000010',repeat('a',64))=((select value from setup_result)||'{"alreadyCreated":true}'::jsonb),'exact replay');
select pg_temp.owner_setup_assert((select count(*) from public.ask_messages where conversation_id=(select (value->>'askConversationId')::uuid from setup_result))=1,'no duplicate ask');
select pg_temp.owner_setup_assert(not has_function_privilege('service_role','public.enter_customer_business_before_ux_owner(uuid,text,text,uuid,text,uuid,text)','EXECUTE')
 and has_function_privilege('service_role','public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.enter_customer_business(uuid,text,text,uuid,text,uuid,text)','EXECUTE'),'only current actor-checked RPC exposed');
create function pg_temp.reject_owner_ask() returns trigger language plpgsql as $$
begin if new.content='__refuse_owner_ask__' then raise exception 'synthetic_owner_ask_failure'; end if; return new; end; $$;
create trigger reject_owner_ask before insert on public.ask_messages for each row execute function pg_temp.reject_owner_ask();
do $$ begin
 begin perform public.enter_customer_business('ab200000-0000-4000-8000-000000000001','ux-owner@example.test','Must roll back',null,
 '__refuse_owner_ask__','ab200000-0000-4000-8000-000000000011',repeat('b',64)); raise exception 'expected synthetic failure';
 exception when others then if sqlerrm <> 'synthetic_owner_ask_failure' then raise; end if; end;
 begin perform public.enter_customer_business('ab200000-0000-4000-8000-000000000003','ux-unverified@example.test','Unverified',null,
 null,'ab200000-0000-4000-8000-000000000012',repeat('c',64)); raise exception 'expected verified identity refusal';
 exception when others then if sqlerrm <> 'verified_identity_required' then raise; end if; end;
 begin perform public.enter_customer_business('ab200000-0000-4000-8000-000000000002','ux-other@example.test',null,
 (select (value->>'workspaceId')::uuid from setup_result),'Foreign ask','ab200000-0000-4000-8000-000000000013',repeat('d',64)); raise exception 'expected access refusal';
 exception when others then if sqlerrm <> 'service_request_access_denied' then raise; end if; end;
end; $$;
select pg_temp.owner_setup_assert(not exists(select 1 from public.workspaces where name='Must roll back') and not exists(select 1 from public.workspace_creation_receipts where command_id='ab200000-0000-4000-8000-000000000011'),'ask failure rolls ownership and receipt back');
delete from public.workspace_memberships where workspace_id=(select (value->>'workspaceId')::uuid from setup_result) and user_id='ab200000-0000-4000-8000-000000000001';
do $$ begin
 begin perform public.enter_customer_business('ab200000-0000-4000-8000-000000000001','ux-owner@example.test','Owner setup fixture',null,
 'Build a website with booking information.','ab200000-0000-4000-8000-000000000010',repeat('a',64)); raise exception 'expected revoked refusal';
 exception when others then if sqlerrm <> 'service_request_access_denied' then raise; end if; end;
end; $$;
rollback;
