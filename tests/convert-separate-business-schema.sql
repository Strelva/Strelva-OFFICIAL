\set ON_ERROR_STOP on
-- Twin Trees as two businesses (20261008160000_convert_separate_business.sql).
-- Fictional tenants only. A site of a multi-site account still joins its
-- sibling's business by default; with separateBusiness it becomes its own
-- business with its own billing home (its line item, not the bundle), the
-- first business's people can't see it, reruns are no-ops, and rolling it back
-- deletes the business it created.
begin;
create or replace function pg_temp.sb_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'separate business assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sb_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
-- The account JSON the script reads from Redis `account:{id}`: one bundled
-- $300 subscription with a $150 line item per site.
create or replace function pg_temp.sb_account() returns jsonb language sql as $$
  select '{"id":"sb-twin-acct","name":"Twin Trees","tenantIds":["sb-twin-a","sb-twin-b"],"multiSite":true,"subscription":{"status":"active","amountCents":30000,"currentPeriodEnd":"2026-11-06T00:00:00Z","items":[{"tenantId":"sb-twin-a","label":"Camillus","amountCents":15000},{"tenantId":"sb-twin-b","label":"Fayetteville","amountCents":15000}]}}'::jsonb
$$;
create or replace function pg_temp.sb_import(p_tenant text, p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'workspaceName', t.site_name,
      'billing', '{"billingType":"custom","subscriptionStatus":"active","subscriptionPlan":null,"monthlyCents":15000,"hasStripeSubscription":true,"grandfathered":false}'::jsonb,
      'account', pg_temp.sb_account(), 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb) || p_extra
  from public.tenants t where t.id = p_tenant
$$;
create or replace function pg_temp.sb_convert(p_tenant text, p_extra jsonb, p_command uuid default gen_random_uuid()) returns jsonb language sql as $$
  select public.convert_tenant_to_business('sb-operator@strelva.example.test', p_tenant, pg_temp.sb_import(p_tenant, p_extra),
    p_command, encode(sha256(convert_to(p_tenant || p_command::text, 'UTF8')), 'hex'))
$$;
create or replace function pg_temp.sb_workspace(p_tenant text) returns uuid language sql as $$
  select l.workspace_id from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant
$$;

insert into public.users(id, email, verified_at) values
  ('5b000000-0000-4000-8000-000000000001', 'sb-operator@strelva.example.test', now()),
  ('5b000000-0000-4000-8000-000000000002', 'sb-camillus-owner@example.test', now());
