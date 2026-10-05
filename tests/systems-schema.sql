\set ON_ERROR_STOP on
-- Systems and Connections behavior on fictional rows. Runs inside a
-- transaction that is rolled back, so the cluster is left as it was found.
begin;
create or replace function pg_temp.sy_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'systems assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sy_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Only the actor-checked RPCs are reachable, and only by the service role.
select pg_temp.sy_assert(
  not has_function_privilege('anon', 'public.read_business_systems(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_business_systems(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_business_system(uuid,uuid,text,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.connect_system(uuid,uuid,text,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_existing_business_systems(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_load(uuid,uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_json(public.systems)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_business_systems(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.create_business_system(uuid,uuid,text,jsonb,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_system_revision(uuid,uuid,text,uuid,bigint,jsonb,uuid,text,boolean)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_existing_business_systems(uuid,uuid,text)', 'EXECUTE'),
  'only service_role executes the systems RPCs');
select pg_temp.sy_assert(
  not has_table_privilege('service_role', 'public.systems', 'SELECT')
  and not has_table_privilege('authenticated', 'public.system_connections', 'SELECT')
  and not has_table_privilege('anon', 'public.system_outputs', 'SELECT')
  and not has_table_privilege('service_role', 'public.system_revisions', 'INSERT')
  and (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.systems'::regclass, 'public.system_revisions'::regclass,
    'public.system_outputs'::regclass, 'public.system_connections'::regclass)),
  'tables are RLS-on with no direct grants');

-- Deterministic adoption ids match src/platform/systems/invariants.ts.
select pg_temp.sy_assert(public.system_origin_id('5e000000-0000-4000-8000-000000000010', 'saved_work', '5e000000-0000-4000-8000-0000000000a1')
  = 'f155e662-163a-42f3-a0ea-e12c754a9a96', 'origin id matches the TypeScript derivation');

insert into public.users(id, email, verified_at) values
  ('5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test', now()),
  ('5e000000-0000-4000-8000-000000000002', 'sy-member@example.test', now()),
  ('5e000000-0000-4000-8000-000000000003', 'sy-stranger@example.test', now()),
  ('5e000000-0000-4000-8000-000000000004', 'sy-other-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('5e000000-0000-4000-8000-000000000010', 'customer', 'Juniper Bakery', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000011', 'customer', 'Other Business', '5e000000-0000-4000-8000-000000000004'),
  ('5e000000-0000-4000-8000-000000000012', 'personal', 'Personal', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000013', 'customer', 'Exited Business', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000014', 'customer', 'Juniper Catering', '5e000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'member', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000004', 'owner', '5e000000-0000-4000-8000-000000000004'),
  ('5e000000-0000-4000-8000-000000000012', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000013', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000001');

-- An empty business reads as no Systems for any member.
select pg_temp.sy_assert(jsonb_array_length(public.read_business_systems('5e000000-0000-4000-8000-000000000010',
  '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test')->'systems') = 0, 'member reads an empty graph');

-- Strangers, other owners, personal workspaces and members writing are refused.
select pg_temp.sy_expect($$select public.read_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000003','sy-stranger@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000004','sy-other-owner@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000004','sy-other-owner@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_business_systems('5e000000-0000-4000-8000-000000000012','5e000000-0000-4000-8000-000000000001','sy-owner@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000002','sy-member@example.test','{"name":"Quote","kind":"proposal"}','5e000000-0000-4000-8000-0000000000c0',repeat('1',64))$$, 'business_record_access_denied');

-- Create, replay, conflicting replay.
create temp table sy_ids(name text primary key, id uuid) on commit drop;
insert into sy_ids select 'proposal', (public.create_business_system('5e000000-0000-4000-8000-000000000010',
  '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test', '{"name":"Catering proposal","kind":"proposal","purpose":"Win catering jobs"}',
  '5e000000-0000-4000-8000-0000000000c1', repeat('1', 64))->>'id')::uuid;
