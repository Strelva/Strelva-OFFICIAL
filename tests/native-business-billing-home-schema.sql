\set ON_ERROR_STOP on
-- Runs against the actual migrated native graph, both fresh and upgraded.
begin;
create function pg_temp.home_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is not true then raise exception 'native billing home: %',msg;end if;end$$;
insert into public.users(id,email,verified_at) values
 ('7f100000-0000-4000-8000-000000000001','native-owner@example.test',now()),
 ('7f100000-0000-4000-8000-000000000002','native-agency@example.test',now()),
 ('7f100000-0000-4000-8000-000000000003','native-stranger@example.test',now());
select public.create_owned_workspace('7f100000-0000-4000-8000-000000000002','native-agency@example.test','agency','Native ordinary agency');
create temp table native_results(name text primary key,body jsonb);
insert into native_results values('entry',public.enter_customer_business('7f100000-0000-4000-8000-000000000001','native-owner@example.test','Native ordinary business',null,null,'7f100000-0000-4000-8000-000000000031',repeat('a',64)));
insert into native_results select 'client',public.agency_add_client('7f100000-0000-4000-8000-000000000002','native-agency@example.test',id,'{"name":"Native ordinary client"}','7f100000-0000-4000-8000-000000000032',repeat('b',64)) from public.workspaces where kind='agency' and created_by='7f100000-0000-4000-8000-000000000002';
select pg_temp.home_assert((select count(*)=2 from public.accounts where workspace_id in(select coalesce(body->>'workspaceId',body->>'customerWorkspaceId')::uuid from native_results) and created_via='business' and billing_type='none' and payment_status='none' and monthly_cents is null and plan_key is null and stripe_customer_id is null),'both actual ordinary routes provision unpriced homes');
select pg_temp.home_assert(not exists(select 1 from public.subscriptions s join public.accounts a on a.id=s.account_id where a.workspace_id in(select coalesce(body->>'workspaceId',body->>'customerWorkspaceId')::uuid from native_results)),'no business subscription created');
select pg_temp.home_assert(not exists(select 1 from public.super_admins where user_id in('7f100000-0000-4000-8000-000000000001','7f100000-0000-4000-8000-000000000002')),'no designated privileges');
select pg_temp.home_assert(public.read_business_billing((select (body->>'workspaceId')::uuid from native_results where name='entry'),'7f100000-0000-4000-8000-000000000001','native-owner@example.test') @> '{"state":"none","openItem":true,"planKey":null,"paymentStatus":"none"}','owner can read unresolved unpriced home');
-- Claim only establishes actual owner membership; no provider/verification privilege.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select (body->>'customerWorkspaceId')::uuid,'7f100000-0000-4000-8000-000000000001','owner','7f100000-0000-4000-8000-000000000001' from native_results where name='client';
insert into native_results select 'payer',to_jsonb(t) from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId',(select body->>'customerWorkspaceId' from native_results where name='client'),'successorAgencyWorkspaceId',(select id from public.workspaces where kind='agency' and created_by='7f100000-0000-4000-8000-000000000002')),'7f100000-0000-4000-8000-000000000001','native-owner@example.test') t;
select public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',(select body->>'id' from native_results where name='payer')),'7f100000-0000-4000-8000-000000000002','native-agency@example.test');
select pg_temp.home_assert((select payer_kind='agency' and payer_workspace_id=(select id from public.workspaces where kind='agency' and created_by='7f100000-0000-4000-8000-000000000002') and monthly_cents is null from public.accounts where workspace_id=(select (body->>'customerWorkspaceId')::uuid from native_results where name='client')),'accepted agency party stamps actual ordinary client');
select pg_temp.home_assert((select count(*)=1 and bool_and(amount_cents is null and client_plan_key is null and line_state='active') from public.subscription_items where business_workspace_id=(select (body->>'customerWorkspaceId')::uuid from native_results where name='client')),'one actual unpriced agency client line');
select pg_temp.home_assert(not exists(select 1 from public.agency_billing_intents where business_workspace_id=(select (body->>'customerWorkspaceId')::uuid from native_results where name='client')),'no invoice or Stripe intent created');
-- Public reads remain valid under PostgREST-style read-only transactions.
rollback;
select not has_function_privilege('service_role','public.ensure_native_business_billing_home(uuid)','execute') and not has_function_privilege('authenticated','public.ensure_native_business_billing_home(uuid)','execute') and not has_function_privilege('anon','public.native_business_billing_on_creation()','execute') as private_helpers_only \gset
\if :private_helpers_only
\else
\quit 1
\endif