insert into public.super_admins(user_id, email) values ('5b000000-0000-4000-8000-000000000001', 'sb-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('sb-twin-a', '5b000000-0000-4000-8000-0000000000a1', 'Twin Trees Camillus', true, 'twin-owner@example.test'),
  ('sb-twin-b', '5b000000-0000-4000-8000-0000000000a2', 'Twin Trees Fayetteville', true, 'twin-owner@example.test'),
  ('sb-join-a', '5b000000-0000-4000-8000-0000000000a3', 'Joined First', true, null),
  ('sb-join-b', '5b000000-0000-4000-8000-0000000000a4', 'Joined Second', true, null);

-- Same signature, same grants.
select pg_temp.sb_assert(has_function_privilege('service_role', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.business_billing_on_link()', 'execute'), 'grants unchanged');
select pg_temp.sb_assert((select count(*) from pg_proc where proname = 'convert_tenant_to_business' and pronamespace = 'public'::regnamespace) = 1, 'one conversion function');

-- Default unchanged: the second site joins the first site's business.
select pg_temp.sb_convert('sb-join-a', '{"workspaceName":"Twin Trees"}');
select pg_temp.sb_assert((pg_temp.sb_convert('sb-join-b', jsonb_build_object('targetWorkspaceId', pg_temp.sb_workspace('sb-join-a')))->>'joinedExistingWorkspace')::boolean,
  'default joins');
select pg_temp.sb_assert(pg_temp.sb_workspace('sb-join-a') = pg_temp.sb_workspace('sb-join-b')
  and (select receipt->>'separateBusiness' from public.tenant_workspace_links where workspace_id = pg_temp.sb_workspace('sb-join-a') limit 1) = 'false',
  'default: one business, receipt says not separate');
select pg_temp.sb_assert((public.business_billing_json(pg_temp.sb_workspace('sb-join-a'))->>'monthlyCents')::int = 30000
  and jsonb_array_length(public.business_billing_json(pg_temp.sb_workspace('sb-join-a'))->'sites') = 2, 'default billing: one bundle for both sites');

-- Refused shapes: any value but true, and never together with a join target.
select pg_temp.sb_expect($$select pg_temp.sb_convert('sb-twin-a', '{"separateBusiness":false}')$$, 'tenant_conversion_invalid');
select pg_temp.sb_expect($$select pg_temp.sb_convert('sb-twin-a', '{"separateBusiness":"yes"}')$$, 'tenant_conversion_invalid');
select pg_temp.sb_expect(format($$select pg_temp.sb_convert('sb-twin-a', '{"separateBusiness":true,"targetWorkspaceId":"%s"}')$$, pg_temp.sb_workspace('sb-join-a')),
  'tenant_conversion_invalid');
select pg_temp.sb_assert(pg_temp.sb_workspace('sb-twin-a') is null, 'refusals wrote nothing');

-- Separate: each site becomes its own business, named for the site.
create temporary table sb_cmd(tenant text primary key, command uuid);
insert into sb_cmd values ('sb-twin-a', gen_random_uuid()), ('sb-twin-b', gen_random_uuid());
create temporary table sb_result(tenant text primary key, value jsonb);
insert into sb_result select 'sb-twin-a', pg_temp.sb_convert('sb-twin-a', '{"separateBusiness":true}', (select command from sb_cmd where tenant = 'sb-twin-a'));
insert into sb_result select 'sb-twin-b', pg_temp.sb_convert('sb-twin-b', '{"separateBusiness":true}', (select command from sb_cmd where tenant = 'sb-twin-b'));
select pg_temp.sb_assert((select bool_and((value->>'separateBusiness')::boolean and not (value->>'joinedExistingWorkspace')::boolean) from sb_result),
  'receipts say separate, not joined');
select pg_temp.sb_assert(pg_temp.sb_workspace('sb-twin-a') <> pg_temp.sb_workspace('sb-twin-b')
  and pg_temp.sb_workspace('sb-twin-a') <> pg_temp.sb_workspace('sb-join-a'), 'two businesses');
select pg_temp.sb_assert((select name from public.workspaces where id = pg_temp.sb_workspace('sb-twin-b')) = 'Twin Trees Fayetteville', 'named for the site');

-- Each has its own billing home: its own line item, never the $300 bundle.
select pg_temp.sb_assert((select count(*) from public.accounts where workspace_id in (pg_temp.sb_workspace('sb-twin-a'), pg_temp.sb_workspace('sb-twin-b'))) = 2,
  'one billing home each');
select pg_temp.sb_assert(public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))->>'state' = 'custom'
  and (public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))->>'monthlyCents')::int = 15000
  and jsonb_array_length(public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))->'sites') = 1
  and public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))#>>'{sites,0,tenantId}' = 'sb-twin-b'
  and public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))#>>'{sources,0,sharedAccount}' = 'true'
  and public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))#>>'{sources,0,accountId}' = 'sb-twin-acct'
  and public.business_billing_json(pg_temp.sb_workspace('sb-twin-b'))->>'paidThrough' = '2026-11-06T00:00:00Z', 'separate billing: own line item, shared account recorded');
select pg_temp.sb_assert((select name from public.accounts where workspace_id = pg_temp.sb_workspace('sb-twin-b')) = 'Twin Trees Fayetteville', 'billing home named for the business');
select pg_temp.sb_assert((select account_id from public.tenants where id = 'sb-twin-a') <> (select account_id from public.tenants where id = 'sb-twin-b'),
  'each tenant points at its own billing home');

