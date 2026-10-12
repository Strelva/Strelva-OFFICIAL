\set ON_ERROR_STOP on
-- Make real activations on saved_product_work (operations/activation), on
-- fictional rows. Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ma_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'make real assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ma_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- A fresh activation as createMakeReal().start writes it.
create or replace function pg_temp.ma_base(p_id text, p_workspace text, p_actor text) returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1, 'id', p_id, 'businessId', p_workspace, 'possibilityId', 'poss-1', 'candidateRevision', 1,
    'actorId', p_actor, 'status', 'in_progress', 'revision', 0,
    'pinned', jsonb_build_array(jsonb_build_object('systemId', 'sys-site', 'baselineRevisionId', 'rev-1')),
    'introduced', '[]'::jsonb, 'connections', '[]'::jsonb, 'approvals', '[]'::jsonb,
    'checks', jsonb_build_array(jsonb_build_object('id', 'chk-1', 'description', 'Site answers', 'status', 'pending')),
    'steps', jsonb_build_array(
      jsonb_build_object('id', 's1', 'kind', 'stage', 'target', 'sys-site', 'label', 'Stage the site', 'dependsOn', '[]'::jsonb,
        'reversibility', 'reversible', 'idempotencyKey', 'k-s1', 'status', 'pending', 'effect', 'none', 'attempts', 0),
      jsonb_build_object('id', 's2', 'kind', 'effect', 'target', 'fx-publish', 'label', 'Publish', 'dependsOn', '["s1"]'::jsonb,
        'effectKind', 'publish', 'reversibility', 'compensable', 'idempotencyKey', 'k-s2', 'status', 'pending', 'effect', 'none', 'attempts', 0),
      jsonb_build_object('id', 's3', 'kind', 'activate', 'target', 'sys-site', 'label', 'Switch live', 'dependsOn', '["s2"]'::jsonb,
        'reversibility', 'reversible', 'idempotencyKey', 'k-s3', 'status', 'pending', 'effect', 'none', 'attempts', 0)),
    'createdAt', '2026-10-06T12:00:00.000Z', 'updatedAt', '2026-10-06T12:00:00.000Z', 'history', '[]'::jsonb)
$$;
-- The next revision with one history event, as runner.record() makes it.
create or replace function pg_temp.ma_next(p jsonb, p_kind text, p_actor text) returns jsonb language sql as $$
  select jsonb_set(jsonb_set(jsonb_set(p, '{revision}', to_jsonb((p->>'revision')::int + 1)),
    '{updatedAt}', '"2026-10-06T12:05:00.000Z"'),
    '{history}', (p->'history') || jsonb_build_array(jsonb_build_object(
      'revision', (p->>'revision')::int + 1, 'kind', p_kind, 'actorId', p_actor, 'at', '2026-10-06T12:05:00.000Z')))
$$;
create or replace function pg_temp.ma_step(p jsonb, p_index int, p_patch jsonb) returns jsonb language sql as $$
  select jsonb_set(p, array['steps', p_index::text], (p->'steps'->p_index) || p_patch)
$$;
-- The latest stored payload.
create or replace function pg_temp.ma_row(p_workspace uuid, p_id text) returns jsonb language sql as $$
  select payload from public.saved_product_work
  where workspace_id = p_workspace and product_id = 'operations' and resource_kind = 'activation' and payload->>'id' = p_id
$$;
create or replace function pg_temp.ma_save(p jsonb, p_actor uuid, p_email text) returns jsonb language sql as $$
  select public.save_make_real_activation((p->>'businessId')::uuid, p_actor, p_email, p->>'id', (p->>'revision')::int - 1, p)
$$;

-- Only the service role reaches the RPCs; helpers are reachable by nobody.
select pg_temp.ma_assert(
  not has_function_privilege('anon', 'public.read_make_real_activation(uuid,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_make_real_activation(uuid,uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.make_real_activation_actor(uuid,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.make_real_activation_set_writer(boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.make_real_activation_shape_valid(jsonb,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_make_real_activation(uuid,uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.create_make_real_activation(uuid,uuid,text,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)', 'EXECUTE')
  and (select relrowsecurity from pg_class where oid = 'public.saved_product_work'::regclass),
  'only service_role executes the activation RPCs');

