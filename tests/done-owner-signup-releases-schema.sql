\set ON_ERROR_STOP on
begin;
create function pg_temp.signup_assert(condition boolean, detail text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'signup release assertion failed: %',detail; end if; end; $$;
insert into public.users(id,email,verified_at) values
 ('ad120000-0000-4000-8000-000000000001','signup-owner@example.test',now()),
 ('ad120000-0000-4000-8000-000000000002','signup-other@example.test',now()),
 ('ad120000-0000-4000-8000-000000000003','signup-unverified@example.test',null);
-- Eleven existing client identities and their deliberate release state.
insert into public.workspaces(id,kind,name,created_by)
 select ('ad120000-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid,'customer','Existing client '||n,
 'ad120000-0000-4000-8000-000000000002'::uuid from generate_series(1,11) n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 select id,'ad120000-0000-4000-8000-000000000002','owner','ad120000-0000-4000-8000-000000000002'
 from public.workspaces where name like 'Existing client %';
insert into public.workspace_release_flags(workspace_id,flag,state,changed_by)
 select id,'systems','off','ad120000-0000-4000-8000-000000000002'
 from public.workspaces where name like 'Existing client %';
create temporary table existing_flags as select * from public.workspace_release_flags;
create temporary table signup_result(value jsonb);
insert into signup_result select public.enter_customer_business_with_releases(
 'ad120000-0000-4000-8000-000000000001','signup-owner@example.test','Direct signup',null,
 'Build a website for our business.','ad120000-0000-4000-8000-000000000010',repeat('a',64),array['systems','website_rebuild','systems']);
select pg_temp.signup_assert((select value->>'requestId' is null and value->>'askConversationId' is not null from signup_result),'own Ask brief without agency requirement');
select pg_temp.signup_assert((select count(*) from public.workspace_release_flags where workspace_id=(select (value->>'workspaceId')::uuid from signup_result))=2,'only selected releases, deduplicated');
select pg_temp.signup_assert((select count(*) from public.workspace_release_flag_changes where workspace_id=(select (value->>'workspaceId')::uuid from signup_result)
 and from_state='unset' and to_state='on' and reason='Direct business signup: inherit globally released capability'
 and changed_by='ad120000-0000-4000-8000-000000000001')=2,'honest immutable enrollment history');
select pg_temp.signup_assert(public.workspace_make_systems_authority((select (value->>'workspaceId')::uuid from signup_result),'ad120000-0000-4000-8000-000000000001')='owner','direct owner can make Systems');
select pg_temp.signup_assert(public.workspace_make_systems_authority((select (value->>'workspaceId')::uuid from signup_result),'ad120000-0000-4000-8000-000000000002') is null,'outsider has no maker authority');
-- A retry during a rollout change returns the original identity/Ask and never
-- enables a new capability or reopens a deliberately paused one.
update public.workspace_release_flags set state='off',revision=2 where workspace_id=(select (value->>'workspaceId')::uuid from signup_result) and flag='systems';
select pg_temp.signup_assert(public.enter_customer_business_with_releases(
 'ad120000-0000-4000-8000-000000000001','signup-owner@example.test','Direct signup',null,
 'Build a website for our business.','ad120000-0000-4000-8000-000000000010',repeat('a',64),array['systems','connected_sites'])=((select value from signup_result)||'{"alreadyCreated":true}'::jsonb),'idempotent original result');
select pg_temp.signup_assert(exists(select 1 from public.workspace_release_flags where workspace_id=(select (value->>'workspaceId')::uuid from signup_result) and flag='systems' and state='off')
 and not exists(select 1 from public.workspace_release_flags where workspace_id=(select (value->>'workspaceId')::uuid from signup_result) and flag='connected_sites'),'retry respects off and enrolls nothing');
-- Selecting an existing client is not an initial enrollment.
select public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000002','signup-other@example.test',null,
 'ad120000-0000-4000-8100-000000000001',null,'ad120000-0000-4000-8000-000000000011',repeat('b',64),array['systems','connected_sites']);
select pg_temp.signup_assert(not exists(select 1 from existing_flags e left join public.workspace_release_flags f using(workspace_id,flag) where to_jsonb(e) is distinct from to_jsonb(f))
 and not exists(select 1 from public.workspace_release_flags f where workspace_id::text like 'ad120000-0000-4000-8100-%' and flag<>'systems'),'all eleven existing client flag rows unchanged');
create temporary table signup_dark(value jsonb);
insert into signup_dark select public.enter_customer_business_with_releases(
 'ad120000-0000-4000-8000-000000000001','signup-owner@example.test','No released capability',null,
 null,'ad120000-0000-4000-8000-000000000015',repeat('f',64),array[]::text[]);
select pg_temp.signup_assert(not exists(select 1 from public.workspace_release_flags where workspace_id=(select (value->>'workspaceId')::uuid from signup_dark)),
 'off global rollout enrolls no capability');
select public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000001','signup-owner@example.test','No released capability',null,
 null,'ad120000-0000-4000-8000-000000000015',repeat('f',64),array['systems']);
