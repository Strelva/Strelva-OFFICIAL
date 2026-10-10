\set ON_ERROR_STOP on
-- Make real by signed owner link for an owner with no account
-- (20261009131000_make_real_owner_link.sql), on fictional rows: the
-- make_real_link session is bound to one open Make real decision and the
-- owner recipient, refused everywhere else, and logs exactly one run after
-- the link approved it. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ml_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'make real link assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ml_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ml_item(p_kind text, p_source text, p_hash text) returns jsonb language sql as $$
  select jsonb_build_object('kind', p_kind, 'route', 'owner_decides', 'title', 'Make it live: A rebuilt website',
    'approveEffect', 'Strelva makes it live one step at a time and tells you what landed.',
    'notYetEffect', 'Nothing changes. It stays a Possibility you can open.', 'sourceLifecycle', 'make_real',
    'sourceId', p_source, 'revisionHash', p_hash, 'urgent', false, 'adminMayDecide', false)
$$;

select pg_temp.ml_assert(
  has_function_privilege('service_role', 'public.strelva_make_real_link_session(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.strelva_make_real_link_session(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.strelva_make_real_link_session(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.record_strelva_service_action(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_strelva_service_action(uuid,uuid,text,text,text)', 'execute'),
  'only service_role starts a link session or logs a run');
-- The general reader never hands out the link purpose.
select pg_temp.ml_expect($$select public.strelva_service_reader('6b000000-0000-4000-8000-000000000010', 'make_real_link')$$, 'strelva_service_invalid');

