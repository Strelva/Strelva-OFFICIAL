\set ON_ERROR_STOP on
-- Disposable migrated Postgres only. No provider calls, prices or real users.
begin;
create function pg_temp.checkout_assert(ok boolean,msg text) returns void language plpgsql as $$begin if ok is not true then raise exception 'owner2 checkout: %',msg;end if;end$$;
create function pg_temp.checkout_denied(command text,expected text) returns void language plpgsql as $$begin
  begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end;
  raise exception 'owner2 checkout: expected refusal %',expected;
end$$;
insert into public.users(id,email,verified_at) values
 ('7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',now()),
 ('7f120000-0000-4000-8000-000000000002','checkout-other@example.test',now()),
 ('7f120000-0000-4000-8000-000000000003','checkout-support@example.test',now());
insert into public.super_admins(user_id,email) values('7f120000-0000-4000-8000-000000000003','checkout-support@example.test');
create temp table checkout_results(name text primary key,body jsonb);
insert into checkout_results values('business',public.enter_customer_business('7f120000-0000-4000-8000-000000000001','checkout-owner@example.test','Checkout fictional business',null,null,'7f120000-0000-4000-8000-000000000031',repeat('c',64)));
select body->>'workspaceId' as business from checkout_results where name='business' \gset
select public.create_owned_workspace('7f120000-0000-4000-8000-000000000002','checkout-other@example.test','agency','Checkout fictional agency');
-- create_owned_workspace projections use the ordinary workspace table as authority.
select id as agency from public.workspaces where kind='agency' and created_by='7f120000-0000-4000-8000-000000000002' \gset
select jsonb_build_object('priceId','price_fixture','payerEmail','checkout-owner@example.test','allowanceConfigKey','unavailable','returnUrl','https://app.example.test/workspace/billing?workspaceId='||:'business','customerId',null)::text as terms \gset
insert into checkout_results values('first',public.prepare_workspace_subscription_checkout(:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',null));
insert into checkout_results values('retry',public.prepare_workspace_subscription_checkout(:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',jsonb_set(:'terms'::jsonb,'{priceId}','"price_changed"'),null));
select pg_temp.checkout_assert((select (body#>>'{attempt,id}')=(select body#>>'{attempt,id}' from checkout_results where name='first') and body#>>'{attempt,checkout,priceId}'='price_fixture' from checkout_results where name='retry'),'retry preserves attempt and immutable provider terms');
select body#>>'{attempt,id}' as attempt from checkout_results where name='first' \gset
select pg_temp.checkout_assert((select count(*)=1 from public.workspace_subscription_checkouts where workspace_id=:'business'),'one pending record');
select pg_temp.checkout_denied(format('insert into public.workspace_subscription_checkouts(workspace_id,payer_user_id,checkout) values(%L,%L,%L)',:'business','7f120000-0000-4000-8000-000000000001',:'terms'),'workspace_subscription_checkout_pending_once');
-- Other owners do not acquire a new key by changing who pays for the same business.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(:'business','7f120000-0000-4000-8000-000000000002','owner','7f120000-0000-4000-8000-000000000001');
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,null)',:'business','7f120000-0000-4000-8000-000000000002','checkout-other@example.test',:'terms'),'workspace_checkout_conflict_payer');
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,null)',:'business','7f120000-0000-4000-8000-000000000003','checkout-support@example.test',:'terms'),'workspace_checkout_denied');
update public.workspace_memberships set role='admin' where workspace_id=:'business' and user_id='7f120000-0000-4000-8000-000000000001';
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,null)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms'),'workspace_checkout_denied');
update public.workspace_memberships set role='owner' where workspace_id=:'business' and user_id='7f120000-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='7f120000-0000-4000-8000-000000000001';
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,null)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms'),'workspace_checkout_denied');
update public.users set verified_at=now() where id='7f120000-0000-4000-8000-000000000001';
-- A pending attempt never overrides a durable existing plan.
insert into public.subscriptions(account_id,stripe_subscription_id,stripe_customer_id,status) select id,'sub_fixture','cus_fixture','active' from public.accounts where workspace_id=:'business';
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,%L)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',:'attempt'),'workspace_checkout_conflict_subscription');
update public.subscriptions set status='canceled' where stripe_subscription_id='sub_fixture';
select pg_temp.checkout_assert(public.prepare_workspace_subscription_checkout(:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',:'attempt')->'subscriptionIds' @> '["sub_fixture"]','cancelled mirror is passed to provider-current guard, not trusted as clearance');
insert into public.work_allowance_subscription_entitlements(workspace_id,payer_id,stripe_subscription_id,stripe_customer_id,config_key,status,period_start,period_end,last_event_id,last_event_created,terms_digest)
  values(:'business','7f120000-0000-4000-8000-000000000001','sub_entitlementfixture','cus_fixture','unavailable','active',now(),now()+interval '30 days','evt_checkoutfixture',extract(epoch from now())::bigint,repeat('a',32));
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,%L)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',:'attempt'),'workspace_checkout_conflict_subscription');
delete from public.work_allowance_subscription_entitlements where stripe_subscription_id='sub_entitlementfixture';
update public.accounts set payer_kind='agency',payer_workspace_id=:'agency' where workspace_id=:'business';
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,%L)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',:'attempt'),'workspace_checkout_denied');
update public.accounts set payer_kind='business',payer_workspace_id=null where workspace_id=:'business';
-- Acceptance stays recorded even after revocation; no further checkout URL authority follows.
delete from public.workspace_memberships where workspace_id=:'business' and user_id='7f120000-0000-4000-8000-000000000001';
select public.observe_workspace_subscription_checkout(:'attempt','cs_fixture','complete','cus_fixture','sub_fixture',false);
select pg_temp.checkout_assert((select state='complete' and stripe_subscription_id='sub_fixture' from public.workspace_subscription_checkouts where id=:'attempt'),'provider completion survives revoked initiating authority and delayed webhook');
select pg_temp.checkout_denied(format('select public.prepare_workspace_subscription_checkout(%L,%L,%L,%L,%L)',:'business','7f120000-0000-4000-8000-000000000001','checkout-owner@example.test',:'terms',:'attempt'),'workspace_checkout_denied');
select pg_temp.checkout_denied(format('select public.observe_workspace_subscription_checkout(%L,%L,%L,null,null,true)',:'attempt','cs_fixture','expired'),'workspace_checkout_conflict_session');
select pg_temp.checkout_assert(not has_table_privilege('service_role','public.workspace_subscription_checkouts','insert') and not has_table_privilege('authenticated','public.workspace_subscription_checkouts','select'),'no API table bypass');
select pg_temp.checkout_assert(not has_function_privilege('authenticated','public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid)','execute') and not has_function_privilege('anon','public.observe_workspace_subscription_checkout(uuid,text,text,text,text,boolean)','execute') and not has_function_privilege('service_role','public.assert_workspace_subscription_checkout(uuid,uuid,text)','execute'),'only narrow service commands');
rollback;
