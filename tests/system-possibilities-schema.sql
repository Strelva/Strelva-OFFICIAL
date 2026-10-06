\set ON_ERROR_STOP on
-- Possibilities in Postgres (20261008130000_system_possibilities.sql) on
-- fictional rows. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.sp_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'possibilities assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sp_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- A fresh possibility body as createPossibility() writes it, changing the
-- given Systems at the given revisions.
create or replace function pg_temp.sp_body(p_id uuid, p_ws uuid, p_pins jsonb) returns jsonb language sql as $$
  select jsonb_build_object('version', 1, 'id', p_id, 'businessId', p_ws, 'status', 'exploring', 'revision', 0,
    'candidateRevision', 1, 'propagation', 'new_outputs_only', 'title', 'Consult booking', 'intent', 'Add consult booking.',
    'changes', coalesce((select jsonb_agg(jsonb_build_object('baseline', jsonb_build_object('businessId', p_ws,
        'systemId', pin->>'systemId', 'revisionId', pin->>'revisionId', 'number', 1),
        'candidate', jsonb_build_object('summary', 'booking', 'content', '{}'::jsonb))) from jsonb_array_elements(p_pins) pin), '[]'::jsonb),
    'introduces', '[]'::jsonb, 'connections', '[]'::jsonb, 'effects', '[]'::jsonb,
    'checks', jsonb_build_array(jsonb_build_object('id', 'site-serves', 'description', 'The site serves.')),
    'createdBy', 'creator', 'createdAt', '2026-10-06T12:00:00.000Z', 'updatedAt', '2026-10-06T12:00:00.000Z', 'history', '[]'::jsonb)
$$;
-- The next revision with one history event, as the engine's record() makes it.
create or replace function pg_temp.sp_next(p jsonb, p_kind text, p_patch jsonb) returns jsonb language sql as $$
  select (p || p_patch) || jsonb_build_object('revision', (p->>'revision')::int + 1, 'updatedAt', '2026-10-06T12:05:00.000Z',
    'history', (p->'history') || jsonb_build_array(jsonb_build_object('revision', (p->>'revision')::int + 1, 'kind', p_kind,
      'actorId', 'tester', 'at', '2026-10-06T12:05:00.000Z')))
$$;
create or replace function pg_temp.sp_save(p jsonb, p_user uuid, p_email text) returns jsonb language sql as $$
  select public.save_system_possibility((p->>'businessId')::uuid, p_user, p_email, (p->>'id')::uuid,
    (p->>'revision')::int - 1, p)
$$;
create or replace function pg_temp.sp_row(p_id uuid) returns public.system_possibilities language sql as $$
  select * from public.system_possibilities where id = p_id
$$;

-- Only the service role reaches the RPCs; helpers and tables are reachable by nobody.
select pg_temp.sp_assert(
  not has_function_privilege('anon', 'public.read_system_possibility(uuid,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.save_system_possibility(uuid,uuid,text,uuid,integer,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_system_possibility_preview(uuid,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.observe_system_revision(uuid,uuid,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_possibility_write_pins(uuid,uuid,jsonb,uuid[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.adopt_system_with_revision(uuid,text,text,text,text,jsonb,boolean,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.create_system_possibility(uuid,uuid,text,jsonb,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.save_system_possibility(uuid,uuid,text,uuid,integer,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.withdraw_idle_system_possibilities(integer,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.observe_tenant_content(text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.pause_tenant_systems(text)', 'EXECUTE')
  and not has_table_privilege('service_role', 'public.system_possibilities', 'SELECT')
  and not has_table_privilege('authenticated', 'public.system_possibility_events', 'SELECT')
  and not has_table_privilege('service_role', 'public.system_revision_contents', 'INSERT')
  and (select bool_and(relrowsecurity) from pg_class where oid in ('public.system_possibilities'::regclass,
    'public.system_possibility_pins'::regclass, 'public.system_possibility_events'::regclass, 'public.system_revision_contents'::regclass)),
  'only service_role executes the possibility RPCs; tables are RLS-on with no grants');

