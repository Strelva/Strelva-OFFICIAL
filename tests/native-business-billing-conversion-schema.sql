-- Scoped current conversion compatibility from existing business-billing proof.
-- Its stale operator-read expectation and existing unlink FK failure are not passing claims.
\set ON_ERROR_STOP on
-- Business billing home (20261007180000_business_billing.sql). Fictional
-- tenants only. Conversion writes exactly one billing state per business,
-- derived from the tenant's billing fields; a second site joins the same
-- account; unlinking undoes it; only owners and the operator can read it.
begin;
create or replace function pg_temp.bb_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business billing assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.bb_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.bb_convert(p_tenant text, p_billing jsonb, p_account jsonb default null, p_target uuid default null)
returns jsonb language sql as $$
  select public.convert_tenant_to_business('bb-operator@strelva.example.test', p_tenant,
    jsonb_strip_nulls(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'workspaceName', t.site_name,
      'targetWorkspaceId', p_target)) || jsonb_build_object('billing', p_billing, 'account', p_account, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb)
      || case when to_regprocedure('public.repath_converted_tenant_provider(text,text,uuid,jsonb,text,boolean)') is null then '{}'::jsonb
        else jsonb_build_object('agencyWorkspaceId', 'bb000000-0000-4000-8000-000000000010',
          'agencyStaffEmails', jsonb_build_array('bb-member@example.test'), 'agencySelectionBasis', 'existing_contract') end,
    gen_random_uuid(), encode(sha256(convert_to(t.id || clock_timestamp()::text, 'UTF8')), 'hex'))
  from public.tenants t where t.id = p_tenant
$$;
create or replace function pg_temp.bb_billing(p_tenant text) returns jsonb language sql as $$
  select public.business_billing_json(l.workspace_id) from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant
$$;

insert into public.users(id, email, verified_at) values
  ('bb000000-0000-4000-8000-000000000001', 'bb-operator@strelva.example.test', now()),
  ('bb000000-0000-4000-8000-000000000002', 'bb-member@example.test', now());
