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
  and not has_function_privilege('service_role', 'public.system_load(uuid,uuid,boolean,uuid[])', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_actor_scope(uuid,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.business_record_agency_work_ids(uuid,uuid,text,boolean)', 'EXECUTE')
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
select pg_temp.sy_assert(public.system_origin_id('5e000000-0000-4000-8000-000000000010', 'tenant', '5e000000-0000-4000-8000-0000000000b2')
  = '60111262-7fba-474e-a004-3f5d2eee18f0', 'tenant origin id matches the TypeScript derivation');

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

-- A native-first website reserved its own hosted tenant; a rebuild published
-- to a managed tenant did not. from-existing.ts keys identity on this.
insert into public.tenants(id, stable_id, site_name, active) values
  ('sy-reserved', '5e000000-0000-4000-8000-0000000000b5', 'Juniper reserved', true);
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('5e000000-0000-4000-8000-0000000000a6', '5e000000-0000-4000-8000-000000000010', 'websites', 'website', 'Native first', '{}', '5e000000-0000-4000-8000-000000000001');
insert into public.website_hosted_tenant_reservations(website_work_id, workspace_id, tenant_id, tenant_stable_id, created_by) values
  ('5e000000-0000-4000-8000-0000000000a6', '5e000000-0000-4000-8000-000000000010', 'sy-reserved', '5e000000-0000-4000-8000-0000000000b5', '5e000000-0000-4000-8000-000000000001');
do $$ declare e jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test');
  perform pg_temp.sy_assert((select (x->>'hostedTenantReserved')::boolean from jsonb_array_elements(e->'savedWork') x
    where x->>'id' = '5e000000-0000-4000-8000-0000000000a6') is true, 'native-first website reports its reserved tenant');
  perform pg_temp.sy_assert((select (x->>'hostedTenantReserved')::boolean from jsonb_array_elements(e->'savedWork') x
    where x->>'id' = '5e000000-0000-4000-8000-0000000000a2') is false, 'rebuild published to a managed tenant is not a reservation');
end $$;

-- Inquiries come only from tenants this business holds. A tenant linked to
-- another business keeps a stale active binding here; its inquiries stay out.
insert into public.tenants(id, stable_id, site_name, active) values
  ('sy-elsewhere', '5e000000-0000-4000-8000-0000000000b4', 'Moved site', true);
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('5e000000-0000-4000-8000-0000000000b4', 'sy-elsewhere', '5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000004', gen_random_uuid(), repeat('c', 64), '{}');
insert into public.offering_website_bindings(business_workspace_id, tenant_stable_id, tenant_id_at_binding, site_name_at_binding, idempotency_key, command_digest, created_by, updated_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000b4', 'sy-elsewhere', 'Moved site', 'sy-bind-3', repeat('d', 64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001');
insert into public.inquiry_workspaces(tenant_id, tenant_stable_id, business_id, state) values
  ('sy-managed', '5e000000-0000-4000-8000-0000000000b2', 'default', '{"inquiries":[]}'),
  ('sy-elsewhere', '5e000000-0000-4000-8000-0000000000b4', 'default', '{"inquiries":[]}');
do $$ declare e jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test');
  perform pg_temp.sy_assert((select count(*) from jsonb_array_elements(e->'inquiryWorkspaces') x
    where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b2') = 1, 'linked tenant inquiries are listed');
  perform pg_temp.sy_assert(not exists (select 1 from jsonb_array_elements(e->'inquiryWorkspaces') x
    where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b4'), 'another business''s inquiries are not listed through a stale binding');
  perform pg_temp.sy_assert(not exists (select 1 from jsonb_array_elements(e->'managedWebsites') x
    where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b4'), 'a tenant linked elsewhere is not a managed website here');
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000011', '5e000000-0000-4000-8000-000000000004', 'sy-other-owner@example.test');
  perform pg_temp.sy_assert((select count(*) from jsonb_array_elements(e->'inquiryWorkspaces') x
    where x->>'tenantStableId' = '5e000000-0000-4000-8000-0000000000b4') = 1, 'the linked business sees its own inquiries');
end $$;

-- A share reconnects only while the actor can still write in both businesses.
-- Revoking it never needs the other side, and the target business may revoke.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000004', 'owner', '5e000000-0000-4000-8000-000000000001');
create temp table sy_share on commit drop as
  select id from public.system_connections where kind = 'share' and target_business_workspace_id = '5e000000-0000-4000-8000-000000000014';
select pg_temp.sy_assert((select count(*) from sy_share) = 1, 'one share into Juniper Catering');
select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_share), 'disconnected');
delete from public.workspace_memberships where workspace_id = '5e000000-0000-4000-8000-000000000014' and user_id = '5e000000-0000-4000-8000-000000000001';
select pg_temp.sy_expect($$select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',(select id from sy_share),'connected')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000001','sy-owner@example.test',(select id from sy_share),'stale')$$, 'business_record_access_denied');
select pg_temp.sy_assert((select state from public.system_connections where id = (select id from sy_share)) = 'disconnected', 'removed user could not reconnect the share');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000001', 'owner', '5e000000-0000-4000-8000-000000000004');
select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_share), 'connected');
select pg_temp.sy_expect($$select public.set_system_connection_state('5e000000-0000-4000-8000-000000000014','5e000000-0000-4000-8000-000000000004','sy-other-owner@example.test',(select id from sy_share),'connected')$$, 'system_not_found');
select pg_temp.sy_assert(public.set_system_connection_state('5e000000-0000-4000-8000-000000000014', '5e000000-0000-4000-8000-000000000004', 'sy-other-owner@example.test',
  (select id from sy_share), 'disconnected')->>'state' = 'disconnected', 'the target business revokes the share');
select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_share), 'connected');
delete from public.workspace_memberships where workspace_id = '5e000000-0000-4000-8000-000000000014' and user_id = '5e000000-0000-4000-8000-000000000001';
select pg_temp.sy_assert(public.set_system_connection_state('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_share), 'disconnected')->>'state' = 'disconnected', 'the source revokes without the target');

-- Pause is stored once and kept in step in one transaction: a booking System
-- adopted from a schedule and that schedule's `pause` field never diverge,
-- whichever side is written.
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('5e000000-0000-4000-8000-0000000000f1', '5e000000-0000-4000-8000-000000000010', 'scheduling', 'schedule', 'Fittings',
   '{"version":1,"revision":0,"title":"Fittings","createdBy":"5e000000-0000-4000-8000-000000000001","createdAt":"2026-10-01T12:00:00Z","history":[],"availability":[],"reservations":[]}',
   '5e000000-0000-4000-8000-000000000001');
insert into sy_ids select 'booking', (public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Fittings","kind":"booking","origin":{"kind":"saved_work","ref":"5e000000-0000-4000-8000-0000000000f1"}}',
  '5e000000-0000-4000-8000-0000000000f2', repeat('7', 64))->>'id')::uuid;
select public.record_system_revision('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'booking'), 1, '{"implementation":{"kind":"schedule","ref":"work:5e000000-0000-4000-8000-0000000000f1"}}',
  '5e000000-0000-4000-8000-0000000000f3', repeat('7', 64), true);
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'booking'), 2, 'live');
-- The schedule side pauses (what the scheduling service writes): the System follows.
update public.saved_product_work set payload = payload || jsonb_build_object('revision', 1,
    'pause', jsonb_build_object('pausedAt', '2026-10-02T12:00:00Z', 'pausedBy', '5e000000-0000-4000-8000-000000000001', 'reason', 'Owner away'),
    'history', jsonb_build_array(jsonb_build_object('revision', 1, 'kind', 'pause', 'actorId', '5e000000-0000-4000-8000-000000000001', 'at', '2026-10-02T12:00:00Z')))
  where id = '5e000000-0000-4000-8000-0000000000f1';