-- The origin kinds added by publishing keep ids stable and derived exactly as
-- src/platform/systems/invariants.ts derives them.
select pg_temp.sp_assert(public.system_origin_kinds() @> array['saved_work','tenant','inquiry_workspace','google_location','tenant_newsletter'],
  'every origin kind is allowed');
select pg_temp.sp_assert(public.system_origin_id('5e000000-0000-4000-8000-000000000010', 'saved_work', '5e000000-0000-4000-8000-0000000000a1')
  = 'f155e662-163a-42f3-a0ea-e12c754a9a96', 'existing origin ids are unchanged');
select pg_temp.sp_assert(public.system_origin_id('5f000000-0000-4000-8000-000000000010', 'google_location', 'locations/123')
  = '51d7cf8d-6196-4d42-8a04-d2a182c1f325', 'google_location id matches the TypeScript derivation');
select pg_temp.sp_assert(public.system_origin_id('5f000000-0000-4000-8000-000000000010', 'tenant_newsletter', '5f000000-0000-4000-8000-0000000000b1')
  = '1537dff2-39a5-4753-8afe-cffa9c757de8', 'tenant_newsletter id matches the TypeScript derivation');

insert into public.users(id, email, verified_at) values
  ('5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', now()),
  ('5f000000-0000-4000-8000-000000000002', 'sp-member@example.test', now()),
  ('5f000000-0000-4000-8000-000000000003', 'sp-stranger@example.test', now()),
  ('5f000000-0000-4000-8000-000000000004', 'sp-other-owner@example.test', now()),
  ('5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('5f000000-0000-4000-8000-000000000010', 'customer', 'Mooney Firm', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000011', 'customer', 'Other Firm', '5f000000-0000-4000-8000-000000000004'),
  ('5f000000-0000-4000-8000-000000000015', 'agency', 'Assigned Agency', '5f000000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'owner', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000002', 'member', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-000000000011', '5f000000-0000-4000-8000-000000000004', 'owner', '5f000000-0000-4000-8000-000000000004'),
  ('5f000000-0000-4000-8000-000000000015', '5f000000-0000-4000-8000-000000000005', 'owner', '5f000000-0000-4000-8000-000000000005');

-- Systems: Orders (adopted from saved work a3, which the agency is assigned)
-- and Intake (no origin, outside any agency scope), each with revision 1.
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('5f000000-0000-4000-8000-0000000000a3', '5f000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Orders', '{}', '5f000000-0000-4000-8000-000000000001'),
  ('5f000000-0000-4000-8000-0000000001a1', '5f000000-0000-4000-8000-000000000010', 'operations', 'responsibility', 'Run orders',
   '{"ownerId":"5f000000-0000-4000-8000-000000000001","approvedBy":"5f000000-0000-4000-8000-000000000001","approvedAt":"2026-10-01T12:00:00Z",
     "steps":[{"id":"orders","workId":"5f000000-0000-4000-8000-0000000000a3"}]}', '5f000000-0000-4000-8000-000000000001');
insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
    assignee_workspace_id, offer_key, work_scope, status, offered_at, accepted_at, expires_at) values
  ('5f000000-0000-4000-8000-0000000001b1', '5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-0000000001a1',
   '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test', 'agency',
   '5f000000-0000-4000-8000-000000000015', 'sp-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '7 days');
insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
    accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by) values
  ('5f000000-0000-4000-8000-0000000001c1', '5f000000-0000-4000-8000-000000000010', 'possibilities_agency_fixture', '1.0.0',
   '[{"id":"5f000000-0000-4000-8000-0000000000a3"}]',
   '{"kind":"provider_requested","providerKind":"agency","agencyWorkspaceId":"5f000000-0000-4000-8000-000000000015"}',
   array['operate'], array['workspace'], 'sp-install', repeat('a', 64), '5f000000-0000-4000-8000-000000000001', '5f000000-0000-4000-8000-000000000001');
insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
    command_digest, requested_by, expires_at, accepted_by, accepted_at, history) values
  ('5f000000-0000-4000-8000-0000000001d1', '5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-0000000001c1',
   '5f000000-0000-4000-8000-0000000001b1', 'accepted', array['operate'], 'sp-delivery', repeat('a', 64),
   '5f000000-0000-4000-8000-000000000001', clock_timestamp() + interval '7 days', '5f000000-0000-4000-8000-000000000005', clock_timestamp(), '[]');

