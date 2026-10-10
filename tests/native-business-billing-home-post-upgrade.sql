\set ON_ERROR_STOP on
select proof_home.assert((select jsonb_build_object('account',to_jsonb(a),'subscriptions',(select jsonb_agg(to_jsonb(s) order by s.id) from public.subscriptions s where s.account_id=a.id))= (select body from proof_home.snapshots where name='converted') from public.accounts a where workspace_id='7f000000-0000-4000-8000-000000000010'),'existing converted account/subscription full bytes preserved');
select proof_home.assert((select jsonb_agg(to_jsonb(t) order by t.id) from public.workspace_payer_transitions t)=(select body from proof_home.snapshots where name='transition'),'accepted transition history unchanged');
select proof_home.assert((select payer_kind='agency' and payer_workspace_id='7f000000-0000-4000-8000-000000000020' and billing_type='none' and monthly_cents is null and stripe_customer_id is null from public.accounts where workspace_id='7f000000-0000-4000-8000-000000000011'),'backfill derives current accepted payer without price');
select proof_home.assert((select count(*)=1 and bool_and(amount_cents is null and line_state='active') from public.subscription_items where business_workspace_id='7f000000-0000-4000-8000-000000000011'),'backfill derives actual unpriced wholesale line');
insert into proof_home.snapshots select 'provisioned',jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a;
select proof_home.assert((select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.agency_billing_intents i)=(select body from proof_home.snapshots where name='billing-intents-before'),'upgrade neither creates nor rewrites any billing intent');
begin read only;
set local role service_role;
select public.read_business_billing('7f000000-0000-4000-8000-000000000011','7f000000-0000-4000-8000-000000000001','home-owner@example.test');
select public.read_agency_billing('7f000000-0000-4000-8000-000000000020','7f000000-0000-4000-8000-000000000002','home-agency@example.test');
rollback;