select pg_temp.sy_assert((select lifecycle from public.systems where id = (select id from sy_ids where name = 'booking')) = 'paused',
  'pausing the schedule pauses its booking System in the same transaction');
select pg_temp.sy_assert((select s->>'schedulePaused' from jsonb_array_elements(public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010',
  '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test')->'savedWork') s where s->>'id' = '5e000000-0000-4000-8000-0000000000f1') = 'true',
  'the existing-things reader reports the schedule pause');
-- The System side resumes: the schedule's pause is removed in the same transaction, as a new revision.
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'booking'), (select change_number from public.systems where id = (select id from sy_ids where name = 'booking')), 'live');
select pg_temp.sy_assert((select not (payload ? 'pause') and (payload->>'revision')::int = 2 and payload->'history'->-1->>'kind' = 'resume'
    and payload->'history'->-1->>'actorId' = '5e000000-0000-4000-8000-000000000001'
  from public.saved_product_work where id = '5e000000-0000-4000-8000-0000000000f1'), 'resuming the System resumes the schedule as revision 2');
select pg_temp.sy_assert((select lifecycle from public.systems where id = (select id from sy_ids where name = 'booking')) = 'live', 'System is live again');
-- The System side pauses: the schedule records the pause.
select public.transition_system_lifecycle('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  (select id from sy_ids where name = 'booking'), (select change_number from public.systems where id = (select id from sy_ids where name = 'booking')), 'paused');
select pg_temp.sy_assert((select payload->'pause'->>'pausedBy' = '5e000000-0000-4000-8000-000000000001' and (payload->>'revision')::int = 3
  from public.saved_product_work where id = '5e000000-0000-4000-8000-0000000000f1'), 'pausing the System pauses the schedule');
-- The schedule side resumes: the System follows.
update public.saved_product_work set payload = (payload - 'pause') || jsonb_build_object('revision', 4)
  where id = '5e000000-0000-4000-8000-0000000000f1';
select pg_temp.sy_assert((select lifecycle from public.systems where id = (select id from sy_ids where name = 'booking')) = 'live',
  'resuming the schedule resumes its booking System');
select pg_temp.sy_assert(not exists (
  select 1 from public.systems s join public.saved_product_work w on s.origin_kind = 'saved_work' and s.origin_ref = w.id::text
  where w.product_id = 'scheduling' and s.lifecycle in ('live','paused') and (s.lifecycle = 'paused') <> (w.payload ? 'pause')), 'no booking System disagrees with its schedule');

-- Agency scope. An agency is not a member of the business; it reaches only
-- the Systems tied to the exact work it was delegated or assigned. Direct
-- members keep the whole business.
insert into public.users(id, email, verified_at) values
  ('5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test', now()),
  ('5e000000-0000-4000-8000-000000000006', 'sy-delegate@example.test', now()),
  ('5e000000-0000-4000-8000-000000000007', 'sy-expired@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('5e000000-0000-4000-8000-000000000015', 'agency', 'Assigned Agency', '5e000000-0000-4000-8000-000000000005'),
  ('5e000000-0000-4000-8000-000000000016', 'agency', 'Delegated Agency', '5e000000-0000-4000-8000-000000000006'),
  ('5e000000-0000-4000-8000-000000000017', 'agency', 'Expired Agency', '5e000000-0000-4000-8000-000000000007');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5e000000-0000-4000-8000-000000000015', '5e000000-0000-4000-8000-000000000005', 'owner', '5e000000-0000-4000-8000-000000000005'),
  ('5e000000-0000-4000-8000-000000000016', '5e000000-0000-4000-8000-000000000006', 'owner', '5e000000-0000-4000-8000-000000000006'),
  ('5e000000-0000-4000-8000-000000000017', '5e000000-0000-4000-8000-000000000007', 'owner', '5e000000-0000-4000-8000-000000000007');
-- An approved responsibility whose steps are the website (a2) and the Orders
-- tracker (a3), assigned to the agency with an accepted provider delivery.
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('5e000000-0000-4000-8000-0000000001a1', '5e000000-0000-4000-8000-000000000010', 'operations', 'responsibility', 'Run the site',
   '{"ownerId":"5e000000-0000-4000-8000-000000000001","approvedBy":"5e000000-0000-4000-8000-000000000001","approvedAt":"2026-10-01T12:00:00Z",
     "steps":[{"id":"site","workId":"5e000000-0000-4000-8000-0000000000a2"},{"id":"orders","workId":"5e000000-0000-4000-8000-0000000000a3"}]}',
   '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-0000000001a2', '5e000000-0000-4000-8000-000000000010', 'operations', 'responsibility', 'Old engagement',
   '{"ownerId":"5e000000-0000-4000-8000-000000000001","approvedBy":"5e000000-0000-4000-8000-000000000001","approvedAt":"2026-09-01T12:00:00Z",
     "steps":[{"id":"orders","workId":"5e000000-0000-4000-8000-0000000000a3"}]}',
   '5e000000-0000-4000-8000-000000000001');
insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
    assignee_workspace_id, offer_key, work_scope, status, offered_at, accepted_at, expires_at) values
  ('5e000000-0000-4000-8000-0000000001b1', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000001a1',
   '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test', '5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test', 'agency',
   '5e000000-0000-4000-8000-000000000015', 'sy-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '7 days'),
  ('5e000000-0000-4000-8000-0000000001b2', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000001a2',
   '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test', '5e000000-0000-4000-8000-000000000007', 'sy-expired@example.test', 'agency',
   '5e000000-0000-4000-8000-000000000017', 'sy-offer-old', '{}', 'accepted', clock_timestamp() - interval '30 days', clock_timestamp() - interval '29 days',
   clock_timestamp() - interval '1 day');
insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
    accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by) values
  ('5e000000-0000-4000-8000-0000000001c1', '5e000000-0000-4000-8000-000000000010', 'systems_agency_fixture', '1.0.0',
   '[{"id":"5e000000-0000-4000-8000-0000000000a2"},{"id":"5e000000-0000-4000-8000-0000000000a3"}]',
   '{"kind":"provider_requested","providerKind":"agency","agencyWorkspaceId":"5e000000-0000-4000-8000-000000000015"}',
   array['operate'], array['workspace'], 'sy-install', repeat('a', 64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001'),
  ('5e000000-0000-4000-8000-0000000001c2', '5e000000-0000-4000-8000-000000000010', 'systems_agency_fixture_old', '1.0.0',
   '[{"id":"5e000000-0000-4000-8000-0000000000a3"}]',
   '{"kind":"provider_requested","providerKind":"agency","agencyWorkspaceId":"5e000000-0000-4000-8000-000000000017"}',
   array['operate'], array['workspace'], 'sy-install-old', repeat('a', 64), '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001');
insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
    command_digest, requested_by, expires_at, accepted_by, accepted_at, history) values
  ('5e000000-0000-4000-8000-0000000001d1', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000001c1',
   '5e000000-0000-4000-8000-0000000001b1', 'accepted', array['operate'], 'sy-delivery', repeat('a', 64),
   '5e000000-0000-4000-8000-000000000001', clock_timestamp() + interval '7 days', '5e000000-0000-4000-8000-000000000005', clock_timestamp(), '[]'),
  ('5e000000-0000-4000-8000-0000000001d2', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000001c2',
   '5e000000-0000-4000-8000-0000000001b2', 'accepted', array['operate'], 'sy-delivery-old', repeat('a', 64),
   '5e000000-0000-4000-8000-000000000001', clock_timestamp() + interval '7 days', '5e000000-0000-4000-8000-000000000007', clock_timestamp(), '[]');
-- A read-only delegation of the Fittings schedule (f1), and a public booking grant on it.
insert into public.workspace_delegations(customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by) values
  ('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000f1', '5e000000-0000-4000-8000-000000000016',
   '5e000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000006');
insert into public.public_website_booking_grants(tenant_stable_id, business_workspace_id, work_id, capability_id, capability_version,
    inquiry_capability_id, inquiry_version, provider, display_name, time_zone, published_by) values
  ('5e000000-0000-4000-8000-0000000000b2', '5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-0000000000f1', 'fittings', 1,
   'contact', 1, 'google', 'Fittings', 'America/New_York', '5e000000-0000-4000-8000-000000000001');
-- Stored Systems the owner adopts: Orders (a3), the native site's tenant (b1),
-- and two connections from Orders, one to the site and one to the proposal.
insert into sy_ids select 'orders', (public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Orders","kind":"tracker","origin":{"kind":"saved_work","ref":"5e000000-0000-4000-8000-0000000000a3"}}',
  '5e000000-0000-4000-8000-0000000002c1', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'site', (public.create_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001',
  'sy-owner@example.test', '{"name":"Juniper site","kind":"website","origin":{"kind":"tenant","ref":"5e000000-0000-4000-8000-0000000000b1"}}',
  '5e000000-0000-4000-8000-0000000002c2', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'orders_to_site', (public.connect_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  jsonb_build_object('source', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010', 'systemId', (select id from sy_ids where name = 'orders')),
    'kind', 'appear', 'target', jsonb_build_object('type', 'system', 'system', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010',
    'systemId', (select id from sy_ids where name = 'site')))), '5e000000-0000-4000-8000-0000000002c3', repeat('1', 64))->>'id')::uuid;
insert into sy_ids select 'orders_to_proposal', (public.connect_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000001', 'sy-owner@example.test',
  jsonb_build_object('source', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010', 'systemId', (select id from sy_ids where name = 'orders')),
    'kind', 'read', 'target', jsonb_build_object('type', 'system', 'system', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010',
    'systemId', (select id from sy_ids where name = 'proposal')))), '5e000000-0000-4000-8000-0000000002c4', repeat('1', 64))->>'id')::uuid;