insert into public.workspaces(id, kind, name, created_by)
  values ('bb000000-0000-4000-8000-000000000010', 'agency', 'Fictional billing test agency', 'bb000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ('bb000000-0000-4000-8000-000000000010', 'bb000000-0000-4000-8000-000000000002', 'member', 'bb000000-0000-4000-8000-000000000001');
insert into public.super_admins(user_id, email) values ('bb000000-0000-4000-8000-000000000001', 'bb-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('bb-tier', 'bb000000-0000-4000-8000-0000000000a1', 'Tier Client', true, 'tier-owner@example.test'),
  ('bb-custom', 'bb000000-0000-4000-8000-0000000000a2', 'Custom Client', true, 'custom-owner@example.test'),
  ('bb-case', 'bb000000-0000-4000-8000-0000000000a3', 'Case Study', true, null),
  ('bb-founder', 'bb000000-0000-4000-8000-0000000000a4', 'Founder Comp', true, null),
  ('bb-gldf', 'bb000000-0000-4000-8000-0000000000a5', 'Grandfathered Store', true, 'store-owner@example.test'),
  ('bb-none', 'bb000000-0000-4000-8000-0000000000a6', 'No Plan', true, null),
  ('bb-twin-a', 'bb000000-0000-4000-8000-0000000000a7', 'Twin Camillus', true, 'twin-owner@example.test'),
  ('bb-twin-b', 'bb000000-0000-4000-8000-0000000000a8', 'Twin Fayetteville', true, 'twin-owner@example.test'),
  ('bb-null', 'bb000000-0000-4000-8000-0000000000a9', 'No Billing Recorded', true, null);

-- Locked down.
select pg_temp.bb_assert(not has_table_privilege('anon', 'public.accounts', 'select')
  and not has_table_privilege('authenticated', 'public.accounts', 'select')
  and not has_table_privilege('authenticated', 'public.subscription_items', 'select'), 'api roles cannot read billing tables');
select pg_temp.bb_assert(not has_function_privilege('anon', 'public.read_business_billing(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_business_billing_payment(uuid,text,text,timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.business_billing_json(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.read_business_billing(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_billing_workspace(text,text)', 'execute'), 'function grants');

-- Each tenant billing shape lands in its state.
select pg_temp.bb_convert('bb-tier', '{"billingType":"tier","subscriptionStatus":"active","subscriptionPlan":"growth","monthlyCents":19900,"hasStripeSubscription":true,"grandfathered":false}');
select pg_temp.bb_convert('bb-custom', '{"billingType":"custom","subscriptionStatus":null,"subscriptionPlan":null,"monthlyCents":25000,"hasStripeSubscription":false,"grandfathered":false}');
select pg_temp.bb_convert('bb-case', '{"billingType":"case_study","subscriptionStatus":null,"subscriptionPlan":null,"monthlyCents":0,"hasStripeSubscription":false,"grandfathered":false}');
-- resolveBillingType maps the legacy founder_comp override to case_study before conversion.
select pg_temp.bb_convert('bb-founder', '{"billingType":"case_study","subscriptionStatus":null,"subscriptionPlan":null,"monthlyCents":0,"hasStripeSubscription":false,"grandfathered":false}');
select pg_temp.bb_convert('bb-gldf', '{"billingType":"tier","subscriptionStatus":"active","subscriptionPlan":null,"monthlyCents":19900,"hasStripeSubscription":false,"grandfathered":true}');
select pg_temp.bb_convert('bb-none', '{"billingType":"none","subscriptionStatus":null,"subscriptionPlan":null,"monthlyCents":0,"hasStripeSubscription":false,"grandfathered":false}');
select pg_temp.bb_convert('bb-null', null);

select pg_temp.bb_assert(pg_temp.bb_billing('bb-tier')->>'state' = 'subscription'
  and pg_temp.bb_billing('bb-tier')->>'paymentStatus' = 'active'
  and (pg_temp.bb_billing('bb-tier')->>'monthlyCents')::int = 19900, 'tier -> subscription at the tier price');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-custom')->>'state' = 'custom' and (pg_temp.bb_billing('bb-custom')->>'monthlyCents')::int = 25000, 'custom amount');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-case')->>'state' = 'comped' and (pg_temp.bb_billing('bb-case')->>'monthlyCents')::int = 0, 'case study -> comped');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-founder')->>'state' = 'comped', 'founder comp -> comped');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-gldf')->>'state' = 'grandfathered' and pg_temp.bb_billing('bb-gldf')->>'grandfatheredTerms' is not null, 'grandfathered kept');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-none')->>'state' = 'none' and (pg_temp.bb_billing('bb-none')->>'openItem')::boolean, 'none is the open item');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-null')->>'state' = 'none', 'no billing recorded -> none');
select pg_temp.bb_assert(not (pg_temp.bb_billing('bb-tier')->>'openItem')::boolean, 'configured billing is not an open item');
select pg_temp.bb_assert((select count(*) from public.accounts a join public.workspaces w on w.id=a.workspace_id and w.kind='customer' where a.workspace_id in (select l.workspace_id from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id where t.id like 'bb-%')) = 7, 'one billing row per business');

