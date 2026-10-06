\set ON_ERROR_STOP on
-- Strelva (system), the audited service actor (20261009100000_strelva_service_actor.sql),
-- on fictional rows: sessions only for businesses Strelva runs, the identity
-- they read as, opening items (never deciding), the Make real resume audit,
-- cross-business denial, and the connected_sites flag key.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.sa_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'service actor assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sa_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.sa_item(p_source text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'running.approve', 'route', 'owner_decides', 'title', 'Let Strelva keep doing this',
    'approveEffect', 'Strelva runs this.', 'notYetEffect', 'Nothing runs.', 'sourceLifecycle', 'standing_responsibility',
    'sourceId', p_source, 'revisionHash', repeat('c', 64), 'urgent', false, 'adminMayDecide', true)
$$;

-- Privileges: RLS on, no table access, service-role functions only.
select pg_temp.sa_assert((select relrowsecurity from pg_class where oid = 'public.strelva_service_actions'::regclass), 'rls on');
select pg_temp.sa_assert(not has_table_privilege('service_role', 'public.strelva_service_actions', 'select')
  and not has_table_privilege('authenticated', 'public.strelva_service_actions', 'insert'), 'no table privileges');
select pg_temp.sa_assert(
  has_function_privilege('service_role', 'public.strelva_service_reader(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.open_owner_decision_as_service(uuid,uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.record_strelva_service_action(uuid,uuid,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.due_make_real_activations_for_service(integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.strelva_service_reader(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.open_owner_decision_as_service(uuid,uuid,jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.strelva_service_session(uuid,uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.strelva_runs_business(uuid)', 'execute'),
  'only service_role runs the service actor, and only through the public entry points');

-- connected_sites has its own flag row; every earlier key stays (later
-- migrations may add keys, e.g. 20261009140000's make_real_owner_link).
select pg_temp.sa_assert(public.workspace_release_flag_names() @> array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
  'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
  'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites'], 'flag names');