-- Cross-workspace denial: an owner of the first business sees nothing of the second.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values (pg_temp.sb_workspace('sb-twin-a'), '5b000000-0000-4000-8000-000000000002', 'owner', '5b000000-0000-4000-8000-000000000001');
select pg_temp.sb_assert(public.read_business_billing(pg_temp.sb_workspace('sb-twin-a'), '5b000000-0000-4000-8000-000000000002', 'sb-camillus-owner@example.test')->>'state' = 'custom',
  'owner reads their own business billing');
select pg_temp.sb_expect(format($$select public.read_business_billing(%L, '5b000000-0000-4000-8000-000000000002', 'sb-camillus-owner@example.test')$$,
  pg_temp.sb_workspace('sb-twin-b')), 'business_billing_denied');
select pg_temp.sb_expect(format($$select public.read_business_record(%L, '5b000000-0000-4000-8000-000000000002', 'sb-camillus-owner@example.test')$$,
  pg_temp.sb_workspace('sb-twin-b')), 'business_record_access_denied');
select pg_temp.sb_assert(not exists (select 1 from public.workspace_memberships where workspace_id = pg_temp.sb_workspace('sb-twin-b')
  and user_id = '5b000000-0000-4000-8000-000000000002'), 'no membership leaks into the second business');

-- Reruns: the same command replays, and any other plan for a linked site is a no-op.
select pg_temp.sb_assert((pg_temp.sb_convert('sb-twin-b', '{"separateBusiness":true}', (select command from sb_cmd where tenant = 'sb-twin-b'))->>'alreadyConverted')::boolean
  and (pg_temp.sb_convert('sb-twin-b', jsonb_build_object('targetWorkspaceId', pg_temp.sb_workspace('sb-twin-a')))->>'alreadyConverted')::boolean,
  'rerun reports already converted');
select pg_temp.sb_assert((select count(*) from public.tenant_workspace_links where tenant_stable_id = '5b000000-0000-4000-8000-0000000000a2') = 1
  and (select count(*) from public.accounts where workspace_id = pg_temp.sb_workspace('sb-twin-b')) = 1, 'reruns wrote nothing');

-- Rollback: unlinking a separately converted site deletes the business it created and its billing home.
create temporary table sb_unlinked(workspace_id uuid);
insert into sb_unlinked select pg_temp.sb_workspace('sb-twin-b');
select pg_temp.sb_assert((public.unlink_tenant_from_business('sb-operator@strelva.example.test', 'sb-twin-b', (select workspace_id from sb_unlinked),
  gen_random_uuid(), encode(sha256('sb-unlink-b'::bytea), 'hex'))->>'workspaceDeleted')::boolean, 'unlink deletes the separate business');
select pg_temp.sb_assert(not exists (select 1 from public.workspaces where id = (select workspace_id from sb_unlinked))
  and not exists (select 1 from public.accounts where workspace_id = (select workspace_id from sb_unlinked))
  and (select account_id is null from public.tenants where id = 'sb-twin-b'), 'business and billing home gone, tenant pointer cleared');
select pg_temp.sb_assert(pg_temp.sb_workspace('sb-twin-a') is not null
  and (public.business_billing_json(pg_temp.sb_workspace('sb-twin-a'))->>'monthlyCents')::int = 15000, 'the other business is untouched');
-- After a rollback the site can join its sibling instead (the default path).
select pg_temp.sb_assert((pg_temp.sb_convert('sb-twin-b', jsonb_build_object('targetWorkspaceId', pg_temp.sb_workspace('sb-twin-a')))->>'joinedExistingWorkspace')::boolean
  and pg_temp.sb_workspace('sb-twin-b') = pg_temp.sb_workspace('sb-twin-a'), 'reconverted into the sibling business');
rollback;
