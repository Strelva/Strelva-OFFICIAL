\set ON_ERROR_STOP on
-- Needs you policy settings on fictional rows: tenant setting moves, the
-- operator "owner not told" list and the operator business list. Rolled back.
begin;
create or replace function pg_temp.ps_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'policy settings assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ps_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.ps_assert(
  not has_function_privilege('anon', 'public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_tenant_decision_routes(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.list_owner_decisions_not_told(uuid,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.list_decision_policy_businesses(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.needs_you_tenant_link(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_tenant_decision_routes(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.list_owner_decisions_not_told(uuid,text,integer)', 'EXECUTE'),
  'only service_role executes the policy settings RPCs');
select pg_temp.ps_assert(
  not has_table_privilege('service_role', 'public.decision_policy_tenant_imports', 'SELECT')
  and not has_table_privilege('authenticated', 'public.decision_policy_tenant_imports', 'INSERT')
  and (select relrowsecurity from pg_class where oid = 'public.decision_policy_tenant_imports'::regclass),
  'the import receipts are RLS-on with no grants');

insert into public.users(id, email, verified_at) values
  ('af000000-0000-4000-8000-000000000001', 'ps-owner@example.test', now()),
  ('af000000-0000-4000-8000-000000000002', 'ps-editor@example.test', now()),
  ('af000000-0000-4000-8000-000000000003', 'ps-viewer@example.test', now()),
  ('af000000-0000-4000-8000-000000000004', 'ps-other@example.test', now()),
  ('af000000-0000-4000-8000-000000000005', 'ps-operator@strelva.example.test', now()),
  ('af000000-0000-4000-8000-000000000006', 'ps-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('af000000-0000-4000-8000-000000000005', 'ps-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('af000000-0000-4000-8000-000000000010', 'customer', 'Policy Fixture Firm', 'af000000-0000-4000-8000-000000000001'),
  ('af000000-0000-4000-8000-000000000011', 'customer', 'Policy Other Business', 'af000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('af000000-0000-4000-8000-000000000010', 'af000000-0000-4000-8000-000000000001', 'owner', 'af000000-0000-4000-8000-000000000001'),
  ('af000000-0000-4000-8000-000000000011', 'af000000-0000-4000-8000-000000000004', 'owner', 'af000000-0000-4000-8000-000000000004');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('ps-fixture-site', 'af000000-0000-4000-8000-0000000000a1', 'Policy Fixture Site', true, 'ps-owner@example.test'),
  ('ps-unlinked-site', 'af000000-0000-4000-8000-0000000000a2', 'Policy Unlinked Site', true, 'ps-other@example.test');
insert into public.memberships(user_id, tenant_id, role, tenant_stable_id) values
  ('af000000-0000-4000-8000-000000000002', 'ps-fixture-site', 'editor', 'af000000-0000-4000-8000-0000000000a1'),
  ('af000000-0000-4000-8000-000000000003', 'ps-fixture-site', 'viewer', 'af000000-0000-4000-8000-0000000000a1'),
  ('af000000-0000-4000-8000-000000000004', 'ps-unlinked-site', 'owner', 'af000000-0000-4000-8000-0000000000a2');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
  values ('af000000-0000-4000-8000-0000000000a1', 'ps-fixture-site', 'af000000-0000-4000-8000-000000000010',
    'af000000-0000-4000-8000-000000000005', 'af000000-0000-4000-8000-0000000000b1', repeat('b', 64), '{}'::jsonb);

-- Reads ----------------------------------------------------------------------
select pg_temp.ps_assert(public.read_tenant_decision_routes('ps-unlinked-site') is null, 'an unlinked tenant has no routes');
select pg_temp.ps_assert(public.read_tenant_decision_routes('no-such-site') is null, 'an unknown tenant has no routes');
select pg_temp.ps_assert(
  public.read_tenant_decision_routes('ps-fixture-site')->'imported' = '[]'::jsonb
  and public.read_tenant_decision_routes('ps-fixture-site')#>>'{routes,copy.routine,route}' = 'strelva_reviews'
  and public.read_tenant_decision_routes('ps-fixture-site')#>>'{routes,review.reply,route}' = 'handle_after_notice',
  'a linked tenant with nothing moved reads the code defaults and no imports');

-- Who may write --------------------------------------------------------------
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000003','ps-viewer@example.test','owner','review.reply','owner_decides','approve',null,'owner_save')$$, 'decision_policy_access_denied');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000004','ps-other@example.test','owner','review.reply','owner_decides','approve',null,'owner_save')$$, 'decision_policy_access_denied');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000006','ps-unverified@example.test','owner','review.reply','owner_decides','approve',null,'owner_save')$$, 'decision_policy_access_denied');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','wrong@example.test','owner','review.reply','owner_decides','approve',null,'owner_save')$$, 'decision_policy_access_denied');
-- A tenant member never writes Strelva's layer, and nobody but an operator seeds.
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','strelva','copy.routine','handle','auto',null,'operator_save')$$, 'decision_policy_access_denied');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000001','ps-owner@example.test','owner','review.reply','owner_decides','approve',null,'seed')$$, 'decision_policy_access_denied');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-unlinked-site','af000000-0000-4000-8000-000000000004','ps-other@example.test','owner','review.reply','owner_decides','approve',null,'owner_save')$$, 'decision_policy_not_linked');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','owner','copy.marketing','owner_decides','approve',null,'owner_save')$$, 'decision_policy_invalid');