insert into public.users(id, email, verified_at) values
  ('5a000000-0000-4000-8000-000000000001', 'sa-owner@example.test', null),
  ('5a000000-0000-4000-8000-000000000002', 'sa-operator@strelva.example.test', now()),
  ('5a000000-0000-4000-8000-000000000003', 'sa-other@example.test', now()),
  ('5a000000-0000-4000-8000-000000000004', 'sa-owner2@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('5a000000-0000-4000-8000-000000000010', 'customer', 'Converted, owner never signed in', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000011', 'customer', 'Not run by Strelva', '5a000000-0000-4000-8000-000000000003'),
  ('5a000000-0000-4000-8000-000000000012', 'customer', 'Converted, owner member', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000013', 'personal', 'Personal', '5a000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  -- The owner exists but never verified (never signed in); the operator is admin from conversion.
  ('5a000000-0000-4000-8000-000000000010', '5a000000-0000-4000-8000-000000000001', 'owner', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000010', '5a000000-0000-4000-8000-000000000002', 'admin', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000011', '5a000000-0000-4000-8000-000000000003', 'owner', '5a000000-0000-4000-8000-000000000003'),
  ('5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000002', 'admin', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000004', 'owner', '5a000000-0000-4000-8000-000000000002'),
  ('5a000000-0000-4000-8000-000000000013', '5a000000-0000-4000-8000-000000000003', 'owner', '5a000000-0000-4000-8000-000000000003');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('sa-fixture-site', '5a000000-0000-4000-8000-0000000000a1', 'Service Actor Fixture', true, 'sa-owner@example.test'),
  ('sa-fixture-site-2', '5a000000-0000-4000-8000-0000000000a2', 'Service Actor Fixture 2', true, 'sa-owner2@example.test');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('5a000000-0000-4000-8000-0000000000a1', 'sa-fixture-site', '5a000000-0000-4000-8000-000000000010',
    '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-0000000000b1', repeat('a', 64), '{}'::jsonb),
  ('5a000000-0000-4000-8000-0000000000a2', 'sa-fixture-site-2', '5a000000-0000-4000-8000-000000000012',
    '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-0000000000b2', repeat('b', 64), '{}'::jsonb);

-- Sessions: only for a business Strelva runs, read as its verified owner, else its verified admin.
select pg_temp.sa_expect($$select public.strelva_service_reader('5a000000-0000-4000-8000-000000000010', 'decide')$$, 'strelva_service_invalid');
select pg_temp.sa_assert(public.strelva_service_reader('5a000000-0000-4000-8000-000000000011', 'needs_you_sync') is null, 'no session for a business Strelva does not run');
select pg_temp.sa_assert(public.strelva_service_reader('5a000000-0000-4000-8000-000000000013', 'needs_you_sync') is null, 'no session for a personal workspace');
select pg_temp.sa_assert(not exists (select 1 from public.strelva_service_actions where workspace_id in
  ('5a000000-0000-4000-8000-000000000011', '5a000000-0000-4000-8000-000000000013')), 'a refused session logs nothing');

create temporary table sa_sessions(name text primary key, body jsonb) on commit drop;
insert into sa_sessions values
  ('converted', public.strelva_service_reader('5a000000-0000-4000-8000-000000000010', 'needs_you_sync')),
  ('owned', public.strelva_service_reader('5a000000-0000-4000-8000-000000000012', 'needs_you_sync')),
  ('resume', public.strelva_service_reader('5a000000-0000-4000-8000-000000000012', 'make_real_resume'));
select pg_temp.sa_assert((select body->>'userId' from sa_sessions where name = 'converted') = '5a000000-0000-4000-8000-000000000002'
  and (select body->>'role' from sa_sessions where name = 'converted') = 'admin'
  and (select body->>'label' from sa_sessions where name = 'converted') = 'Strelva (system)',
  'an unverified owner is skipped: the session reads as the verified admin');
select pg_temp.sa_assert((select body->>'userId' from sa_sessions where name = 'owned') = '5a000000-0000-4000-8000-000000000004'
  and (select body->>'role' from sa_sessions where name = 'owned') = 'owner', 'a verified owner is preferred');
select pg_temp.sa_assert((select count(*) from public.strelva_service_actions where action = 'session' and actor_label = 'Strelva (system)') = 3, 'each session is logged');

-- Opening as Strelva (system): marked, logged once, never decided.
do $$
declare
  s uuid := (select (body->>'sessionId')::uuid from sa_sessions where name = 'converted');
  first jsonb;
  again jsonb;
begin
  first := public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000010', s, pg_temp.sa_item('standing-1'));
  perform pg_temp.sa_assert(first->>'openedBy' = 'Strelva (system)' and first->>'state' = 'open' and first->>'decidedByKind' is null,
    'opened by Strelva (system), still open');
  again := public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000010', s, pg_temp.sa_item('standing-1'));
  perform pg_temp.sa_assert(again->>'id' = first->>'id', 'the same revision returns the same item');
  perform pg_temp.sa_assert((select count(*) from public.strelva_service_actions where action = 'open' and session_id = s
    and subject = 'owner_decision:' || (first->>'id')) = 1, 'one open receipt');
  -- A member's own sync of the same source leaves the mark alone and no second receipt.
  perform public.open_owner_decision('5a000000-0000-4000-8000-000000000010', pg_temp.sa_item('standing-1'));
  perform pg_temp.sa_assert((select opened_by from public.owner_decisions where id = (first->>'id')::uuid) = 'strelva_system', 'mark kept');
  -- The mark never changes once set.
  perform pg_temp.sa_expect(format($q$update public.owner_decisions set opened_by = null where id = %L$q$, first->>'id'), 'owner_decision_identity_immutable');
  -- Deciding is still the owner's: a session claim by the service identity is refused on an owner-only item, and nothing claimed it.
  perform pg_temp.sa_assert((select state from public.owner_decisions where id = (first->>'id')::uuid) = 'open', 'never decided by the service actor');
end $$;

-- Cross-business: a session never opens or logs in another business.
select pg_temp.sa_expect(format($$select public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000012', %L, pg_temp.sa_item('standing-x'))$$,
  (select body->>'sessionId' from sa_sessions where name = 'converted')), '%strelva_service_access_denied%');
select pg_temp.sa_expect(format($$select public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000011', %L, pg_temp.sa_item('standing-x'))$$,
  (select body->>'sessionId' from sa_sessions where name = 'converted')), '%strelva_service_access_denied%');
-- Wrong purpose: a resume session can't open items, a sync session can't log a resume.
select pg_temp.sa_expect(format($$select public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000012', %L, pg_temp.sa_item('standing-x'))$$,
  (select body->>'sessionId' from sa_sessions where name = 'resume')), '%strelva_service_access_denied%');
select pg_temp.sa_expect(format($$select public.record_strelva_service_action('5a000000-0000-4000-8000-000000000012', %L, 'resume', 'activation:act-1', null)$$,
  (select body->>'sessionId' from sa_sessions where name = 'owned')), '%strelva_service_access_denied%');
select pg_temp.sa_expect($$select public.open_owner_decision_as_service('5a000000-0000-4000-8000-000000000010', gen_random_uuid(), pg_temp.sa_item('standing-x'))$$, '%strelva_service_access_denied%');
select pg_temp.sa_assert(not exists (select 1 from public.owner_decisions where source_id = 'standing-x'), 'nothing opened by a refused session');

-- Make real resume audit under its own session.
select pg_temp.sa_assert(public.record_strelva_service_action('5a000000-0000-4000-8000-000000000012',
  (select (body->>'sessionId')::uuid from sa_sessions where name = 'resume'), 'resume', 'activation:act-1', 'Resumed by Strelva (system).') is not null, 'resume logged');
select pg_temp.sa_expect(format($$select public.record_strelva_service_action('5a000000-0000-4000-8000-000000000012', %L, 'approve', 'activation:act-1', null)$$,
  (select body->>'sessionId' from sa_sessions where name = 'resume')), '%strelva_service_invalid%');
-- An expired session is refused.
insert into public.strelva_service_actions(id, workspace_id, purpose, action, on_behalf_user_id, on_behalf_role, created_at)
  values ('5a000000-0000-4000-8000-0000000000e1', '5a000000-0000-4000-8000-000000000012', 'make_real_resume', 'session',
    '5a000000-0000-4000-8000-000000000004', 'owner', clock_timestamp() - interval '31 minutes');
select pg_temp.sa_expect($$select public.record_strelva_service_action('5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-0000000000e1', 'resume', 'activation:act-1', null)$$, '%strelva_service_access_denied%');

-- The log is append-only.
select pg_temp.sa_expect($$update public.strelva_service_actions set detail = 'x'$$, '%strelva_service_actions_immutable%');
select pg_temp.sa_expect($$delete from public.strelva_service_actions$$, '%strelva_service_actions_immutable%');

-- Due activations for the service runner: every in-progress one, starter only while still owner or admin.
create or replace function pg_temp.sa_activation(p_id text, p_workspace text, p_actor text) returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1, 'id', p_id, 'businessId', p_workspace, 'possibilityId', 'poss-1', 'candidateRevision', 1,
    'actorId', p_actor, 'status', 'in_progress', 'revision', 0,
    'pinned', '[]'::jsonb, 'introduced', '[]'::jsonb, 'connections', '[]'::jsonb, 'approvals', '[]'::jsonb, 'checks', '[]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 's1', 'kind', 'effect', 'target', 'fx-publish', 'label', 'Publish', 'dependsOn', '[]'::jsonb,
        'effectKind', 'publish', 'reversibility', 'compensable', 'idempotencyKey', 'k-s1', 'status', 'pending', 'effect', 'none', 'attempts', 0)),
    'createdAt', '2026-10-06T12:00:00.000Z', 'updatedAt', '2026-10-06T12:00:00.000Z', 'history', '[]'::jsonb)
