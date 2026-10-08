\set ON_ERROR_STOP on
-- Legacy fixtures precede the new migration. Only this preservation fixture
-- selects a fictional historical amount; the runtime provisions no price.
create schema proof_home;
create function proof_home.assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is not true then raise exception 'native billing home: %',msg;end if;end$$;
create table proof_home.snapshots(name text primary key,body jsonb);
insert into public.users(id,email,verified_at) values
 ('7f000000-0000-4000-8000-000000000001','home-owner@example.test',now()),
 ('7f000000-0000-4000-8000-000000000002','home-agency@example.test',now()),
 ('7f000000-0000-4000-8000-000000000003','home-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('7f000000-0000-4000-8000-000000000010','customer','Existing converted home','7f000000-0000-4000-8000-000000000001'),
 ('7f000000-0000-4000-8000-000000000011','customer','Missing accepted home','7f000000-0000-4000-8000-000000000001'),
 ('7f000000-0000-4000-8000-000000000012','customer','Concurrent missing home','7f000000-0000-4000-8000-000000000001'),
 ('7f000000-0000-4000-8000-000000000020','agency','Ordinary billing agency','7f000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,created_by,'owner',created_by from public.workspaces where id::text like '7f000000-%';
insert into public.accounts(workspace_id,name,billing_type,payment_status,monthly_cents,plan_key,billing_sources,grandfathered_terms,created_via)
 values('7f000000-0000-4000-8000-000000000010','Historical account','grandfathered','past_due',19900,'old_terms','[{"kind":"historical","receipt":"keep"}]','Original commercial terms preserved','tenant_conversion');
insert into public.subscriptions(account_id,plan,status,amount_cents) select id,'legacy','past_due',19900 from public.accounts where workspace_id='7f000000-0000-4000-8000-000000000010';
insert into proof_home.snapshots select 'converted',jsonb_build_object('account',to_jsonb(a),'subscriptions',(select jsonb_agg(to_jsonb(s) order by s.id) from public.subscriptions s where s.account_id=a.id)) from public.accounts a where workspace_id='7f000000-0000-4000-8000-000000000010';
select public.workspace_payer_transition_command('{"action":"propose","workspaceId":"7f000000-0000-4000-8000-000000000011","successorAgencyWorkspaceId":"7f000000-0000-4000-8000-000000000020"}','7f000000-0000-4000-8000-000000000001','home-owner@example.test');
select public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',id),'7f000000-0000-4000-8000-000000000002','home-agency@example.test') from public.workspace_payer_transitions where workspace_id='7f000000-0000-4000-8000-000000000011';
insert into proof_home.snapshots select 'transition',jsonb_agg(to_jsonb(t) order by t.id) from public.workspace_payer_transitions t;
select proof_home.assert(not exists(select 1 from public.accounts where workspace_id='7f000000-0000-4000-8000-000000000011'),'baseline accepted client has no billing account');