select pg_temp.sy_assert((public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Catering proposal","kind":"proposal","purpose":"Win catering jobs"}',
  '5e000000-0000-4000-8000-0000000000c1', repeat('1', 64))->>'id')::uuid = (select id from sy_ids where name = 'proposal'), 'replay returns the same System');
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test','{"name":"Other","kind":"proposal"}','5e000000-0000-4000-8000-0000000000c1',repeat('2',64))$$, 'system_command_conflict');

-- Kind changes; identity does not.
do $$ declare s jsonb; begin
  s := public.update_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    (select id from sy_ids where name = 'proposal'), 1, '{"kind":"portal","name":"Catering portal"}');
  perform pg_temp.sy_assert((s->>'id')::uuid = (select id from sy_ids where name = 'proposal') and s->>'kind' = 'portal'
    and (s->>'changeNumber')::int = 2 and s->>'businessId' = '5e000000-0000-4000-8000-000000000010', 'kind change keeps identity');
end $$;
select pg_temp.sy_expect(format($$select public.update_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,1,'{"name":"Stale"}')$$, (select id from sy_ids where name = 'proposal')), 'system_change_conflict');
select pg_temp.sy_expect(format($$update public.systems set business_workspace_id = '5e000000-0000-4000-8000-000000000011' where id = %L$$, (select id from sy_ids where name = 'proposal')), 'system_identity_immutable');
-- A System is invisible from another business, even by id.
select pg_temp.sy_expect(format($$select public.read_business_system('5e000000-0000-4000-8000-000000000011','5e000000-0000-4000-8000-000000000004','sy-other-owner@example.test',%L)$$, (select id from sy_ids where name = 'proposal')), 'system_not_found');

-- Lifecycle: live needs a revision; only the legal moves.
select pg_temp.sy_expect(format($$select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,2,'live')$$, (select id from sy_ids where name = 'proposal')), 'system_revision_required');
select pg_temp.sy_expect(format($$select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,2,'paused')$$, (select id from sy_ids where name = 'proposal')), 'system_lifecycle_invalid');
select pg_temp.sy_expect(format($$select public.issue_system_output('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,'{"kind":"proposal","title":"Smith wedding","snapshotHash":"%s"}','5e000000-0000-4000-8000-0000000000d0',repeat('3',64))$$, (select id from sy_ids where name = 'proposal'), repeat('a', 64)), 'system_output_requires_revision');

select public.record_system_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 2, '{"implementation":{"kind":"proposal_document","ref":"doc:prices-2026"},"summary":"2026 prices"}',
  '5e000000-0000-4000-8000-0000000000e1', repeat('4', 64), true);
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 3, 'live');

-- An issued output pins revision 1; a later revision and acceptance keep it.
insert into sy_ids select 'output', (public.issue_system_output('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', (select id from sy_ids where name = 'proposal'),
  jsonb_build_object('kind', 'proposal', 'title', 'Smith wedding', 'snapshotHash', repeat('a', 64)),
  '5e000000-0000-4000-8000-0000000000d1', repeat('5', 64))->>'id')::uuid;
select public.record_system_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 4, '{"implementation":{"kind":"proposal_document","ref":"doc:prices-2027"},"summary":"2027 prices"}',
  '5e000000-0000-4000-8000-0000000000e2', repeat('6', 64), true);
select public.accept_system_output('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), (select id from sy_ids where name = 'output'));
do $$ declare d jsonb; begin
  d := public.read_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test',
    (select id from sy_ids where name = 'proposal'));
  perform pg_temp.sy_assert((d->'system'->'currentRevision'->>'number')::int = 2, 'current revision moved to 2');
  perform pg_temp.sy_assert(jsonb_array_length(d->'revisions') = 2 and d->'revisions'->0->'implementation'->>'ref' = 'doc:prices-2026', 'revision 1 kept');
  perform pg_temp.sy_assert((d->'outputs'->0->'revision'->>'number')::int = 1 and d->'outputs'->0->>'status' = 'accepted', 'accepted output still pins revision 1');