-- The payer is the owner recipient, never a user: owners who never signed in still have one.
select pg_temp.bb_assert(pg_temp.bb_billing('bb-tier')#>>'{payer,email}' = 'tier-owner@example.test'
  and pg_temp.bb_billing('bb-tier')#>>'{payer,from}' = 'tenant_fallback', 'payer from the owner recipient');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-case')->'payer' = 'null'::jsonb, 'no owner email -> no payer, still a state');
select pg_temp.bb_assert((select account_id is not null from public.tenants where id = 'bb-tier'), 'tenant points at its account');
select pg_temp.bb_assert(pg_temp.bb_billing('bb-tier')#>>'{sources,0,derivedState}' = 'subscription'
  and pg_temp.bb_billing('bb-tier')#>>'{sources,0,billing,billingType}' = 'tier', 'sources recorded');

-- Twin Trees: one account, two sites, the bundle amount Stripe charges.
create temporary table bb_twin(workspace_id uuid);
insert into bb_twin select (pg_temp.bb_convert('bb-twin-a',
  '{"billingType":"custom","subscriptionStatus":"active","subscriptionPlan":null,"monthlyCents":15000,"hasStripeSubscription":true,"grandfathered":false}',
  '{"id":"twin-trees-1a2b3c","name":"Twin Trees","tenantIds":["bb-twin-a","bb-twin-b"],"multiSite":true,"subscription":{"status":"active","amountCents":30000,"currentPeriodEnd":"2026-11-06T00:00:00Z","items":[{"tenantId":"bb-twin-a","label":"Camillus","amountCents":15000},{"tenantId":"bb-twin-b","label":"Fayetteville","amountCents":15000}]}}')->>'workspaceId')::uuid;
select pg_temp.bb_convert('bb-twin-b',
  '{"billingType":"custom","subscriptionStatus":"active","subscriptionPlan":null,"monthlyCents":15000,"hasStripeSubscription":true,"grandfathered":false}',
  '{"id":"twin-trees-1a2b3c","name":"Twin Trees","tenantIds":["bb-twin-a","bb-twin-b"],"multiSite":true,"subscription":{"status":"active","amountCents":30000,"currentPeriodEnd":"2026-11-06T00:00:00Z","items":[{"tenantId":"bb-twin-a","label":"Camillus","amountCents":15000},{"tenantId":"bb-twin-b","label":"Fayetteville","amountCents":15000}]}}',
  (select workspace_id from bb_twin));
select pg_temp.bb_assert((select count(*) from public.accounts where workspace_id = (select workspace_id from bb_twin)) = 1, 'one account for two sites');
select pg_temp.bb_assert(public.business_billing_json((select workspace_id from bb_twin))->>'state' = 'custom'
  and (public.business_billing_json((select workspace_id from bb_twin))->>'monthlyCents')::int = 30000
  and jsonb_array_length(public.business_billing_json((select workspace_id from bb_twin))->'sites') = 2
  and jsonb_array_length(public.business_billing_json((select workspace_id from bb_twin))->'sources') = 2
  and public.business_billing_json((select workspace_id from bb_twin))->>'paidThrough' = '2026-11-06T00:00:00Z', 'twin trees: $300 covers both sites');
select pg_temp.bb_assert(public.business_billing_json((select workspace_id from bb_twin))#>>'{sites,1,amountCents}' = '15000', 'per-site line item');

-- A slug rename keeps the line item (FK now cascades on update).
update public.tenants set id = 'bb-twin-b-renamed' where id = 'bb-twin-b';
select pg_temp.bb_assert(public.business_billing_json((select workspace_id from bb_twin))#>>'{sites,1,tenantId}' = 'bb-twin-b-renamed', 'rename keeps billing');


select pg_temp.bb_assert((select created_via='tenant_conversion' and payment_status='active' from public.accounts where workspace_id=(select workspace_id from bb_twin)), 'new native completion triggers preserve conversion provenance and payment status');
-- Existing last-unlink failure remains a material release limitation. Catching
-- it only proves atomic refusal and unchanged source behavior, not successful unlink.
do $$
declare before_accounts jsonb;before_links jsonb;
begin
 select jsonb_agg(to_jsonb(a) order by a.id) into before_accounts from public.accounts a;
 select jsonb_agg(to_jsonb(l) order by l.workspace_id,l.tenant_stable_id) into before_links from public.tenant_workspace_links l;
 begin
  perform public.unlink_tenant_from_business('bb-operator@strelva.example.test','bb-none',(select workspace_id from public.tenant_workspace_links where tenant_stable_id='bb000000-0000-4000-8000-0000000000a6'),gen_random_uuid(),encode(sha256('home-existing-unlink'::bytea),'hex'));
  raise exception 'expected retained last-unlink limitation';
 exception when foreign_key_violation then
  if sqlerrm not like '%agency_handoff_receipts_business_workspace_id_fkey%' then raise;end if;
 end;
 perform pg_temp.bb_assert(before_accounts=(select jsonb_agg(to_jsonb(a) order by a.id) from public.accounts a),'failed unlink retains all account bytes');
 perform pg_temp.bb_assert(before_links=(select jsonb_agg(to_jsonb(l) order by l.workspace_id,l.tenant_stable_id) from public.tenant_workspace_links l),'failed unlink retains links');
end $$;
rollback;