-- A direct member still sees the whole business.
do $$ declare e jsonb; g jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test');
  perform pg_temp.sy_assert(e->>'scope' = 'business', 'member scope is the business');
  perform pg_temp.sy_assert((select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(e->'savedWork') x)
    = array['5e000000-0000-4000-8000-0000000000a2', '5e000000-0000-4000-8000-0000000000a3', '5e000000-0000-4000-8000-0000000000a6',
      '5e000000-0000-4000-8000-0000000000f1'], 'member sees every saved work row the projection maps');
  perform pg_temp.sy_assert(jsonb_array_length(e->'inquiryWorkspaces') >= 1 and jsonb_array_length(e->'bookingGrants') = 1
    and jsonb_array_length(e->'calendarConnections') = 1 and jsonb_array_length(e->'managedWebsites') >= 2, 'member sees inquiries, grants, calendars and sites');
  g := public.read_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000002', 'sy-member@example.test');
  perform pg_temp.sy_assert(exists (select 1 from jsonb_array_elements(g->'systems') x where (x->>'id')::uuid = (select id from sy_ids where name = 'proposal'))
    and exists (select 1 from jsonb_array_elements(g->'connections') x where (x->>'id')::uuid = (select id from sy_ids where name = 'orders_to_proposal')),
    'member sees the proposal and every connection');