insert into public.users(id, email, verified_at) values
  ('ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test', now()),
  ('ac000000-0000-4000-8000-000000000002', 'ma-admin@example.test', now()),
  ('ac000000-0000-4000-8000-000000000003', 'ma-member@example.test', now()),
  ('ac000000-0000-4000-8000-000000000004', 'ma-stranger@example.test', now()),
  ('ac000000-0000-4000-8000-000000000005', 'ma-other-owner@example.test', now()),
  ('ac000000-0000-4000-8000-000000000006', 'ma-unverified@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('ac000000-0000-4000-8000-000000000010', 'customer', 'Juniper Bakery', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000011', 'customer', 'Other Business', 'ac000000-0000-4000-8000-000000000005'),
  ('ac000000-0000-4000-8000-000000000012', 'personal', 'Personal', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000013', 'customer', 'Exited Business', 'ac000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001', 'owner', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000002', 'admin', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000003', 'member', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000006', 'owner', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000011', 'ac000000-0000-4000-8000-000000000005', 'owner', 'ac000000-0000-4000-8000-000000000005'),
  ('ac000000-0000-4000-8000-000000000012', 'ac000000-0000-4000-8000-000000000001', 'owner', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000013', 'ac000000-0000-4000-8000-000000000001', 'owner', 'ac000000-0000-4000-8000-000000000001');

create temp table ma_state(name text primary key, payload jsonb) on commit drop;
insert into ma_state values ('base', pg_temp.ma_base('act-1', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001'));

-- Nothing but these RPCs writes an activation row.
select pg_temp.ma_expect($$insert into public.saved_product_work(workspace_id, product_id, resource_kind, payload, created_by)
  values ('ac000000-0000-4000-8000-000000000010', 'operations', 'activation', (select payload from ma_state where name = 'base'), 'ac000000-0000-4000-8000-000000000001')$$,
  'make_real_activation_invalid');

-- Create refusals: member, stranger, other business's owner, unverified,
-- personal workspace, mismatched business, non-fresh payloads.
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000003','ma-member@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000004','ma-stranger@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000006','ma-unverified@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-admin@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000012','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',pg_temp.ma_base('act-p','ac000000-0000-4000-8000-000000000012','ac000000-0000-4000-8000-000000000001'))$$, 'make_real_activation_access_denied');
-- The other business's owner cannot plant an activation naming this business in their own.
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',jsonb_set((select payload from ma_state where name='base'),'{revision}','3'))$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',pg_temp.ma_step((select payload from ma_state where name='base'),1,'{"status":"completed","effect":"accepted"}'))$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000002','ma-admin@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',jsonb_set((select payload from ma_state where name='base'),'{steps,1,id}','"s1"'))$$, 'make_real_activation_invalid');

-- Create, then a duplicate id is refused.
select pg_temp.ma_assert(public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',
  (select payload from ma_state where name='base')) = (select payload from ma_state where name='base'), 'owner creates the activation');
select pg_temp.ma_assert((select count(*) from public.saved_product_work where product_id='operations' and resource_kind='activation'
  and workspace_id='ac000000-0000-4000-8000-000000000010' and created_by='ac000000-0000-4000-8000-000000000001' and input->>'activationId'='act-1') = 1,
  'one operations/activation row');
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',(select payload from ma_state where name='base'))$$, 'make_real_activation_exists');

-- Reads: any direct member; nobody else; another business sees nothing.
select pg_temp.ma_assert(public.read_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000003','ma-member@example.test','act-1')->>'id' = 'act-1', 'member reads');
select pg_temp.ma_assert(public.read_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000003','ma-member@example.test','act-missing') is null, 'missing reads as null');
select pg_temp.ma_expect($$select public.read_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000004','ma-stranger@example.test','act-1')$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.read_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test','act-1')$$, 'make_real_activation_access_denied');
select pg_temp.ma_assert(public.read_make_real_activation('ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test','act-1') is null, 'another business never sees it');

-- Claim s1 (revision 1): compare-and-set save.
insert into ma_state values ('r1', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='base'), 0,
  '{"status":"running","attempts":1,"leaseId":"lease-1","startedAt":"2026-10-06T12:01:00.000Z"}'), 'started', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_assert(pg_temp.ma_save((select payload from ma_state where name='r1'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test')->>'revision' = '1', 'CAS save to revision 1');
select pg_temp.ma_assert(pg_temp.ma_row('ac000000-0000-4000-8000-000000000010', 'act-1') = (select payload from ma_state where name='r1'), 'stored payload is revision 1');

-- A stale writer (still at revision 0) is refused and changes nothing.
select pg_temp.ma_expect($$select public.save_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test','act-1',0,
  pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='base'),0,'{"status":"blocked","reason":"late"}'),'blocked','ac000000-0000-4000-8000-000000000001'))$$, 'make_real_activation_revision_conflict');
select pg_temp.ma_assert(pg_temp.ma_row('ac000000-0000-4000-8000-000000000010', 'act-1') = (select payload from ma_state where name='r1'), 'stale save changed nothing');

-- Members, strangers and other businesses cannot save; a wrong business finds nothing.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_next((select payload from ma_state where name='r1'),'pause','ac000000-0000-4000-8000-000000000003'),'ac000000-0000-4000-8000-000000000003','ma-member@example.test')$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_next((select payload from ma_state where name='r1'),'pause','ac000000-0000-4000-8000-000000000004'),'ac000000-0000-4000-8000-000000000004','ma-stranger@example.test')$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_next((select payload from ma_state where name='r1'),'pause','ac000000-0000-4000-8000-000000000005'),'ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test')$$, 'make_real_activation_access_denied');
select pg_temp.ma_expect($$select public.save_make_real_activation('ac000000-0000-4000-8000-000000000011','ac000000-0000-4000-8000-000000000005','ma-other-owner@example.test','act-1',1,
  jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r1'),'pause','ac000000-0000-4000-8000-000000000005'),'{businessId}','"ac000000-0000-4000-8000-000000000011"'))$$, 'make_real_activation_not_found');

-- History only grows, by exactly one event from the caller.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000001'),'{history,0,kind}','"approve"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(jsonb_set((select payload from ma_state where name='r1'),'{revision}','2'),'{history}','[]'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000001'),'{history}',
  ((select payload from ma_state where name='r1')->'history') || '[{"revision":2,"kind":"resume","actorId":"ac000000-0000-4000-8000-000000000001","at":"2026-10-06T12:05:00.000Z"},{"revision":2,"kind":"resume","actorId":"ac000000-0000-4000-8000-000000000001","at":"2026-10-06T12:05:00.000Z"}]'),
  'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000002'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- Identity fields and step frames are fixed.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000001'),'{possibilityId}','"poss-2"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000001'),1,'{"idempotencyKey":"k-other"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r1'),'resume','ac000000-0000-4000-8000-000000000001'),0,'{"attempts":0}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- A pending step cannot jump straight to completed, restored or compensated.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r1'),'outcome','ac000000-0000-4000-8000-000000000001'),2,'{"status":"completed"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r1'),'outcome','ac000000-0000-4000-8000-000000000001'),2,'{"status":"restored"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');

-- s1 completes (2), s2 runs (3), the publish is accepted (4).
insert into ma_state values ('r2', pg_temp.ma_next(pg_temp.ma_step(jsonb_set((select payload from ma_state where name='r1'), '{pinned,0,stagedRevisionId}', '"rev-2"'), 0,
  '{"status":"completed","leaseId":null,"finishedAt":"2026-10-06T12:02:00.000Z","receipt":{"adapterMode":"internal","acceptedAt":"2026-10-06T12:02:00.000Z","result":{"revisionId":"rev-2"}}}') #- '{steps,0,leaseId}', 'outcome', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r2'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
insert into ma_state values ('r3', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='r2'), 1,
  '{"status":"running","attempts":1,"leaseId":"lease-2","startedAt":"2026-10-06T12:03:00.000Z"}'), 'started', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r3'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
insert into ma_state values ('r4', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='r3'), 1,
  '{"status":"completed","effect":"accepted","finishedAt":"2026-10-06T12:04:00.000Z","receipt":{"providerRef":"pub-1","adapterMode":"isolated","acceptedAt":"2026-10-06T12:04:00.000Z"}}') #- '{steps,1,leaseId}', 'outcome', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r4'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');

-- The staged pointer is written once.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r4'),'outcome','ac000000-0000-4000-8000-000000000001'),'{pinned,0,stagedRevisionId}','"rev-9"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- A completed step never changes outside rollback: not its status, reason or receipt.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r4'),'resume','ac000000-0000-4000-8000-000000000001'),0,'{"status":"pending"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r4'),'outcome','ac000000-0000-4000-8000-000000000001'),0,'{"reason":"rewritten"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r4'),'outcome','ac000000-0000-4000-8000-000000000001'),0,'{"status":"restored"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- An accepted effect is not undone without rollback either.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r4'),'reconcile','ac000000-0000-4000-8000-000000000001'),1,'{"status":"failed","effect":"none"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- rollback_step needs rollback to have started.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r4'),'rollback_step','ac000000-0000-4000-8000-000000000001'),0,'{"status":"restored"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- made_real needs every step completed and every check passed.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r4'),'outcome','ac000000-0000-4000-8000-000000000001'),'{status}','"made_real"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');

-- An admin (not the starter) may record an event as themself (5).
insert into ma_state values ('r5', pg_temp.ma_next(jsonb_set((select payload from ma_state where name='r4'), '{approvals}',
  '[{"effectId":"fx-publish","approvalId":"ap-1","approvedBy":"ac000000-0000-4000-8000-000000000002","at":"2026-10-06T12:04:30.000Z"}]'), 'approve', 'ac000000-0000-4000-8000-000000000002'));
select pg_temp.ma_assert(pg_temp.ma_save((select payload from ma_state where name='r5'), 'ac000000-0000-4000-8000-000000000002', 'ma-admin@example.test')->>'revision' = '5', 'admin records an approval');
-- Approvals are append-only; only consumedAt may be added.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r5'),'approve','ac000000-0000-4000-8000-000000000001'),'{approvals}','[]'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');

-- Rollback starts (6); after that no step starts again.
insert into ma_state values ('r6', pg_temp.ma_next(jsonb_set((select payload from ma_state where name='r5'), '{rollbackStartedAt}', '"2026-10-06T12:06:00.000Z"') || '{"status":"needs_attention"}', 'rollback_started', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r6'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r6'),'started','ac000000-0000-4000-8000-000000000001'),2,'{"status":"running","attempts":1}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r6'),'resume','ac000000-0000-4000-8000-000000000001'),'{rollbackStartedAt}','"2026-10-06T13:00:00.000Z"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- Rollback cannot restore an effect, compensate an internal step, or change more than status and reason.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r6'),'rollback_step','ac000000-0000-4000-8000-000000000001'),1,'{"status":"restored"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r6'),'rollback_step','ac000000-0000-4000-8000-000000000001'),0,'{"status":"compensated"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r6'),'rollback_step','ac000000-0000-4000-8000-000000000001'),1,'{"status":"compensated","receipt":{"adapterMode":"isolated","acceptedAt":"2026-10-06T12:04:00.000Z"}}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- The accepted publish is compensated (7), the staged revision restored (8).
insert into ma_state values ('r7', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='r6'), 1, '{"status":"compensated","reason":"Unpublished."}'), 'rollback_step', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r7'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
insert into ma_state values ('r8', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='r7'), 0, '{"status":"restored","reason":"Prepared revision kept as history; never live."}'), 'rollback_step', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r8'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
-- Restored and compensated are final.
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r8'),'rollback_step','ac000000-0000-4000-8000-000000000001'),1,'{"status":"completed"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='r8'),'rollback_step','ac000000-0000-4000-8000-000000000001'),0,'{"reason":"changed"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- rolled_back only by the rollback event; then the activation is closed.
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='r8'),'outcome','ac000000-0000-4000-8000-000000000001'),'{status}','"rolled_back"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
insert into ma_state values ('r9', pg_temp.ma_next(jsonb_set((select payload from ma_state where name='r8'), '{status}', '"rolled_back"'), 'rollback', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='r9'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_next((select payload from ma_state where name='r9'),'resume','ac000000-0000-4000-8000-000000000001'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_assert(jsonb_array_length(pg_temp.ma_row('ac000000-0000-4000-8000-000000000010', 'act-1')->'history') = 9
  and pg_temp.ma_row('ac000000-0000-4000-8000-000000000010', 'act-1')->>'status' = 'rolled_back', 'nine events, rolled back');

-- Unknown outcomes: never replayed, settled only by reconcile, and they hold rollback open.
insert into ma_state values ('u0', pg_temp.ma_base('act-2', 'ac000000-0000-4000-8000-000000000010', 'ac000000-0000-4000-8000-000000000001'));
select public.create_make_real_activation('ac000000-0000-4000-8000-000000000010','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',(select payload from ma_state where name='u0'));
insert into ma_state values ('u1', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='u0'), 0, '{"status":"running","attempts":1}'), 'started', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='u1'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
insert into ma_state values ('u2', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='u1'), 0, '{"status":"unknown","effect":"unknown"}') || '{"status":"needs_attention"}', 'resume', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='u2'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='u2'),'resume','ac000000-0000-4000-8000-000000000001'),0,'{"status":"pending"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$select pg_temp.ma_save(pg_temp.ma_step(pg_temp.ma_next((select payload from ma_state where name='u2'),'resume','ac000000-0000-4000-8000-000000000001'),0,'{"status":"running"}'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
-- Rollback cannot finish over an unknown step.
insert into ma_state values ('u3', pg_temp.ma_next(jsonb_set((select payload from ma_state where name='u2'), '{rollbackStartedAt}', '"2026-10-06T12:06:00.000Z"'), 'rollback_started', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_save((select payload from ma_state where name='u3'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test');
select pg_temp.ma_expect($$select pg_temp.ma_save(jsonb_set(pg_temp.ma_next((select payload from ma_state where name='u3'),'rollback','ac000000-0000-4000-8000-000000000001'),'{status}','"rolled_back"'),'ac000000-0000-4000-8000-000000000001','ma-owner@example.test')$$, 'make_real_activation_invalid');
insert into ma_state values ('u4', pg_temp.ma_next(pg_temp.ma_step((select payload from ma_state where name='u3'), 0,
  '{"status":"failed","effect":"none","reason":"Provider confirmed nothing was written."}'), 'reconcile', 'ac000000-0000-4000-8000-000000000002'));
select pg_temp.ma_save((select payload from ma_state where name='u4'), 'ac000000-0000-4000-8000-000000000002', 'ma-admin@example.test');
insert into ma_state values ('u5', pg_temp.ma_next(jsonb_set((select payload from ma_state where name='u4'), '{status}', '"rolled_back"'), 'rollback', 'ac000000-0000-4000-8000-000000000001'));
select pg_temp.ma_assert(pg_temp.ma_save((select payload from ma_state where name='u5'), 'ac000000-0000-4000-8000-000000000001', 'ma-owner@example.test')->>'status' = 'rolled_back', 'rollback finishes after reconcile');

-- Responsibilities keep their own path: the guard ignores other saved work.
insert into public.saved_product_work(workspace_id, product_id, resource_kind, payload, created_by)
  values ('ac000000-0000-4000-8000-000000000010', 'operations', 'responsibility', '{"revision":0}', 'ac000000-0000-4000-8000-000000000001');
-- Nor can another kind of row be turned into an activation.
select pg_temp.ma_expect($$update public.saved_product_work set resource_kind = 'activation'
  where workspace_id = 'ac000000-0000-4000-8000-000000000010' and resource_kind = 'responsibility'$$, 'make_real_activation_invalid');
select pg_temp.ma_expect($$update public.saved_product_work set payload = payload || '{"status":"made_real"}'
  where workspace_id = 'ac000000-0000-4000-8000-000000000010' and resource_kind = 'activation'$$, 'make_real_activation_invalid');

-- After a completed exit, no new activation starts.
insert into public.workspace_exit_requests(workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation,
  maintained_resource_action, state, completed_at)
  values ('ac000000-0000-4000-8000-000000000013', 'ac000000-0000-4000-8000-000000000001', 'ma-exit', repeat('9', 64), 'pause', 'keep', 'stop',
    '{"status":"completed"}', now());
select pg_temp.ma_expect($$select public.create_make_real_activation('ac000000-0000-4000-8000-000000000013','ac000000-0000-4000-8000-000000000001','ma-owner@example.test',
  pg_temp.ma_base('act-x','ac000000-0000-4000-8000-000000000013','ac000000-0000-4000-8000-000000000001'))$$, 'workspace_exit_future_work_blocked');

select 'make real activation checks passed' as result;
rollback;