create temp table sp_ids(name text primary key, id uuid) on commit drop;
insert into sp_ids select 'orders', (public.create_business_system('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001',
  'sp-owner@example.test', '{"name":"Orders","kind":"tracker","origin":{"kind":"saved_work","ref":"5f000000-0000-4000-8000-0000000000a3"}}',
  '5f000000-0000-4000-8000-0000000002c1', repeat('1', 64))->>'id')::uuid;
insert into sp_ids select 'intake', (public.create_business_system('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001',
  'sp-owner@example.test', '{"name":"Intake","kind":"intake"}', '5f000000-0000-4000-8000-0000000002c2', repeat('1', 64))->>'id')::uuid;
insert into sp_ids select 'orders_r1', (public.record_system_revision('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001',
  'sp-owner@example.test', (select id from sp_ids where name = 'orders'), 1, '{"implementation":{"kind":"make_real_content","ref":"r1"}}',
  '5f000000-0000-4000-8000-0000000002d1', repeat('2', 64), true)->'revision'->>'id')::uuid;
insert into sp_ids select 'intake_r1', (public.record_system_revision('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001',
  'sp-owner@example.test', (select id from sp_ids where name = 'intake'), 1, '{"implementation":{"kind":"make_real_content","ref":"i1"}}',
  '5f000000-0000-4000-8000-0000000002d2', repeat('2', 64), true)->'revision'->>'id')::uuid;

create or replace function pg_temp.sp_pin(p_name text, p_rev text) returns jsonb language sql as $$
  select jsonb_build_object('systemId', (select id from sp_ids where name = p_name), 'revisionId', (select id from sp_ids where name = p_rev))
$$;

-- Create, replay by source, refusals.
do $$
declare b jsonb; r jsonb;
begin
  b := pg_temp.sp_body('5f000000-0000-4000-8000-0000000003a1', '5f000000-0000-4000-8000-000000000010',
    jsonb_build_array(pg_temp.sp_pin('orders', 'orders_r1'), pg_temp.sp_pin('intake', 'intake_r1')));
  r := public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', b, 'website-rebuild:w1');
  perform pg_temp.sp_assert(r->>'status' = 'exploring' and (r->>'revision')::int = 0 and jsonb_array_length(r->'history') = 0, 'created exploring at revision 0');
  perform pg_temp.sp_assert((select count(*) from public.system_possibility_pins where possibility_id = '5f000000-0000-4000-8000-0000000003a1') = 2, 'pins written');
  -- A backfill rerun returns the stored row, never a second one.
  r := public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test',
    pg_temp.sp_body('5f000000-0000-4000-8000-0000000003a9', '5f000000-0000-4000-8000-000000000010', jsonb_build_array(pg_temp.sp_pin('orders', 'orders_r1'))), 'website-rebuild:w1');
  perform pg_temp.sp_assert(r->>'id' = '5f000000-0000-4000-8000-0000000003a1' and (r->>'replayed')::boolean, 'source ref replays the stored possibility');
  perform pg_temp.sp_assert((select count(*) from public.system_possibilities where source_ref = 'website-rebuild:w1') = 1, 'one row per source');
  -- A member reads; read for another business is denied.
  perform pg_temp.sp_assert(public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000002',
    'sp-member@example.test', '5f000000-0000-4000-8000-0000000003a1')->>'title' = 'Consult booking', 'member reads');
  perform pg_temp.sp_assert(jsonb_array_length(public.list_system_possibilities('5f000000-0000-4000-8000-000000000010',
    '5f000000-0000-4000-8000-000000000002', 'sp-member@example.test')) = 1, 'member lists');
end $$;
select pg_temp.sp_expect($$select public.create_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000002','sp-member@example.test',
  pg_temp.sp_body('5f000000-0000-4000-8000-0000000003a2','5f000000-0000-4000-8000-000000000010','[]'), null)$$, 'business_record_access_denied');