end $$;
select pg_temp.sy_expect(format($$update public.system_outputs set revision_number = 2 where id = %L$$, (select id from sy_ids where name = 'output')), 'system_output_immutable');
select pg_temp.sy_expect($$update public.system_revisions set summary = 'rewritten'$$, 'system_revision_immutable');
select pg_temp.sy_expect(format($$select public.accept_system_output('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,%L)$$, (select id from sy_ids where name = 'proposal'), (select id from sy_ids where name = 'output')), 'system_output_transition_invalid');

-- Stage without moving the pointer, then compare-and-set to activate and restore.
do $$ declare st jsonb; cur uuid; staged uuid; begin
  cur := (public.read_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    (select id from sy_ids where name = 'proposal'))->'system'->'currentRevision'->>'revisionId')::uuid;
  st := public.record_system_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    (select id from sy_ids where name = 'proposal'), null, '{"implementation":{"kind":"proposal_document","ref":"doc:candidate"}}',
    '5e000000-0000-4000-8000-0000000000e9', repeat('6', 64), false);
  staged := (st->'revision'->>'id')::uuid;
  perform pg_temp.sy_assert((st->'revision'->>'number')::int = 3 and (st->'system'->'currentRevision'->>'revisionId')::uuid = cur
    and (st->'system'->>'changeNumber')::int = 5, 'staged revision 3 leaves the pointer and change number alone');
  begin
    perform public.set_system_current_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
      (select id from sy_ids where name = 'proposal'), staged, staged);
    raise exception 'stale compare-and-set succeeded';
  exception when others then
    if sqlerrm <> 'system_baseline_moved' then raise; end if;
  end;
  perform public.set_system_current_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    (select id from sy_ids where name = 'proposal'), staged, cur);
  perform public.set_system_current_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    (select id from sy_ids where name = 'proposal'), cur, staged);
  perform pg_temp.sy_assert((select current_revision_id from public.systems where id = (select id from sy_ids where name = 'proposal')) = cur
    and (select change_number from public.systems where id = (select id from sy_ids where name = 'proposal')) = 7, 'activate then restore');
  perform pg_temp.sy_assert((select revision_number from public.system_outputs where id = (select id from sy_ids where name = 'output')) = 1, 'output pin untouched');
end $$;
select pg_temp.sy_expect(format($$update public.systems set current_revision_id = null, current_revision_number = null where id = %L$$, (select id from sy_ids where name = 'proposal')), 'system_revision_required');