select pg_temp.signup_assert(not exists(select 1 from public.workspace_release_flags where workspace_id=(select (value->>'workspaceId')::uuid from signup_dark)),
 'later rollout cannot silently enroll a previous dark signup on retry');
-- A failed enrollment rolls ownership, brief and creation receipt back too.
create function pg_temp.refuse_signup_release() returns trigger language plpgsql as $$
begin if new.flag='connected_sites' then raise exception 'synthetic_signup_release_failure'; end if; return new; end; $$;
create trigger refuse_signup_release before insert on public.workspace_release_flags for each row execute function pg_temp.refuse_signup_release();
do $$ begin
 begin perform public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000001','signup-owner@example.test','Failed enrollment',null,
 'A brief that must roll back.','ad120000-0000-4000-8000-000000000012',repeat('c',64),array['systems','connected_sites']); raise exception 'expected storage refusal';
 exception when others then if sqlerrm<>'synthetic_signup_release_failure' then raise; end if; end;
 begin perform public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000001','signup-owner@example.test','Unknown release',null,
 null,'ad120000-0000-4000-8000-000000000013',repeat('d',64),array['not_a_release']); raise exception 'expected invalid release refusal';
 exception when others then if sqlerrm<>'business_entry_release_flags_invalid' then raise; end if; end;
 begin perform public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000003','signup-unverified@example.test','Unverified signup',null,
 null,'ad120000-0000-4000-8000-000000000014',repeat('e',64),array['systems']); raise exception 'expected identity refusal';
 exception when others then if sqlerrm<>'verified_identity_required' then raise; end if; end;
end; $$;
drop trigger refuse_signup_release on public.workspace_release_flags;
select pg_temp.signup_assert(not exists(select 1 from public.workspaces where name in ('Failed enrollment','Unknown release','Unverified signup'))
 and not exists(select 1 from public.workspace_creation_receipts where command_id='ad120000-0000-4000-8000-000000000012')
 and not exists(select 1 from public.ask_messages where content='A brief that must roll back.'),'no partial ownership, receipt or Ask survives');
select pg_temp.signup_assert(not has_function_privilege('anon','public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[])','EXECUTE')
 and not has_function_privilege('authenticated','public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[])','EXECUTE')
 and has_function_privilege('service_role','public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[])','EXECUTE'),'server-only enrollment, no browser-selected flags');
delete from public.workspace_memberships where workspace_id=(select (value->>'workspaceId')::uuid from signup_result) and user_id='ad120000-0000-4000-8000-000000000001';
do $$ begin
 begin perform public.enter_customer_business_with_releases('ad120000-0000-4000-8000-000000000001','signup-owner@example.test','Direct signup',null,
 'Build a website for our business.','ad120000-0000-4000-8000-000000000010',repeat('a',64),array['systems']); raise exception 'expected revoked replay refusal';
 exception when others then if sqlerrm<>'service_request_access_denied' then raise; end if; end;
end; $$;
rollback;
