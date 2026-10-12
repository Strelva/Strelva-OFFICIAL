\set ON_ERROR_STOP on
-- Make real live (20261008131000_make_real_live.sql) on fictional rows:
-- channel flag keys, the due-work resume list and the Ready read for Needs you.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ml_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'make real live assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ml_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ml_activation(p_id text, p_workspace text, p_actor text) returns jsonb language sql as $$
  select jsonb_build_object(
    'version', 1, 'id', p_id, 'businessId', p_workspace, 'possibilityId', 'poss-1', 'candidateRevision', 1,
    'actorId', p_actor, 'status', 'in_progress', 'revision', 0,
    'pinned', '[]'::jsonb, 'introduced', '[]'::jsonb, 'connections', '[]'::jsonb, 'approvals', '[]'::jsonb, 'checks', '[]'::jsonb,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 's1', 'kind', 'effect', 'target', 'fx-publish', 'label', 'Publish', 'dependsOn', '[]'::jsonb,
        'effectKind', 'publish', 'reversibility', 'compensable', 'idempotencyKey', 'k-s1', 'status', 'pending', 'effect', 'none', 'attempts', 0)),
    'createdAt', '2026-10-06T12:00:00.000Z', 'updatedAt', '2026-10-06T12:00:00.000Z', 'history', '[]'::jsonb)
$$;

select pg_temp.ml_assert(
  not has_function_privilege('anon', 'public.due_make_real_activations(integer,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_ready_system_possibilities(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.due_make_real_activations(integer,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_ready_system_possibilities(uuid)', 'EXECUTE'),
  'only service_role executes the live Make real reads');

-- One flag key per live channel; every existing key is kept.
select pg_temp.ml_assert(public.workspace_release_flag_names() @> array['owner_entry','inquiries','website_rebuild','systems',
  'make_real_live:hosted_website','make_real_live:tenant_content','make_real_live:inquiry_form','make_real_live:booking_page','make_real_live:internal_app'],
  'flag names include each channel');