-- Pause, resume; never back to draft.
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 7, 'paused');
select pg_temp.sy_expect(format($$select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',%L,8,'draft')$$, (select id from sy_ids where name = 'proposal')), 'system_lifecycle_invalid');
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 8, 'live');

-- Connections: pricing feeds proposal and website.
insert into sy_ids select 'pricing', (public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Pricing","kind":"pricing"}', '5e000000-0000-4000-8000-0000000000c2', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'website', (public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Website","kind":"website"}', '5e000000-0000-4000-8000-0000000000c3', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'other', (public.create_business_system('5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000004',
  'sy-other-owner@example.test', '{"name":"Their site","kind":"website"}', '5e000000-0000-4000-8000-0000000000c4', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'catering', (public.create_business_system('5e000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Catering menu","kind":"pricing"}', '5e000000-0000-4000-8000-0000000000c5', repeat('1', 64))->>'id')::uuid;

create or replace function pg_temp.sy_connect(source text, kind text, target jsonb, command text, workspace text default '5e000000-0000-4000-8000-000000000010',
  actor text default '5e000000-0000-4000-8000-000000000001', email text default 'sy-owner@example.test') returns jsonb language sql as $$
  select public.connect_system(workspace::uuid, actor::uuid, email,
    jsonb_build_object('source', jsonb_build_object('businessId', workspace, 'systemId', (select id from sy_ids where name = source)),
      'kind', kind, 'target', target), command::uuid, repeat('7', 64))
$$;
create or replace function pg_temp.sy_system(name text, business text default '5e000000-0000-4000-8000-000000000010') returns jsonb language sql as $$
  select jsonb_build_object('type', 'system', 'system', jsonb_build_object('businessId', business, 'systemId', (select id from sy_ids where sy_ids.name = sy_system.name)))
$$;

select pg_temp.sy_connect('proposal', 'depend', pg_temp.sy_system('pricing'), '5e000000-0000-4000-8000-0000000000f1');
select pg_temp.sy_connect('website', 'read', pg_temp.sy_system('pricing'), '5e000000-0000-4000-8000-0000000000f2');
select pg_temp.sy_assert(pg_temp.sy_connect('proposal', 'depend', pg_temp.sy_system('pricing'), '5e000000-0000-4000-8000-0000000000f1')->>'replayed' = 'true', 'connect replays');
select pg_temp.sy_assert(pg_temp.sy_connect('website', 'trigger', pg_temp.sy_system('proposal'), '5e000000-0000-4000-8000-0000000000f3')->>'propagation' = 'manual_review', 'trigger defaults to manual review');
select pg_temp.sy_assert(pg_temp.sy_connect('website', 'read', '{"type":"account_binding","bindingId":"calendar-1"}', '5e000000-0000-4000-8000-0000000000f4')->>'state' = 'connected', 'account binding target');
select pg_temp.sy_assert(pg_temp.sy_connect('website', 'appear', '{"type":"domain","domain":"juniper.example.test"}', '5e000000-0000-4000-8000-0000000000f5')->'target'->>'domain' = 'juniper.example.test', 'domain target');

-- Self, loops, cross-business without share, and share without both sides are refused.
select pg_temp.sy_expect($$select pg_temp.sy_connect('pricing', 'read', pg_temp.sy_system('pricing'), '5e000000-0000-4000-8000-0000000000f6')$$, 'system_connection_self');
select pg_temp.sy_expect($$select pg_temp.sy_connect('pricing', 'depend', pg_temp.sy_system('proposal'), '5e000000-0000-4000-8000-0000000000f7')$$, 'system_connection_cycle');
select pg_temp.sy_connect('pricing', 'depend', pg_temp.sy_system('website'), '5e000000-0000-4000-8000-0000000000f8');
select pg_temp.sy_expect($$select pg_temp.sy_connect('website', 'depend', pg_temp.sy_system('proposal'), '5e000000-0000-4000-8000-0000000000f9')$$, 'system_connection_cycle');
select pg_temp.sy_expect($$select pg_temp.sy_connect('proposal', 'trigger', pg_temp.sy_system('website'), '5e000000-0000-4000-8000-0000000000fa')$$, 'system_connection_cycle');
-- Read loops are allowed.
select pg_temp.sy_connect('pricing', 'read', pg_temp.sy_system('website'), '5e000000-0000-4000-8000-0000000000fb');
select pg_temp.sy_expect($$select pg_temp.sy_connect('website', 'read', pg_temp.sy_system('other', '5e000000-0000-4000-8000-000000000011'), '5e000000-0000-4000-8000-0000000000fc')$$, 'system_connection_cross_business');
select pg_temp.sy_expect($$select pg_temp.sy_connect('website', 'share', pg_temp.sy_system('other', '5e000000-0000-4000-8000-000000000011'), '5e000000-0000-4000-8000-0000000000fd')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$insert into public.system_connections(business_workspace_id, source_system_id, kind, target_type, target_system_id, target_business_workspace_id, target_key, propagation, command_id, command_digest, created_by, updated_by)
  select '5e000000-0000-4000-8000-000000000010', (select id from sy_ids where name='website'), 'read', 'system', (select id from sy_ids where name='other'), '5e000000-0000-4000-8000-000000000011',
    'system:5e000000-0000-4000-8000-000000000011:' || (select id from sy_ids where name='other'), 'follow_current', gen_random_uuid(), repeat('7',64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001'$$,
  'new row for relation "system_connections" violates check constraint %');
-- An owner of both businesses may share explicitly; the target business sees it.
select pg_temp.sy_connect('pricing', 'share', pg_temp.sy_system('catering', '5e000000-0000-4000-8000-000000000014'), '5e000000-0000-4000-8000-0000000000fe');
select pg_temp.sy_assert(jsonb_array_length(public.read_business_systems('5e000000-0000-4000-8000-000000000014',
  '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test')->'connections') = 1, 'target business sees the share');
select pg_temp.sy_assert(not exists (select 1 from jsonb_array_elements(public.read_business_systems('5e000000-0000-4000-8000-000000000011',
  '5e000000-0000-4000-8000-000000000004', 'sy-other-owner@example.test')->'connections')), 'unrelated business sees nothing');

-- A new revision of the proposal makes the manual_review trigger connection stale.
select public.record_system_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'proposal'), 9, '{"implementation":{"kind":"proposal_document","ref":"doc:prices-2028"}}',
  '5e000000-0000-4000-8000-0000000000e3', repeat('6', 64), true);