select pg_temp.sp_expect($$select public.read_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003','sp-stranger@example.test','5f000000-0000-4000-8000-0000000003a1')$$, 'business_record_access_denied');
select pg_temp.sp_expect($$select public.read_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000004','sp-other-owner@example.test','5f000000-0000-4000-8000-0000000003a1')$$, 'business_record_access_denied');
-- Another business's owner cannot pin this business's Systems in its own business, or read across.
select pg_temp.sp_expect($$select public.create_system_possibility('5f000000-0000-4000-8000-000000000011','5f000000-0000-4000-8000-000000000004','sp-other-owner@example.test',
  pg_temp.sp_body('5f000000-0000-4000-8000-0000000003a3','5f000000-0000-4000-8000-000000000011',jsonb_build_array(pg_temp.sp_pin('orders','orders_r1'))), null)$$, 'system_not_found');
select pg_temp.sp_assert(public.read_system_possibility('5f000000-0000-4000-8000-000000000011','5f000000-0000-4000-8000-000000000004','sp-other-owner@example.test',
  '5f000000-0000-4000-8000-0000000003a1') is null, 'a possibility of another business reads as missing');
select pg_temp.sp_expect($$select public.save_system_possibility('5f000000-0000-4000-8000-000000000011','5f000000-0000-4000-8000-000000000004','sp-other-owner@example.test',
  '5f000000-0000-4000-8000-0000000003a1', 0, pg_temp.sp_next(public.read_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','sp-owner@example.test','5f000000-0000-4000-8000-0000000003a1'),'revise','{}'))$$,
  'system_possibility_not_found');
-- The id must be a uuid, the body must start at revision 0.
select pg_temp.sp_expect($$select public.create_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','sp-owner@example.test',
  pg_temp.sp_body('5f000000-0000-4000-8000-0000000003a2','5f000000-0000-4000-8000-000000000010','[]') || '{"revision":3}', null)$$, 'system_possibility_invalid');

-- Compare-and-set and history.
do $$
declare cur jsonb; nxt jsonb;
begin
  cur := public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-0000000003a1');
  nxt := pg_temp.sp_next(cur, 'rehearse', jsonb_build_object('rehearsal', jsonb_build_object('candidateRevision', 1, 'ok', true)));
  nxt := pg_temp.sp_save(nxt, '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  perform pg_temp.sp_assert((nxt->>'revision')::int = 1 and nxt->'history'->0->>'kind' = 'rehearse', 'save records one event');
  perform pg_temp.sp_assert((select count(*) from public.system_possibility_events where possibility_id = '5f000000-0000-4000-8000-0000000003a1') = 1, 'event stored');
  -- The same expected revision again: a concurrent writer lost.
  perform pg_temp.sp_expect(format($q$select public.save_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','sp-owner@example.test','5f000000-0000-4000-8000-0000000003a1',0,%L::jsonb)$q$,
    pg_temp.sp_next(cur, 'revise', '{}')), 'system_possibility_revision_conflict');
  -- A revision bump without its history event is refused.
  perform pg_temp.sp_expect(format($q$select public.save_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','sp-owner@example.test','5f000000-0000-4000-8000-0000000003a1',1,%L::jsonb)$q$,
    nxt || '{"revision":2}'), 'system_possibility_invalid');
  -- A member cannot save.
  perform pg_temp.sp_expect(format($q$select public.save_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000002','sp-member@example.test','5f000000-0000-4000-8000-0000000003a1',1,%L::jsonb)$q$,
    pg_temp.sp_next(nxt, 'revise', '{}')), 'business_record_access_denied');
  -- Ready.
  nxt := pg_temp.sp_save(pg_temp.sp_next(nxt, 'ready', '{"status":"ready"}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  perform pg_temp.sp_assert((pg_temp.sp_row('5f000000-0000-4000-8000-0000000003a1')).status = 'ready', 'ready stored');
end $$;

-- A Needs you item waits on the ready possibility.
select public.open_owner_decision('5f000000-0000-4000-8000-000000000010', jsonb_build_object('kind', 'system.change_live', 'route', 'owner_decides',
  'title', 'Make consult booking live?', 'approveEffect', 'The change goes live.', 'notYetEffect', 'Nothing changes.',
  'sourceLifecycle', 'make_real', 'sourceId', '5f000000-0000-4000-8000-0000000003a1', 'revisionHash', repeat('e', 64)));

-- The stale rule through record_system_revision: back to Exploring in the
-- same transaction, rehearsal dropped, one event, the emailed ask withdrawn.
select public.record_system_revision('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test',
  (select id from sp_ids where name = 'orders'), 2, '{"implementation":{"kind":"make_real_content","ref":"r2"}}',
  '5f000000-0000-4000-8000-0000000002d3', repeat('3', 64), true);
do $$
declare p public.system_possibilities;
begin
  p := pg_temp.sp_row('5f000000-0000-4000-8000-0000000003a1');
  perform pg_temp.sp_assert(p.status = 'exploring' and not (p.body ? 'rehearsal') and p.revision = 3 and p.body->>'status' = 'exploring'
    and (p.body->>'revision')::int = 3, 'a moved pin returns the possibility to Exploring');
  perform pg_temp.sp_assert((select kind || ':' || detail from public.system_possibility_events where possibility_id = p.id and revision = 3)
    = 'stale:Orders changed since this was built.', 'the stale event names the System');
  perform pg_temp.sp_assert((select state || ':' || outcome_reason from public.owner_decisions where source_id = p.id::text)
    = 'withdrawn:This changed since we emailed you.', 'the emailed ask is withdrawn');
end $$;
-- A stale ready save is refused while the pin is behind.
select pg_temp.sp_expect($$select pg_temp.sp_save(pg_temp.sp_next(public.read_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','sp-owner@example.test','5f000000-0000-4000-8000-0000000003a1'),
  'ready', '{"status":"ready"}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test')$$, 'system_possibility_stale');

-- The stale rule through set_system_current_revision (a restore), and a
-- possibility being made real is left alone.
do $$
declare cur jsonb; orders uuid := (select id from sp_ids where name = 'orders'); r2 uuid; r1 uuid := (select id from sp_ids where name = 'orders_r1');
begin
  select current_revision_id into r2 from public.systems where id = orders;
  -- Two fresh possibilities pinned at r2: one ready, one ready and being made real.
  perform public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test',
    pg_temp.sp_body('5f000000-0000-4000-8000-0000000003b1', '5f000000-0000-4000-8000-000000000010', jsonb_build_array(jsonb_build_object('systemId', orders, 'revisionId', r2))), null);
  perform public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test',
    pg_temp.sp_body('5f000000-0000-4000-8000-0000000003b2', '5f000000-0000-4000-8000-000000000010', jsonb_build_array(jsonb_build_object('systemId', orders, 'revisionId', r2))), null);
  cur := public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-0000000003b1');
  perform pg_temp.sp_save(pg_temp.sp_next(cur, 'ready', '{"status":"ready","rehearsal":{"ok":true}}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  cur := public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-0000000003b2');
  cur := pg_temp.sp_save(pg_temp.sp_next(cur, 'ready', '{"status":"ready","rehearsal":{"ok":true}}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  perform pg_temp.sp_save(pg_temp.sp_next(cur, 'make_real_started', '{"activationId":"act-1"}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  perform public.set_system_current_revision('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', orders, r1, r2);
  perform pg_temp.sp_assert((pg_temp.sp_row('5f000000-0000-4000-8000-0000000003b1')).status = 'exploring', 'a restore stales a pinned possibility');
  perform pg_temp.sp_assert((pg_temp.sp_row('5f000000-0000-4000-8000-0000000003b2')).status = 'ready', 'the possibility being made real is not staled by the pointer move');
end $$;

-- Agency scope: the assigned agency reaches only possibilities whose every
-- pin lies in its scope (Orders, from its assigned work), never Intake.
do $$
declare orders uuid := (select id from sp_ids where name = 'orders'); r uuid;
begin
  select current_revision_id into r from public.systems where id = orders;
  perform public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test',
    pg_temp.sp_body('5f000000-0000-4000-8000-0000000003c1', '5f000000-0000-4000-8000-000000000010', jsonb_build_array(jsonb_build_object('systemId', orders, 'revisionId', r))), null);
  perform pg_temp.sp_assert(public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test',
    '5f000000-0000-4000-8000-0000000003c1') is not null, 'the agency reads what it opened');
  perform pg_temp.sp_assert(public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test',
    '5f000000-0000-4000-8000-0000000003a1') is null, 'the agency does not see a possibility that pins a System outside its scope');
  perform pg_temp.sp_assert((select count(*) from jsonb_array_elements(public.list_system_possibilities('5f000000-0000-4000-8000-000000000010',
    '5f000000-0000-4000-8000-000000000005', 'sp-agency@example.test'))) = 3, 'the agency lists only in-scope possibilities');
end $$;
select pg_temp.sp_expect($$select public.create_system_possibility('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000005','sp-agency@example.test',
  pg_temp.sp_body('5f000000-0000-4000-8000-0000000003c2','5f000000-0000-4000-8000-000000000010',jsonb_build_array(pg_temp.sp_pin('intake','intake_r1'))), null)$$, 'system_not_found');

-- Adoption at conversion, then an observed tenant content edit fires stale.
insert into public.tenants(id, stable_id, site_name, active) values
  ('sp-mooney', '5f000000-0000-4000-8000-0000000000b1', 'attymooney.com', true);
insert into public.inquiry_workspaces(tenant_id, tenant_stable_id, business_id, state) values
  ('sp-mooney', '5f000000-0000-4000-8000-0000000000b1', 'sp-business', '{"inquiries":[]}');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('5f000000-0000-4000-8000-0000000000b1', 'sp-mooney', '5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('c', 64), '{}');
do $$
declare site public.systems; inquiry public.systems; cur jsonb; v_r text;
begin
  select * into site from public.systems where id = public.system_origin_id('5f000000-0000-4000-8000-000000000010', 'tenant', '5f000000-0000-4000-8000-0000000000b1');
  perform pg_temp.sp_assert(site.lifecycle = 'live' and site.kind = 'website' and site.name = 'attymooney.com' and site.current_revision_number = 1,
    'the website System is stored live with revision 1 at conversion');
  perform pg_temp.sp_assert((select implementation->>'kind' from public.system_revisions where id = site.current_revision_id) = 'tenant_content',
    'revision 1 names the tenant content pointer');
  select * into inquiry from public.systems where business_workspace_id = '5f000000-0000-4000-8000-000000000010' and origin_kind = 'inquiry_workspace';
  perform pg_temp.sp_assert(inquiry.lifecycle = 'live' and inquiry.kind = 'inquiry' and inquiry.current_revision_number = 1
    and (select implementation->>'kind' from public.system_revisions where id = inquiry.current_revision_id) = 'inquiry_config',
    'the inquiry System is stored live with revision 1');
  -- Adoption reruns change nothing.
  perform pg_temp.sp_assert(public.adopt_converted_tenant_systems((select id from public.tenant_workspace_links where tenant_slug_at_link = 'sp-mooney')) = 0, 'adoption is idempotent');
  perform public.create_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test',
    pg_temp.sp_body('5f000000-0000-4000-8000-0000000003d1', '5f000000-0000-4000-8000-000000000010',
      jsonb_build_array(jsonb_build_object('systemId', site.id, 'revisionId', site.current_revision_id))), null);
  cur := public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-0000000003d1');
  perform pg_temp.sp_save(pg_temp.sp_next(cur, 'ready', '{"status":"ready","rehearsal":{"ok":true}}'), '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test');
  perform pg_temp.sp_assert(public.observe_tenant_content('sp-mooney', 'v_edit-1') = 1, 'a content edit records one observed revision');
  perform pg_temp.sp_assert(public.observe_tenant_content('sp-mooney', 'v_edit-1') = 0, 'the same pointer is observed once');
  perform pg_temp.sp_assert(public.observe_tenant_content('no-such-tenant', 'v_edit-1') = 0, 'an unknown tenant observes nothing');
  select r.implementation->>'ref' into v_r from public.systems s join public.system_revisions r on r.id = s.current_revision_id where s.id = site.id;
  perform pg_temp.sp_assert(v_r = '5f000000-0000-4000-8000-0000000000b1@v_edit-1', 'the observed revision names the new content version');
  perform pg_temp.sp_assert((pg_temp.sp_row('5f000000-0000-4000-8000-0000000003d1')).status = 'exploring', 'an observed revision fires stale');
  -- Deprovisioning pauses the stored Systems; records are kept.
  perform pg_temp.sp_assert(public.pause_tenant_systems('sp-mooney') = 2, 'website and inquiry Systems pause');
  perform pg_temp.sp_assert((select lifecycle from public.systems where id = site.id) = 'paused', 'the website reads Paused');
  perform pg_temp.sp_assert(public.pause_tenant_systems('sp-mooney') = 0, 'pausing again changes nothing');
end $$;

-- Signed preview: only an open candidate whose revision still matches.
select pg_temp.sp_assert(public.read_system_possibility_preview('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-0000000003a1', 1)->>'title' = 'Consult booking',
  'the preview reads the current candidate');
select pg_temp.sp_assert(public.read_system_possibility_preview('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-0000000003a1', 2) is null,
  'a link for another candidate revision is dead');
select pg_temp.sp_assert(public.read_system_possibility_preview('5f000000-0000-4000-8000-000000000011', '5f000000-0000-4000-8000-0000000003a1', 1) is null,
  'a link names its business');

-- Revision content is business-scoped and immutable.
select public.put_system_revision_content('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', repeat('f', 64), '{"site":"rebuilt"}');
select pg_temp.sp_assert(public.read_system_revision_content('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000002', 'sp-member@example.test', repeat('f', 64))->>'site' = 'rebuilt', 'a member reads stored content');
select pg_temp.sp_expect($$select public.read_system_revision_content('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000004','sp-other-owner@example.test',repeat('f',64))$$, 'business_record_access_denied');
select pg_temp.sp_expect($$select public.put_system_revision_content('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000002','sp-member@example.test',repeat('f',64),'{}')$$, 'business_record_access_denied');
select pg_temp.sp_expect($$update public.system_revision_contents set content = '{}'$$, 'system_possibility_immutable');
select pg_temp.sp_expect($$update public.system_possibility_events set detail = 'rewritten'$$, 'system_possibility_immutable');
select pg_temp.sp_expect($$delete from public.system_possibility_events$$, 'system_possibility_immutable');

-- Idle withdraw: 90 days without activity, an event as the receipt; closed
-- possibilities refuse saves.
update public.system_possibilities set last_activity_at = clock_timestamp() - interval '91 days' where id = '5f000000-0000-4000-8000-0000000003a1';
do $$
declare out jsonb; cur jsonb;
begin
  out := public.withdraw_idle_system_possibilities(90, 50);
  perform pg_temp.sp_assert(jsonb_array_length(out) = 1 and out->0->>'possibilityId' = '5f000000-0000-4000-8000-0000000003a1', 'only the idle one is withdrawn');
  perform pg_temp.sp_assert((pg_temp.sp_row('5f000000-0000-4000-8000-0000000003a1')).status = 'withdrawn', 'withdrawn');
  perform pg_temp.sp_assert((select kind || '|' || actor_id from public.system_possibility_events where possibility_id = '5f000000-0000-4000-8000-0000000003a1'
    order by revision desc limit 1) = 'withdraw_idle|strelva', 'the withdraw is recorded as Strelva''s receipt');
  perform pg_temp.sp_assert(jsonb_array_length(public.withdraw_idle_system_possibilities(90, 50)) = 0, 'a second sweep withdraws nothing');
  cur := public.read_system_possibility('5f000000-0000-4000-8000-000000000010', '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test', '5f000000-0000-4000-8000-0000000003a1');
  perform pg_temp.sp_expect(format($q$select pg_temp.sp_save(%L::jsonb, '5f000000-0000-4000-8000-000000000001', 'sp-owner@example.test')$q$,
    pg_temp.sp_next(cur, 'revise', '{"status":"exploring"}')), 'system_possibility_closed');
end $$;
select pg_temp.sp_expect($$select public.withdraw_idle_system_possibilities(5, 50)$$, 'system_possibility_invalid');

rollback;
\echo 'System possibilities schema checks passed.'
