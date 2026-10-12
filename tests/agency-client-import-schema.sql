\set ON_ERROR_STOP on
-- Import clients and per-agency add limits (20261024200000), on fictional
-- rows: an agency without a row keeps the shared default; only a verified
-- operator sets one agency's limits, with a reason, a revision guard and an
-- immutable history; a raised or lowered limit binds that agency alone; the
-- import preview reads which keys and websites are already added, for an
-- owner or admin only, and never another agency's. A replayed import key
-- uses no quota. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ci_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency client import assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ci_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Privileges: RLS on, no table access, service-role commands only.
select pg_temp.ci_assert((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.agency_client_add_limit_overrides'::regclass, 'public.agency_client_add_limit_changes'::regclass)), 'rls on');
select pg_temp.ci_assert(not has_table_privilege('service_role', 'public.agency_client_add_limit_overrides', 'select')
  and not has_table_privilege('authenticated', 'public.agency_client_add_limit_changes', 'insert'), 'no table privileges');
select pg_temp.ci_assert(
  has_function_privilege('service_role', 'public.set_agency_client_add_limits(text,uuid,integer,integer,text,bigint)', 'execute')
  and has_function_privilege('service_role', 'public.agency_client_import_preview(uuid,text,uuid,uuid[],text[])', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_client_add_limits(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_agency_client_add_limits(text,uuid,integer,integer,text,bigint)', 'execute')
  and not has_function_privilege('anon', 'public.agency_client_import_preview(uuid,text,uuid,uuid[],text[])', 'execute')
  and not has_function_privilege('service_role', 'public.agency_client_add_limits_for(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.agency_client_add_limits_json(uuid)', 'execute'),
  'only service_role runs the commands');
-- agency_add_client is the 20261015100000 body with only the limits read changed.
select pg_temp.ci_assert(position('agency_client_add_limits_for(p_agency_workspace_id)' in pg_get_functiondef('public.agency_add_client(uuid,text,uuid,jsonb,uuid,text)'::regprocedure)) > 0
  and position('agency_client_add_limits()' in pg_get_functiondef('public.agency_add_client(uuid,text,uuid,jsonb,uuid,text)'::regprocedure)) = 0,
  'agency_add_client reads the per-agency limits');

insert into public.users(id, email, verified_at) values
  ('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', now()),
  ('c1000000-0000-4000-8000-000000000002', 'ci-a-member@agency-a.example.test', now()),
  ('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test', now()),
  ('c1000000-0000-4000-8000-000000000004', 'ci-operator@strelva.example.test', now()),
  ('c1000000-0000-4000-8000-000000000005', 'ci-unverified-operator@strelva.example.test', null);
insert into public.super_admins(user_id, email) values
  ('c1000000-0000-4000-8000-000000000004', 'ci-operator@strelva.example.test'),
  ('c1000000-0000-4000-8000-000000000005', 'ci-unverified-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('c1000000-0000-4000-8000-000000000020', 'agency', 'Import Agency A', 'c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000030', 'agency', 'Import Agency B', 'c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000040', 'customer', 'Not an agency', 'c1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('c1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000001', 'owner', 'c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000020', 'c1000000-0000-4000-8000-000000000002', 'member', 'c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000030', 'c1000000-0000-4000-8000-000000000003', 'owner', 'c1000000-0000-4000-8000-000000000003');

-- Default unchanged without a row.
select pg_temp.ci_assert((select daily = 25 and waiting_for_owner = 100 from public.agency_client_add_limits_for('c1000000-0000-4000-8000-000000000020')), 'default 25/100');
select pg_temp.ci_assert((public.read_agency_client_add_limits('c1000000-0000-4000-8000-000000000002', 'ci-a-member@agency-a.example.test',
  'c1000000-0000-4000-8000-000000000020') @> '{"daily":25,"waitingForOwner":100,"raised":false,"revision":0,"usedToday":0,"waiting":0}'), 'member reads defaults');
select pg_temp.ci_expect($$select public.read_agency_client_add_limits('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test',
  'c1000000-0000-4000-8000-000000000020')$$, 'agency_client_access_denied');

-- Only a verified operator, with a reason, the right revision and a real agency.
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 1, 'raise it', 0)$$, 'workspace_release_operator_required');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-unverified-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 1, 'raise it', 0)$$, 'workspace_release_operator_required');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 1, ' ', 0)$$, 'agency_client_limits_reason_required');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, null, 'half set', 0)$$, 'agency_client_limits_invalid');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 0, 5, 'zero', 0)$$, 'agency_client_limits_invalid');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 501, 5, 'too many', 0)$$, 'agency_client_limits_invalid');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000040', 2, 5, 'customer', 0)$$, 'agency_client_limits_agency_invalid');
select pg_temp.ci_expect($$select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 5, 'stale', 3)$$, 'agency_client_limits_revision_conflict');

-- Agency A is set to 2 a day and 3 waiting; Agency B keeps the default.
select pg_temp.ci_assert((public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 3,
  'Fixture: small agency trial', 0) @> '{"daily":2,"waitingForOwner":3,"raised":true,"revision":1}'), 'operator sets A');
select pg_temp.ci_assert((select daily = 25 from public.agency_client_add_limits_for('c1000000-0000-4000-8000-000000000030')), 'B keeps default');
select pg_temp.ci_assert((select count(*) = 1 from public.agency_client_add_limit_changes where workspace_id = 'c1000000-0000-4000-8000-000000000020'
  and before_limits is null and after_limits = '{"daily":2,"waitingForOwner":3}' and reason = 'Fixture: small agency trial'), 'history row');