select pg_temp.sy_assert((select state from public.system_connections where kind = 'trigger' and target_system_id = (select id from sy_ids where name = 'proposal')) = 'stale', 'manual review connection is stale');
select pg_temp.sy_assert((select state from public.system_connections where kind = 'depend' and source_system_id = (select id from sy_ids where name = 'proposal')) = 'connected', 'pinned dependency stays connected');
-- Disconnecting breaks a loop; reconnecting rechecks it.
select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from public.system_connections where kind = 'depend' and source_system_id = (select id from sy_ids where name = 'pricing')), 'disconnected');
select pg_temp.sy_connect('website', 'depend', pg_temp.sy_system('proposal'), '5e000000-0000-4000-8000-0000000000ff');
select pg_temp.sy_expect($$select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',
  (select id from public.system_connections where kind = 'depend' and source_system_id = (select id from sy_ids where name = 'pricing')),'connected')$$, 'system_connection_cycle');

-- Adopting an existing thing uses its deterministic id, once.
do $$ declare s jsonb; begin
  s := public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
    '{"name":"Adopted","kind":"website","origin":{"kind":"saved_work","ref":"5e000000-0000-4000-8000-0000000000a1"}}',
    '5e000000-0000-4000-8000-0000000000c6', repeat('8', 64));
  perform pg_temp.sy_assert((s->>'id')::uuid = 'f155e662-163a-42f3-a0ea-e12c754a9a96', 'adopted System has the origin id');
end $$;
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test','{"name":"Again","kind":"website","origin":{"kind":"saved_work","ref":"5e000000-0000-4000-8000-0000000000a1"}}','5e000000-0000-4000-8000-0000000000c7',repeat('8',64))$$, 'system_origin_conflict');