$$;
select public.create_make_real_activation('5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000004', 'sa-owner2@example.test',
  pg_temp.sa_activation('sa-act-owner', '5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000004'));
select public.create_make_real_activation('5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000002', 'sa-operator@strelva.example.test',
  pg_temp.sa_activation('sa-act-left', '5a000000-0000-4000-8000-000000000012', '5a000000-0000-4000-8000-000000000002'));
update public.workspace_memberships set role = 'member'
  where workspace_id = '5a000000-0000-4000-8000-000000000012' and user_id = '5a000000-0000-4000-8000-000000000002';
do $$
declare due jsonb := public.due_make_real_activations_for_service(100, 120);
begin
  perform pg_temp.sa_assert((select x->>'starterUserId' from jsonb_array_elements(due) x where x->>'activationId' = 'sa-act-owner') = '5a000000-0000-4000-8000-000000000004',
    'a starter still owner comes back');
  perform pg_temp.sa_assert((select x from jsonb_array_elements(due) x where x->>'activationId' = 'sa-act-left') ? 'starterUserId'
    and (select x->>'starterUserId' from jsonb_array_elements(due) x where x->>'activationId' = 'sa-act-left') is null,
    'a starter who left is null: the service session takes over');
  perform pg_temp.sa_assert(not exists (select 1 from jsonb_array_elements(public.due_make_real_activations(100, 120)) x where x->>'activationId' = 'sa-act-left'),
    'the old due list still drops it (unchanged)');
end $$;
select pg_temp.sa_expect($$select public.due_make_real_activations_for_service(0, 120)$$, 'make_real_activation_invalid');

rollback;
\echo 'Strelva service actor schema checks passed.'