insert into public.users(id, email, verified_at) values
  ('6b000000-0000-4000-8000-000000000002', 'ml-operator@strelva.example.test', now()),
  ('6b000000-0000-4000-8000-000000000003', 'ml-other@example.test', now()),
  ('6b000000-0000-4000-8000-000000000004', 'ml-owner2@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('6b000000-0000-4000-8000-000000000010', 'customer', 'Converted, owner has no account', '6b000000-0000-4000-8000-000000000002'),
  ('6b000000-0000-4000-8000-000000000011', 'customer', 'Not run by Strelva', '6b000000-0000-4000-8000-000000000003'),
  ('6b000000-0000-4000-8000-000000000012', 'customer', 'Converted, owner has an account', '6b000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('6b000000-0000-4000-8000-000000000010', '6b000000-0000-4000-8000-000000000002', 'admin', '6b000000-0000-4000-8000-000000000002'),
  ('6b000000-0000-4000-8000-000000000011', '6b000000-0000-4000-8000-000000000003', 'owner', '6b000000-0000-4000-8000-000000000003'),
  ('6b000000-0000-4000-8000-000000000012', '6b000000-0000-4000-8000-000000000002', 'admin', '6b000000-0000-4000-8000-000000000002'),
  ('6b000000-0000-4000-8000-000000000012', '6b000000-0000-4000-8000-000000000004', 'owner', '6b000000-0000-4000-8000-000000000002');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('ml-fixture-site', '6b000000-0000-4000-8000-0000000000a1', 'Make Real Link Fixture', true, 'ML-Owner@example.test'),
  ('ml-fixture-site-2', '6b000000-0000-4000-8000-0000000000a2', 'Make Real Link Fixture 2', true, 'ml-owner2@example.test');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('6b000000-0000-4000-8000-0000000000a1', 'ml-fixture-site', '6b000000-0000-4000-8000-000000000010',
    '6b000000-0000-4000-8000-000000000002', '6b000000-0000-4000-8000-0000000000b1', repeat('a', 64), '{}'::jsonb),
  ('6b000000-0000-4000-8000-0000000000a2', 'ml-fixture-site-2', '6b000000-0000-4000-8000-000000000012',
    '6b000000-0000-4000-8000-000000000002', '6b000000-0000-4000-8000-0000000000b2', repeat('b', 64), '{}'::jsonb);

-- Batch 7A (20261009153000): the service actor serves a business whose
-- provider of record is an agency verified for the effect, Strelva's included.
-- From 7A on, these converted fixtures are provided by a Strelva agency that
-- is verified through the ordinary record; before 7A this block does nothing.
do $$
begin
  if to_regprocedure('public.record_agency_verification(text,uuid,text,text,jsonb,text)') is null then return; end if;
  insert into public.super_admins(user_id, email)
    select '6b000000-0000-4000-8000-000000000002', 'ml-operator@strelva.example.test'
    where not exists (select 1 from public.super_admins where user_id = '6b000000-0000-4000-8000-000000000002');
  insert into public.workspaces(id, kind, name, created_by)
    values ('6b000000-0000-4000-8000-000000000020', 'agency', 'Strelva agency fixture', '6b000000-0000-4000-8000-000000000002');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values ('6b000000-0000-4000-8000-000000000020', '6b000000-0000-4000-8000-000000000002', 'owner', '6b000000-0000-4000-8000-000000000002');
  perform public.designate_strelva_agency_workspace('ml-operator@strelva.example.test', '6b000000-0000-4000-8000-000000000020');
  perform public.record_agency_verification('ml-operator@strelva.example.test', '6b000000-0000-4000-8000-000000000020', 'email', 'verified', '{"fixture": true}', null);
  perform public.record_agency_verification('ml-operator@strelva.example.test', '6b000000-0000-4000-8000-000000000020', 'publish', 'verified', '{"fixture": true}', null);
end $$;

create temporary table ml_items(name text primary key, id uuid) on commit drop;
insert into ml_items values
  ('plan', (public.open_owner_decision('6b000000-0000-4000-8000-000000000010', pg_temp.ml_item('system.change_live', 'website-rebuild:w1@2', repeat('1', 64)))->>'id')::uuid),
  ('money', (public.open_owner_decision('6b000000-0000-4000-8000-000000000010', pg_temp.ml_item('money', 'website-rebuild:w2@1', repeat('2', 64)))->>'id')::uuid),
  ('not-make-real', (public.open_owner_decision('6b000000-0000-4000-8000-000000000010', jsonb_build_object('kind', 'system.go_live', 'route', 'owner_decides',
     'title', 'Launch the site', 'approveEffect', 'It launches.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'website_document',
     'sourceId', 'w3', 'revisionHash', repeat('3', 64)))->>'id')::uuid),
  ('not-run', (public.open_owner_decision('6b000000-0000-4000-8000-000000000011', pg_temp.ml_item('system.change_live', 'website-rebuild:w4@1', repeat('4', 64)))->>'id')::uuid),
  ('has-account', (public.open_owner_decision('6b000000-0000-4000-8000-000000000012', pg_temp.ml_item('system.go_live', 'website-rebuild:w5@1', repeat('5', 64)))->>'id')::uuid);

-- Refused: another recipient, another business's decision, a sign-in kind, another lifecycle, an owner with an account.
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', %L, 'someone@example.test')$$,
  (select id from ml_items where name = 'plan')), 'owner_decision_recipient_not_owner');
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000012', %L, 'ml-owner@example.test')$$,
  (select id from ml_items where name = 'plan')), 'strelva_service_access_denied');
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', %L, 'ml-owner@example.test')$$,
  (select id from ml_items where name = 'money')), 'strelva_service_access_denied');
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', %L, 'ml-owner@example.test')$$,
  (select id from ml_items where name = 'not-make-real')), 'strelva_service_access_denied');
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000012', %L, 'ml-owner2@example.test')$$,
  (select id from ml_items where name = 'has-account')), 'strelva_service_owner_has_account');
select pg_temp.ml_expect($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', null, 'ml-owner@example.test')$$, 'strelva_service_invalid');
-- A business Strelva doesn't run has no tenant fallback for its owner recipient, so no link reaches a session there.
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000011', %L, 'ml-other@example.test')$$,
  (select id from ml_items where name = 'not-run')), 'owner_decision_recipient_not_owner');
select pg_temp.ml_assert(not exists (select 1 from public.strelva_service_actions where purpose = 'make_real_link'), 'a refused session logs nothing');

-- The owner recipient on record gets a session bound to that one decision, reading as the verified admin.
create temporary table ml_session on commit drop as
  select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', (select id from ml_items where name = 'plan'), ' ML-Owner@Example.test ') as body;