-- Floors and Strelva's default hold on the tenant path too.
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','owner','copy.routine','handle','auto',null,'owner_save')$$, 'decision_policy_looser_than_default');
select pg_temp.ps_expect($$select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test','strelva','review.reply','handle','auto',null,'operator_save')$$, 'decision_policy_below_floor');
select pg_temp.ps_assert((select count(*) from public.decision_policy_tenant_imports) = 0, 'a refused write records no import');

-- An editor's "approve" reply mode becomes the owner's stricter setting, with a history receipt and an import receipt.
select pg_temp.ps_assert((public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','owner','review.reply','owner_decides','approve',null,'owner_save'))#>>'{state,route}' = 'owner_decides',
  'an editor makes review replies the owner''s call');
select pg_temp.ps_assert((select count(*) from public.decision_policy_history where workspace_id = 'af000000-0000-4000-8000-000000000010' and change_kind = 'review.reply' and set_reason = 'owner_setting' and new_route = 'owner_decides') = 1,
  'the change leaves one history receipt');
select pg_temp.ps_assert((select today_value from public.decision_policy_tenant_imports where change_kind = 'review.reply') = 'approve'
  and public.read_tenant_decision_routes('ps-fixture-site')->'imported' = '["review.reply"]'::jsonb,
  'the first save records today''s value once');
-- The same value again writes no new history.
select public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','owner','review.reply','owner_decides','approve',null,'owner_save');
select pg_temp.ps_assert((select count(*) from public.decision_policy_history where workspace_id = 'af000000-0000-4000-8000-000000000010' and change_kind = 'review.reply') = 1,
  'an unchanged route leaves no extra receipt');
-- "auto" clears the owner's row: back to Strelva's default.
select pg_temp.ps_assert((public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000001','ps-owner@example.test','owner','review.reply',null,'auto',null,'owner_save'))#>>'{state,route}' = 'handle_after_notice',
  'the business owner clears the row back to default');
select pg_temp.ps_assert((select set_reason from public.decision_policy_history where workspace_id = 'af000000-0000-4000-8000-000000000010' and change_kind = 'review.reply' order by version desc limit 1) = 'owner_reset',
  'clearing is an owner_reset receipt');
select pg_temp.ps_assert((select today_value from public.decision_policy_tenant_imports where change_kind = 'review.reply') = 'approve',
  'the import receipt keeps the first value');
select pg_temp.ps_expect($$update public.decision_policy_tenant_imports set today_value = 'auto'$$, 'decision_policy_import_immutable');

-- Content autonomy "auto" is recorded honestly: the owner can't loosen past Strelva's default.
select pg_temp.ps_assert((public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000002','ps-editor@example.test','owner','copy.routine',null,'auto','Strelva reviews routine copy for this business.','owner_save'))#>>'{state,route}' = 'strelva_reviews',
  'auto is not migrated silently');
select pg_temp.ps_assert((select not_migrated from public.decision_policy_tenant_imports where change_kind = 'copy.routine') like 'Strelva reviews%',
  'the import says why it was not carried over');
-- An operator can grant it as Strelva's setting.
select pg_temp.ps_assert((public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test','strelva','copy.routine','handle','auto',null,'operator_save'))#>>'{state,route}' = 'handle',
  'an operator sets routine copy to handle');
select pg_temp.ps_assert((select set_reason from public.decision_policies where workspace_id = 'af000000-0000-4000-8000-000000000010' and change_kind = 'copy.routine' and layer = 'strelva') = 'strelva_default',
  'the operator write is Strelva''s layer');
-- The seed moves an owner choice as an operator.
select pg_temp.ps_assert((public.set_tenant_decision_route('ps-fixture-site','af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test','owner','review.reply','owner_decides','approve',null,'seed'))#>>'{state,route}' = 'owner_decides',
  'the operator seed writes the owner''s existing choice');
select pg_temp.ps_assert((select set_reason from public.decision_policies where workspace_id = 'af000000-0000-4000-8000-000000000010' and change_kind = 'review.reply' and layer = 'owner') = 'seed',
  'a seeded row says so');

-- Owner not told -------------------------------------------------------------
create temporary table ps_items(name text primary key, id uuid);
insert into ps_items select 'suppressed', (public.open_owner_decision('af000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the booking page live','approveEffect','It goes live','notYetEffect','Nothing goes live',
  'sourceLifecycle','website_document','sourceId','ps-doc-1','revisionHash', repeat('4',64),'openedAt', (now() - interval '15 days')::text))->>'id')::uuid;
insert into ps_items select 'sent', (public.open_owner_decision('af000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','structure','route','owner_decides','title','Add a services page','approveEffect','It starts','notYetEffect','Nothing changes',
  'sourceLifecycle','tenant_event','sourceId','ps-fixture-site:evt-2','revisionHash', repeat('5',64),'openedAt', (now() - interval '15 days')::text))->>'id')::uuid;
insert into ps_items select 'never', (public.open_owner_decision('af000000-0000-4000-8000-000000000011', jsonb_build_object(
  'kind','structure','route','owner_decides','title','Change the footer','approveEffect','It starts','notYetEffect','Nothing changes',
  'sourceLifecycle','tenant_event','sourceId','other:evt-3','revisionHash', repeat('6',64)))->>'id')::uuid;
insert into ps_items select 'review', (public.open_owner_decision('af000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','google.post','route','strelva_reviews','title','Post a tip on Google','approveEffect','It posts','notYetEffect','Nothing posts',
  'sourceLifecycle','tenant_event','sourceId','ps-fixture-site:evt-4','revisionHash', repeat('7',64)))->>'id')::uuid;
select public.record_owner_decision_delivery('af000000-0000-4000-8000-000000000010', (select id from ps_items where name = 'suppressed'), 'digest', 'suppressed', 'ps-owner@example.test', null, 'client_email_disabled');
select public.record_owner_decision_delivery('af000000-0000-4000-8000-000000000010', (select id from ps_items where name = 'sent'), 'digest', 'sent', 'ps-owner@example.test', 'msg-1', null);

select pg_temp.ps_expect($$select public.list_owner_decisions_not_told('af000000-0000-4000-8000-000000000001','ps-owner@example.test',50)$$, 'owner_decision_access_denied');
select pg_temp.ps_expect($$select public.list_owner_decisions_not_told('af000000-0000-4000-8000-000000000005','someone@example.test',50)$$, 'owner_decision_access_denied');
create temporary table ps_not_told as select value as row from jsonb_array_elements(
  public.list_owner_decisions_not_told('af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test',50));
select pg_temp.ps_assert((select count(*) from ps_not_told where row->>'id' in (select id::text from ps_items)) = 2,
  'the suppressed and never-sent owner items are listed, across businesses');
select pg_temp.ps_assert(exists (select 1 from ps_not_told where row->>'id' = (select id::text from ps_items where name = 'suppressed')
    and row#>>'{lastDelivery,status}' = 'suppressed' and row#>>'{lastDelivery,reason}' = 'client_email_disabled' and row->>'businessName' = 'Policy Fixture Firm'),
  'a suppressed item carries why and its business');
select pg_temp.ps_assert(exists (select 1 from ps_not_told where row->>'id' = (select id::text from ps_items where name = 'never') and row->'lastDelivery' = 'null'::jsonb),
  'a never-sent item is listed with no delivery');
select pg_temp.ps_assert(not exists (select 1 from ps_not_told where row->>'id' in (select id::text from ps_items where name in ('sent','review'))),
  'a told owner and a Strelva review are not listed');
-- A lapse with no email sent stays listed; one the owner was told about does not.
select public.expire_owner_decision('af000000-0000-4000-8000-000000000010', (select id from ps_items where name = 'suppressed'));
select public.expire_owner_decision('af000000-0000-4000-8000-000000000010', (select id from ps_items where name = 'sent'));
select pg_temp.ps_assert(
  exists (select 1 from jsonb_array_elements(public.list_owner_decisions_not_told('af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test',50)) e
    where e.value->>'id' = (select id::text from ps_items where name = 'suppressed') and e.value->>'state' = 'expired')
  and not exists (select 1 from jsonb_array_elements(public.list_owner_decisions_not_told('af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test',50)) e
    where e.value->>'id' = (select id::text from ps_items where name = 'sent')),
  'a lapse nobody was told about stays on the operator''s list');

-- Businesses -----------------------------------------------------------------
select pg_temp.ps_expect($$select public.list_decision_policy_businesses('af000000-0000-4000-8000-000000000001','ps-owner@example.test')$$, 'decision_policy_access_denied');
select pg_temp.ps_assert(exists (select 1 from jsonb_array_elements(public.list_decision_policy_businesses('af000000-0000-4000-8000-000000000005','ps-operator@strelva.example.test')) e
    where e.value->>'name' = 'Policy Fixture Firm' and (e.value->>'strelvaRows')::int = 1 and (e.value->>'ownerRows')::int = 1),
  'operators see each business with its policy rows counted');
rollback;