insert into public.users(id, email, verified_at) values
  ('7a000000-0000-4000-8000-000000000001', 'ml-owner@example.test', now()),
  ('7a000000-0000-4000-8000-000000000002', 'ml-admin@example.test', now()),
  ('7a000000-0000-4000-8000-000000000003', 'ml-other@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('7a000000-0000-4000-8000-000000000010', 'customer', 'Live Make real', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000011', 'customer', 'Other', '7a000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'owner', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000002', 'admin', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000003', 'owner', '7a000000-0000-4000-8000-000000000003');

-- A channel key is a valid flag row; anything else is not.
insert into public.workspace_release_flags(workspace_id, flag, state, changed_by) values
  ('7a000000-0000-4000-8000-000000000010', 'make_real_live:hosted_website', 'on', '7a000000-0000-4000-8000-000000000001');
select pg_temp.ml_expect($$insert into public.workspace_release_flags(workspace_id, flag, state, changed_by) values
  ('7a000000-0000-4000-8000-000000000010', 'make_real_live:payments', 'on', '7a000000-0000-4000-8000-000000000001')$$, '%check constraint%');

-- Activations: three by the owner, one by the admin who is later demoted.
select public.create_make_real_activation('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'ml-owner@example.test',
  pg_temp.ml_activation('act-due', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001'));
select public.create_make_real_activation('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'ml-owner@example.test',
  pg_temp.ml_activation('act-running', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001'));
select public.create_make_real_activation('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'ml-owner@example.test',
  pg_temp.ml_activation('act-attention', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001'));
select public.create_make_real_activation('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000002', 'ml-admin@example.test',
  pg_temp.ml_activation('act-demoted', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000002'));
select public.create_make_real_activation('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000003', 'ml-other@example.test',
  pg_temp.ml_activation('act-stale-running', '7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000003'));
-- Fixture states written directly, as the runner would leave them.
set local strelva.make_real_activation_write = 'on';
update public.saved_product_work set payload = jsonb_set(payload, '{steps,0}', payload->'steps'->0
    || jsonb_build_object('status', 'running', 'leaseId', 'l1', 'startedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
  where resource_kind = 'activation' and payload->>'id' = 'act-running';
update public.saved_product_work set payload = jsonb_set(payload, '{steps,0}', payload->'steps'->0
    || jsonb_build_object('status', 'running', 'leaseId', 'l2', 'startedAt', '2026-10-01T00:00:00.000Z'))
  where resource_kind = 'activation' and payload->>'id' = 'act-stale-running';
update public.saved_product_work set payload = payload || '{"status":"needs_attention"}'
  where resource_kind = 'activation' and payload->>'id' = 'act-attention';
reset strelva.make_real_activation_write;
update public.workspace_memberships set role = 'member'
  where workspace_id = '7a000000-0000-4000-8000-000000000010' and user_id = '7a000000-0000-4000-8000-000000000002';

do $$
declare due jsonb := public.due_make_real_activations(50, 120);
begin
  perform pg_temp.ml_assert((select array_agg(x->>'activationId' order by x->>'activationId') from jsonb_array_elements(due) x)
    = array['act-due', 'act-stale-running'], 'due: in progress, no fresh running step, starter still owner or admin');
  perform pg_temp.ml_assert((select x->>'email' from jsonb_array_elements(due) x where x->>'activationId' = 'act-due') = 'ml-owner@example.test'
    and (select x->>'userId' from jsonb_array_elements(due) x where x->>'activationId' = 'act-due') = '7a000000-0000-4000-8000-000000000001',
    'the resume runs as the verified starter');
  perform pg_temp.ml_assert(jsonb_array_length(public.due_make_real_activations(1, 120)) = 1, 'the limit holds');
  perform pg_temp.ml_assert(jsonb_array_length(public.due_make_real_activations(50, 0)) = 3, 'with no grace a running step is due for reconciliation');
end $$;
select pg_temp.ml_expect($$select public.due_make_real_activations(0, 120)$$, 'make_real_activation_invalid');

-- Ready possibilities, read without an actor, only for the named business.
insert into public.system_possibilities(id, business_workspace_id, status, revision, candidate_revision, body, created_by, activation_id) values
  ('7a000000-0000-4000-8000-0000000003a1', '7a000000-0000-4000-8000-000000000010', 'ready', 2, 1,
   '{"id":"7a000000-0000-4000-8000-0000000003a1","title":"Ready"}', '7a000000-0000-4000-8000-000000000001', null),
  ('7a000000-0000-4000-8000-0000000003a2', '7a000000-0000-4000-8000-000000000010', 'ready', 3, 1,
   '{"id":"7a000000-0000-4000-8000-0000000003a2","title":"Being made real"}', '7a000000-0000-4000-8000-000000000001', 'act-due'),
  ('7a000000-0000-4000-8000-0000000003a3', '7a000000-0000-4000-8000-000000000010', 'exploring', 1, 1,
   '{"id":"7a000000-0000-4000-8000-0000000003a3","title":"Exploring"}', '7a000000-0000-4000-8000-000000000001', null),
  ('7a000000-0000-4000-8000-0000000003a4', '7a000000-0000-4000-8000-000000000011', 'ready', 2, 1,
   '{"id":"7a000000-0000-4000-8000-0000000003a4","title":"Other business"}', '7a000000-0000-4000-8000-000000000003', null);
select pg_temp.ml_assert((select array_agg(x->'possibility'->>'title') from jsonb_array_elements(public.read_ready_system_possibilities('7a000000-0000-4000-8000-000000000010')) x)
  = array['Ready'], 'only Ready possibilities not being made real, in the named business');
select pg_temp.ml_assert((select x->'systems' from jsonb_array_elements(public.read_ready_system_possibilities('7a000000-0000-4000-8000-000000000010')) x)
  = '[]'::jsonb, 'pinned System names come with each possibility');

rollback;
\echo 'Make real live schema checks passed.'
