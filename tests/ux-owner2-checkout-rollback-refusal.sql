\set ON_ERROR_STOP on
-- Disposable migrated database only. Intentionally commits fictional history
-- so the actual inverse can fail/roll back without discarding the fixture.
begin;
insert into public.users(id,email,verified_at) values('7f130000-0000-4000-8000-000000000001','checkout-rollback@example.test',now());
select public.enter_customer_business('7f130000-0000-4000-8000-000000000001','checkout-rollback@example.test','Checkout rollback fixture',null,null,'7f130000-0000-4000-8000-000000000031',repeat('d',64))->>'workspaceId' as business \gset
select public.prepare_workspace_subscription_checkout(:'business','7f130000-0000-4000-8000-000000000001','checkout-rollback@example.test',jsonb_build_object('priceId','price_fixture','payerEmail','checkout-rollback@example.test','allowanceConfigKey','unavailable','returnUrl','https://app.example.test/workspace/billing?workspaceId='||:'business'),null);
commit;
-- Expected error: workspace_checkout_populated_rollback_refused.
\set ON_ERROR_STOP off
\ir ../supabase/migrations/rollback-20261024131000_ux_owner2_checkout.sql
\set ON_ERROR_STOP on
select exists(select 1 from public.workspace_subscription_checkouts where workspace_id=:'business' and state='pending')
  and to_regprocedure('public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid)') is not null
  and (select count(*)=3 from ux_owner2_checkout_rollback.functions) as retained \gset
\if :retained
\echo 'PASS owner2 actual populated rollback refused and provider identity retained'
\else
\quit 1
\endif
-- Database is throwaway; keep the populated record to prove refusal/retry.