end $$;

-- The assigned agency sees exactly its assigned work: the site (a2, with its
-- tenant b1) and Orders (a3). Not the other sites, inquiries, the booking
-- grant on undelegated work, the calendar connection or other stored Systems.
do $$ declare e jsonb; g jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test');
  perform pg_temp.sy_assert(e->>'scope' = 'assigned', 'agency scope is its assigned work');
  perform pg_temp.sy_assert((select array_agg(x->>'id' order by x->>'id') from jsonb_array_elements(e->'savedWork') x)
    = array['5e000000-0000-4000-8000-0000000000a2', '5e000000-0000-4000-8000-0000000000a3'], 'agency sees only its assigned saved work');
  perform pg_temp.sy_assert((select array_agg(x->>'tenantStableId') from jsonb_array_elements(e->'managedWebsites') x)
    = array['5e000000-0000-4000-8000-0000000000b1'], 'agency sees only the site its work hosts');
  perform pg_temp.sy_assert(jsonb_array_length(e->'inquiryWorkspaces') = 0, 'agency sees no inquiry handling');
  perform pg_temp.sy_assert(jsonb_array_length(e->'bookingGrants') = 0, 'agency sees no booking grant on undelegated work');
  perform pg_temp.sy_assert(jsonb_array_length(e->'calendarConnections') = 0, 'agency sees no calendar connection');
  g := public.read_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test');
  perform pg_temp.sy_assert((select array_agg((x->>'id')::uuid order by x->>'id') from jsonb_array_elements(g->'systems') x)
    = (select array_agg(id order by id::text) from sy_ids where name in ('orders', 'site')), 'agency sees only the Systems of its work');
  perform pg_temp.sy_assert((select array_agg((x->>'id')::uuid) from jsonb_array_elements(g->'connections') x)
    = array[(select id from sy_ids where name = 'orders_to_site')], 'agency sees only connections inside its scope');