select pg_temp.ci_expect($$update public.agency_client_add_limit_changes set reason = 'rewritten'$$, 'workspace_release_history_immutable');
select pg_temp.ci_expect($$delete from public.agency_client_add_limit_changes$$, 'workspace_release_history_immutable');
-- Same values: no new revision, no new history.
select pg_temp.ci_assert((public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 2, 3,
  'Fixture: same again', 1) @> '{"revision":1}'), 'no-op keeps revision');
select pg_temp.ci_assert((select count(*) = 1 from public.agency_client_add_limit_changes), 'no-op writes no history');

-- Import keys: two rows for A under its daily limit of 2.
select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Northside Bakery","sourceUrl":"https://www.northside-bakery.example.test/"}', 'c1000000-0000-4000-8000-0000000000a1', repeat('1', 64));
select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Corner Plumbing"}', 'c1000000-0000-4000-8000-0000000000a2', repeat('2', 64));
-- A replay of the same key uses no quota and is reported as a replay.
select pg_temp.ci_assert((public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Corner Plumbing"}', 'c1000000-0000-4000-8000-0000000000a2', repeat('2', 64)) ->> 'replayed')::boolean, 'replay');
select pg_temp.ci_expect($$select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Corner Plumbing Co"}', 'c1000000-0000-4000-8000-0000000000a2', repeat('3', 64))$$, 'agency_client_idempotency_conflict');
-- The third new row hits A's own daily limit of 2.
select pg_temp.ci_expect($$select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Third Today"}', 'c1000000-0000-4000-8000-0000000000a3', repeat('4', 64))$$, 'agency_client_daily_limit');
-- B is not bound by A's limit.
select public.agency_add_client('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test', 'c1000000-0000-4000-8000-000000000030',
  '{"name":"B One","sourceUrl":"https://northside-bakery.example.test/"}', 'c1000000-0000-4000-8000-0000000000b1', repeat('5', 64));
select public.agency_add_client('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test', 'c1000000-0000-4000-8000-000000000030',
  '{"name":"B Two"}', 'c1000000-0000-4000-8000-0000000000b2', repeat('6', 64));
select public.agency_add_client('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test', 'c1000000-0000-4000-8000-000000000030',
  '{"name":"B Three"}', 'c1000000-0000-4000-8000-0000000000b3', repeat('7', 64));

-- Raising A's daily limit lets it continue today; its waiting limit of 3 then binds.
select public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', 10, 3, 'Fixture: raise daily', 1);
select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Third Today"}', 'c1000000-0000-4000-8000-0000000000a3', repeat('4', 64));
select pg_temp.ci_expect($$select public.agency_add_client('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
  '{"name":"Fourth Waiting"}', 'c1000000-0000-4000-8000-0000000000a4', repeat('8', 64))$$, 'agency_client_waiting_limit');

-- Preview: A's keys and same-host clients only; B's identical host never appears.
select pg_temp.ci_assert((select p->'addedCommandIds' = '["c1000000-0000-4000-8000-0000000000a1","c1000000-0000-4000-8000-0000000000a2"]'::jsonb
    and jsonb_array_length(p->'sameHost') = 1 and p->'sameHost'->0->>'name' = 'Northside Bakery'
    and p->'limits' @> '{"daily":10,"waitingForOwner":3,"raised":true,"usedToday":3,"waiting":3}'
  from public.agency_client_import_preview('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test', 'c1000000-0000-4000-8000-000000000020',
    array['c1000000-0000-4000-8000-0000000000a1','c1000000-0000-4000-8000-0000000000a2','c1000000-0000-4000-8000-0000000000b1','c1000000-0000-4000-8000-0000000000ff']::uuid[],
    array['northside-bakery.example.test']) p), 'preview for A');
select pg_temp.ci_expect($$select public.agency_client_import_preview('c1000000-0000-4000-8000-000000000002', 'ci-a-member@agency-a.example.test',
  'c1000000-0000-4000-8000-000000000020', '{}', '{}')$$, 'agency_client_access_denied');
select pg_temp.ci_expect($$select public.agency_client_import_preview('c1000000-0000-4000-8000-000000000003', 'ci-b-owner@agency-b.example.test',
  'c1000000-0000-4000-8000-000000000020', '{}', '{}')$$, 'agency_client_access_denied');
select pg_temp.ci_expect($$select public.agency_client_import_preview('c1000000-0000-4000-8000-000000000001', 'ci-a-owner@agency-a.example.test',
  'c1000000-0000-4000-8000-000000000020', (select array_agg(gen_random_uuid()) from generate_series(1, 501)), '{}')$$, 'agency_client_invalid');

-- Unsetting returns A to the shared default.
select pg_temp.ci_assert((public.set_agency_client_add_limits('ci-operator@strelva.example.test', 'c1000000-0000-4000-8000-000000000020', null, null,
  'Fixture: back to default', 2) @> '{"daily":25,"waitingForOwner":100,"raised":false,"revision":0}'), 'unset');
select pg_temp.ci_assert((select count(*) = 3 from public.agency_client_add_limit_changes where workspace_id = 'c1000000-0000-4000-8000-000000000020'), 'three changes kept');
rollback;