select pg_temp.ml_assert((select body->>'purpose' = 'make_real_link' and body->>'role' = 'admin'
    and body->>'userId' = '6b000000-0000-4000-8000-000000000002' and body->>'label' = 'Strelva (system)'
    and body->>'decisionId' = (select id::text from ml_items where name = 'plan') from ml_session),
  'the session reads as the verified admin, for this decision');
select pg_temp.ml_assert((select subject = 'owner_decision:' || (select id::text from ml_items where name = 'plan')
    from public.strelva_service_actions where id = (select (body->>'sessionId')::uuid from ml_session)),
  'the session is logged with its decision');

-- Before the owner's link approves it, the session runs nothing.
select pg_temp.ml_expect(format($$select public.record_strelva_service_action('6b000000-0000-4000-8000-000000000010', %L, 'run', 'possibility:website-rebuild:w1', null)$$,
  (select body->>'sessionId' from ml_session)), 'strelva_service_access_denied');

-- The owner approves by link: the decision names the owner's link, and the plan fingerprint must match.
select pg_temp.ml_assert((public.claim_owner_decision('6b000000-0000-4000-8000-000000000010', (select id from ml_items where name = 'plan'), repeat('9', 64),
  'approve', 'owner_link', null, null, 'ml-owner@example.test')->>'status') = 'changed', 'a stale plan fingerprint refuses');
-- From 20261013120000 a link decides only once it was sent to the trusted owner.
select pg_temp.ml_assert((public.record_owner_decision_delivery('6b000000-0000-4000-8000-000000000010', (select id from ml_items where name = 'plan'),
  'digest', 'sent', 'ml-owner@example.test', 'ml-plan-message', null)->>'deliveryState') = 'sent', 'the plan link is sent to the owner');
select pg_temp.ml_assert((public.claim_owner_decision('6b000000-0000-4000-8000-000000000010', (select id from ml_items where name = 'plan'), repeat('1', 64),
  'approve', 'owner_link', null, null, 'ml-owner@example.test')->>'status') = 'claimed', 'the owner link approves the plan');

-- Only a run, only once, only in this business, only with this session.
select pg_temp.ml_expect(format($$select public.record_strelva_service_action('6b000000-0000-4000-8000-000000000010', %L, 'rollback', 'activation:a1', null)$$,
  (select body->>'sessionId' from ml_session)), 'strelva_service_access_denied');
select pg_temp.ml_expect(format($$select public.record_strelva_service_action('6b000000-0000-4000-8000-000000000012', %L, 'run', 'possibility:website-rebuild:w1', null)$$,
  (select body->>'sessionId' from ml_session)), 'strelva_service_access_denied');
select pg_temp.ml_assert(public.record_strelva_service_action('6b000000-0000-4000-8000-000000000010', (select (body->>'sessionId')::uuid from ml_session),
  'run', 'possibility:website-rebuild:w1', 'Make real started on the owner''s link approval.') is not null, 'one run is logged');
select pg_temp.ml_assert((select purpose = 'make_real_link' from public.strelva_service_actions
    where session_id = (select (body->>'sessionId')::uuid from ml_session) and action = 'run'), 'the run is logged under the link purpose');
select pg_temp.ml_expect(format($$select public.record_strelva_service_action('6b000000-0000-4000-8000-000000000010', %L, 'run', 'possibility:website-rebuild:w1', null)$$,
  (select body->>'sessionId' from ml_session)), 'strelva_service_access_denied');
-- Once the decision is approved (not open), no new link session starts for it.
select pg_temp.ml_expect(format($$select public.strelva_make_real_link_session('6b000000-0000-4000-8000-000000000010', %L, 'ml-owner@example.test')$$,
  (select id from ml_items where name = 'plan')), 'strelva_service_access_denied');

-- The log stays append-only.
select pg_temp.ml_expect($$update public.strelva_service_actions set detail = 'x' where purpose = 'make_real_link'$$, 'strelva_service_actions_immutable');
select pg_temp.ml_expect($$insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role)
  values ('6b000000-0000-4000-8000-000000000010', 'decide', 'session', '6b000000-0000-4000-8000-000000000002', 'admin')$$,
  '%strelva_service_actions_purpose_check%');

rollback;
\echo 'Make real owner link SQL checks passed.'