end $$;
select pg_temp.sy_expect(format($$select public.read_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test',%L)$$, (select id from sy_ids where name = 'proposal')), 'system_not_found');
select pg_temp.sy_expect(format($$select public.read_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test',%L)$$, (select id from sy_ids where name = 'booking')), 'system_not_found');
select pg_temp.sy_assert(public.read_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test',
  (select id from sy_ids where name = 'orders'))->'system'->>'name' = 'Orders', 'agency opens its own System');
-- It writes only inside that work.
select pg_temp.sy_assert(public.update_business_system('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000005', 'sy-agency@example.test',
  (select id from sy_ids where name = 'orders'), 1, '{"purpose":"Track catering orders"}')->>'purpose' = 'Track catering orders', 'agency updates its assigned System');
select pg_temp.sy_expect(format($$select public.update_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test',%L,%s,'{"name":"Taken"}')$$,
  (select id from sy_ids where name = 'proposal'), (select change_number from public.systems where id = (select id from sy_ids where name = 'proposal'))), 'system_not_found');
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test','{"name":"Loose","kind":"report"}','5e000000-0000-4000-8000-0000000002c5',repeat('1',64))$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.create_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test','{"name":"A plan","kind":"plan","origin":{"kind":"saved_work","ref":"5e000000-0000-4000-8000-0000000000a4"}}','5e000000-0000-4000-8000-0000000002c6',repeat('1',64))$$, 'business_record_access_denied');
select pg_temp.sy_expect(format($$select public.connect_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test',%L,'5e000000-0000-4000-8000-0000000002c7',repeat('1',64))$$,
  jsonb_build_object('source', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010', 'systemId', (select id from sy_ids where name = 'orders')),
    'kind', 'trigger', 'target', jsonb_build_object('type', 'system', 'system', jsonb_build_object('businessId', '5e000000-0000-4000-8000-000000000010',
    'systemId', (select id from sy_ids where name = 'booking'))))), 'system_connection_target_missing');
select pg_temp.sy_expect(format($$select public.set_system_connection_state('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000005','sy-agency@example.test',%L,'disconnected')$$,
  (select id from sy_ids where name = 'orders_to_proposal')), 'system_not_found');

-- A read-only delegation of one schedule shows that schedule's System and its
-- booking grant, and nothing else; it never writes.
do $$ declare e jsonb; g jsonb; begin
  e := public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000006', 'sy-delegate@example.test');
  perform pg_temp.sy_assert((select array_agg(x->>'id') from jsonb_array_elements(e->'savedWork') x)
    = array['5e000000-0000-4000-8000-0000000000f1'], 'delegate sees only the delegated schedule');
  perform pg_temp.sy_assert((select array_agg(x->>'workId') from jsonb_array_elements(e->'bookingGrants') x)
    = array['5e000000-0000-4000-8000-0000000000f1'], 'delegate sees the booking grant on its schedule');
  perform pg_temp.sy_assert(jsonb_array_length(e->'managedWebsites') = 0 and jsonb_array_length(e->'inquiryWorkspaces') = 0
    and jsonb_array_length(e->'calendarConnections') = 0, 'delegate sees no sites, inquiries or calendars');
  g := public.read_business_systems('5e000000-0000-4000-8000-000000000010', '5e000000-0000-4000-8000-000000000006', 'sy-delegate@example.test');
  perform pg_temp.sy_assert((select array_agg((x->>'id')::uuid) from jsonb_array_elements(g->'systems') x)
    = array[(select id from sy_ids where name = 'booking')], 'delegate sees only the delegated work''s System');
end $$;
select pg_temp.sy_expect(format($$select public.update_business_system('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000006','sy-delegate@example.test',%L,%s,'{"name":"Taken"}')$$,
  (select id from sy_ids where name = 'booking'), (select change_number from public.systems where id = (select id from sy_ids where name = 'booking'))), 'business_record_access_denied');

-- An expired assignment, a stranger and an agency of another business are refused.
select pg_temp.sy_expect($$select public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000007','sy-expired@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000007','sy-expired@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_existing_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000003','sy-stranger@example.test')$$, 'business_record_access_denied');
select pg_temp.sy_expect($$select public.read_existing_business_systems('5e000000-0000-4000-8000-000000000011','5e000000-0000-4000-8000-000000000005','sy-agency@example.test')$$, 'business_record_access_denied');
-- Revoking the delegation closes the view.
update public.workspace_delegations set status = 'revoked', revoked_at = now(), revoked_by = '5e000000-0000-4000-8000-000000000001'
  where customer_work_id = '5e000000-0000-4000-8000-0000000000f1';
select pg_temp.sy_expect($$select public.read_business_systems('5e000000-0000-4000-8000-000000000010','5e000000-0000-4000-8000-000000000006','sy-delegate@example.test')$$, 'business_record_access_denied');

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