-- The read-only projection of existing things. Fictional tenants only.
insert into public.tenants(id, stable_id, site_name, active) values
  ('sy-native', '5e000000-0000-4000-8000-0000000000b1', 'Juniper native', true),
  ('sy-managed', '5e000000-0000-4000-8000-0000000000b2', 'Juniper managed', true),
  ('sy-bound', '5e000000-0000-4000-8000-0000000000b3', 'Juniper bound', false);
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('5e000000-0000-4000-8000-0000000000a2', '5e000000-0000-4000-8000-000000000010', 'websites', 'website', 'Juniper site', '{}', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-0000000000a3', '5e000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Orders', '{}', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-0000000000a4', '5e000000-0000-4000-8000-000000000010', 'work_plans', 'plan', 'A plan', '{}', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-0000000000a5', '5e000000-0000-4000-8000-000000000011', 'tracker', 'tracker', 'Not ours', '{}', '5e000000-0000-4000-8000-000000000004');
insert into public.website_documents(workspace_id, website_work_id, revision, content_hash, document, created_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000a2', 1, repeat('b', 64), '{"version":"2"}', '5e000000-0000-4000-8000-000000000001');
insert into public.website_document_publications(tenant_id, workspace_id, website_work_id, revision, content_hash, receipt) values
  ('sy-native', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000a2', 1, repeat('b', 64), '{}');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('5e000000-0000-4000-8000-0000000000b1', 'sy-native', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('c', 64), '{}'),
  ('5e000000-0000-4000-8000-0000000000b2', 'sy-managed', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('c', 64), '{}');
insert into public.offering_website_bindings(business_workspace_id, tenant_stable_id, tenant_id_at_binding, site_name_at_binding, idempotency_key, command_digest, created_by, updated_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000b2', 'sy-managed', 'Juniper managed', 'sy-bind-1', repeat('d', 64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000b3', 'sy-bound', 'Juniper bound', 'sy-bind-2', repeat('d', 64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_connections(workspace_id, provider, calendar_id, calendar_name, time_zone, status, created_by) values
  ('5e000000-0000-4000-8000-000000000010', 'google', 'primary', 'Front desk', 'America/New_York', 'connected', '5e000000-0000-4000-8000-000000000001');
do $$ declare e jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test');
  perform pg_temp.sy_assert((select count(*) from jsonb_array_elements(e->'savedWork')) = 2, 'website and tracker only; plans and other businesses excluded');
  perform pg_temp.sy_assert((select x->>'hostedTenantStableId' from jsonb_array_elements(e->'savedWork') x where x->>'productId' = 'websites')
    = '5e000000-0000-4000-8000-0000000000b1', 'native website carries its hosted tenant');
  perform pg_temp.sy_assert((select (x->>'websitePublishedRevision')::int from jsonb_array_elements(e->'savedWork') x where x->>'productId' = 'websites') = 1, 'published revision');
  perform pg_temp.sy_assert(jsonb_array_length(e->'managedWebsites') = 3, 'two links plus one binding without a link');
  perform pg_temp.sy_assert((select count(*) from jsonb_array_elements(e->'managedWebsites') x where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b2') = 1,
    'a tenant with a link is not repeated from its binding');
  perform pg_temp.sy_assert((select x->>'link' from jsonb_array_elements(e->'managedWebsites') x where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b3') = 'website_binding', 'unlinked binding is read');
  perform pg_temp.sy_assert(jsonb_array_length(e->'calendarConnections') = 1 and e->'calendarConnections'->0->>'calendarName' = 'Front desk', 'calendar binding');
end $$;

-- After exit, writes stop and reads continue.
select public.create_business_system('5e000000-0000-4000-8000-000000000013', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  '{"name":"Before exit","kind":"report"}', '5e000000-0000-4000-8000-0000000000c8', repeat('1', 64));
insert into public.workspace_exit_requests(workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation,
  maintained_resource_action, state, completed_at)
  values ('5e000000-0000-4000-8000-000000000013', '5e000000-0000-4000-8000-000000000001', 'sy-exit', repeat('9', 64), 'pause', 'keep', 'stop',
    '{"status":"completed"}', now());
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000013','5e000000-0000-4000-8000-000000000001','sy-owner@example.test','{"name":"After exit","kind":"report"}','5e000000-0000-4000-8000-0000000000c9',repeat('1',64))$$, 'workspace_exit_future_work_blocked');
select pg_temp.sy_assert(jsonb_array_length(public.read_business_systems('5e000000-0000-4000-8000-000000000013',
  '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test')->'systems') = 1, 'exited business stays readable');

rollback;
