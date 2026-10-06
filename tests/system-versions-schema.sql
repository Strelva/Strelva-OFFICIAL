\set ON_ERROR_STOP on
-- System Versions on fictional rows: who owns a Version, who may read and
-- change it, one account per Version, append-only history. Runs inside a
-- transaction that is rolled back. Each assertion calls a function or table
-- that does not exist before 20261007150000_system_versions.sql, so the file
-- fails against the pre-migration database.
begin;
create or replace function pg_temp.sv_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'versions assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sv_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Only service_role reaches the RPCs; helpers and tables are reachable by no one.
select pg_temp.sv_assert(
  not has_function_privilege('anon', 'public.read_system_version(uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.save_system_version(uuid,text,uuid,bigint,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_system_version(uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.publish_system_version_source_revision(uuid,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_version_access(public.system_versions,uuid,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_version_connection_owner(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.system_version_json(public.system_versions,text,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_system_version(uuid,text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.save_system_version(uuid,text,uuid,bigint,jsonb)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_business_versions(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_platform_workspace(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.set_platform_workspace(text,text,uuid)', 'EXECUTE'),
  'only service_role executes the Versions RPCs');
select pg_temp.sv_assert(
  not has_table_privilege('service_role', 'public.system_versions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.system_version_bindings', 'SELECT')
  and not has_table_privilege('service_role', 'public.system_version_source_revisions', 'INSERT')
  and not has_table_privilege('anon', 'public.platform_workspaces', 'SELECT')
  and (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.system_version_sources'::regclass, 'public.system_version_source_shares'::regclass,
    'public.system_version_source_revisions'::regclass, 'public.system_versions'::regclass,
    'public.system_version_overrides'::regclass, 'public.system_version_bindings'::regclass,
    'public.system_version_releases'::regclass, 'public.system_version_decisions'::regclass,
    'public.system_version_grants'::regclass, 'public.platform_workspaces'::regclass)),
  'Versions tables are RLS-on with no direct grants');

insert into public.users(id, email, verified_at) values
  ('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', now()),
  ('7e000000-0000-4000-8000-000000000002', 'sv-member@example.test', now()),
  ('7e000000-0000-4000-8000-000000000003', 'sv-stranger@example.test', now()),
  ('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test', now()),
  ('7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test', now()),
  ('7e000000-0000-4000-8000-000000000006', 'sv-delegate@example.test', now()),
  ('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test', now()),
  ('7e000000-0000-4000-8000-000000000008', 'sv-unassigned@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('7e000000-0000-4000-8000-000000000010', 'customer', 'Mooney Firm (fictional)', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000011', 'customer', 'Lakeside Dental (fictional)', '7e000000-0000-4000-8000-000000000007'),
  ('7e000000-0000-4000-8000-000000000020', 'agency', 'Strelva (fictional)', '7e000000-0000-4000-8000-000000000004'),
  ('7e000000-0000-4000-8000-000000000021', 'agency', 'Partner Studio', '7e000000-0000-4000-8000-000000000005'),
  ('7e000000-0000-4000-8000-000000000022', 'agency', 'Delegated Studio', '7e000000-0000-4000-8000-000000000006'),
  ('7e000000-0000-4000-8000-000000000023', 'agency', 'Unassigned Studio', '7e000000-0000-4000-8000-000000000008');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-000000000001', 'owner', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-000000000002', 'member', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-000000000011', '7e000000-0000-4000-8000-000000000007', 'owner', '7e000000-0000-4000-8000-000000000007'),
  ('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000004', 'owner', '7e000000-0000-4000-8000-000000000004'),
  ('7e000000-0000-4000-8000-000000000021', '7e000000-0000-4000-8000-000000000005', 'owner', '7e000000-0000-4000-8000-000000000005'),
  ('7e000000-0000-4000-8000-000000000022', '7e000000-0000-4000-8000-000000000006', 'owner', '7e000000-0000-4000-8000-000000000006'),
  ('7e000000-0000-4000-8000-000000000023', '7e000000-0000-4000-8000-000000000008', 'owner', '7e000000-0000-4000-8000-000000000008');

-- Mooney's work: intake (a1, assigned to the partner), bookings (a2, delegated
-- read-only to another agency).
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('7e000000-0000-4000-8000-0000000000a1', '7e000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Intake', '{}', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Bookings', '{}', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000001a1', '7e000000-0000-4000-8000-000000000010', 'operations', 'responsibility', 'Run intake',
   '{"ownerId":"7e000000-0000-4000-8000-000000000001","approvedBy":"7e000000-0000-4000-8000-000000000001","approvedAt":"2026-10-01T12:00:00Z",
     "steps":[{"id":"intake","workId":"7e000000-0000-4000-8000-0000000000a1"}]}', '7e000000-0000-4000-8000-000000000001');
insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
    assignee_workspace_id, offer_key, work_scope, status, offered_at, accepted_at, expires_at) values
  ('7e000000-0000-4000-8000-0000000001b1', '7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-0000000001a1',
   '7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', '7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test', 'agency',
   '7e000000-0000-4000-8000-000000000021', 'sv-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '7 days');
insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
    accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by) values
  ('7e000000-0000-4000-8000-0000000001c1', '7e000000-0000-4000-8000-000000000010', 'versions_agency_fixture', '1.0.0',
   '[{"id":"7e000000-0000-4000-8000-0000000000a1"}]',
   '{"kind":"provider_requested","providerKind":"agency","agencyWorkspaceId":"7e000000-0000-4000-8000-000000000021"}',
   array['operate'], array['workspace'], 'sv-install', repeat('a', 64), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001');
insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
    command_digest, requested_by, expires_at, accepted_by, accepted_at, history) values
  ('7e000000-0000-4000-8000-0000000001d1', '7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-0000000001c1',
   '7e000000-0000-4000-8000-0000000001b1', 'accepted', array['operate'], 'sv-delivery', repeat('a', 64),
   '7e000000-0000-4000-8000-000000000001', clock_timestamp() + interval '7 days', '7e000000-0000-4000-8000-000000000005', clock_timestamp(), '[]');
insert into public.workspace_delegations(customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by) values
  ('7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-0000000000a2', '7e000000-0000-4000-8000-000000000022',
   '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000006');

-- Systems: Mooney's intake and bookings (adopted from that work), Lakeside's
-- intake, and Strelva's own source in its agency workspace.
create temp table sv_ids(name text primary key, id uuid) on commit drop;
insert into sv_ids values
  ('mooney_intake', public.system_origin_id('7e000000-0000-4000-8000-000000000010', 'saved_work', '7e000000-0000-4000-8000-0000000000a1')),
  ('mooney_book', public.system_origin_id('7e000000-0000-4000-8000-000000000010', 'saved_work', '7e000000-0000-4000-8000-0000000000a2')),
  ('lakeside_intake', '7e000000-0000-4000-8000-0000000005a1'),
  ('version_intake', '7e000000-0000-4000-8000-0000000006a1'),
  ('version_book', '7e000000-0000-4000-8000-0000000006a2'),
  ('version_lakeside', '7e000000-0000-4000-8000-0000000006a3'),
  ('revision_1', '7e000000-0000-4000-8000-0000000007a1'),
  ('revision_2', '7e000000-0000-4000-8000-0000000007a2');
insert into public.systems(id, business_workspace_id, name, kind, origin_kind, origin_ref, command_id, command_digest, created_by, updated_by) values
  ((select id from sv_ids where name = 'mooney_intake'), '7e000000-0000-4000-8000-000000000010', 'Inquiries', 'inquiry', 'saved_work',
   '7e000000-0000-4000-8000-0000000000a1', gen_random_uuid(), repeat('a', 64), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001'),
  ((select id from sv_ids where name = 'mooney_book'), '7e000000-0000-4000-8000-000000000010', 'Bookings', 'booking', 'saved_work',
   '7e000000-0000-4000-8000-0000000000a2', gen_random_uuid(), repeat('a', 64), '7e000000-0000-4000-8000-000000000001', '7e000000-0000-4000-8000-000000000001'),
  ((select id from sv_ids where name = 'lakeside_intake'), '7e000000-0000-4000-8000-000000000011', 'Inquiries', 'inquiry', null, null,
   gen_random_uuid(), repeat('a', 64), '7e000000-0000-4000-8000-000000000007', '7e000000-0000-4000-8000-000000000007');

-- Strelva makes its own source in its agency workspace. Nobody else can.
select pg_temp.sv_expect($$select public.create_system_version_source('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000003','sv-stranger@example.test','{"name":"Inquiry intake","kind":"inquiry"}','7e000000-0000-4000-8000-0000000008a1',repeat('1',64))$$, 'business_record_access_denied');
select pg_temp.sv_expect($$select public.create_system_version_source('7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000005','sv-partner@example.test','{"name":"Inquiry intake","kind":"inquiry"}','7e000000-0000-4000-8000-0000000008a1',repeat('1',64))$$, 'business_record_access_denied');
insert into sv_ids select 'source', (public.create_system_version_source('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000004',
  'sv-strelva@example.test', '{"name":"Inquiry intake","kind":"inquiry"}', '7e000000-0000-4000-8000-0000000008a1', repeat('1', 64))->'system'->>'id')::uuid;
select pg_temp.sv_assert((public.create_system_version_source('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000004',
  'sv-strelva@example.test', '{"name":"Inquiry intake","kind":"inquiry"}', '7e000000-0000-4000-8000-0000000008a1', repeat('1', 64))->'system'->>'id')::uuid
  = (select id from sv_ids where name = 'source'), 'creating a source replays by command id');

create or replace function pg_temp.sv_revision(n integer, rid uuid, definition jsonb) returns jsonb language sql as $$
  select jsonb_build_object('source', jsonb_build_object('businessId', '7e000000-0000-4000-8000-000000000020', 'systemId', (select id from sv_ids where name = 'source'),
    'revisionId', rid, 'number', n), 'summary', 'Intake ' || n, 'definition', definition,
    'requires', jsonb_build_object('bindingKinds', '[]'::jsonb), 'publishedBy', '7e000000-0000-4000-8000-000000000004', 'publishedAt', '2026-10-07T12:00:00.000Z')
$$;
select public.publish_system_version_source_revision('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test',
  pg_temp.sv_revision(1, (select id from sv_ids where name = 'revision_1'), '{"followUp":{"message":"We will call you back soon."},"routing":{"minutes":30}}'));
-- Revisions are append-only: the same number again, an edit or a delete is refused.
select pg_temp.sv_expect(format($$select public.publish_system_version_source_revision('7e000000-0000-4000-8000-000000000004','sv-strelva@example.test',%L)$$,
  pg_temp.sv_revision(1, gen_random_uuid(), '{"other":true}')), 'system_version_revision_exists');
select pg_temp.sv_expect($$update public.system_version_source_revisions set summary = 'changed'$$, 'system_version_history_immutable');
select pg_temp.sv_expect($$delete from public.system_version_source_revisions$$, 'system_version_history_immutable');
select pg_temp.sv_expect(format($$select public.publish_system_version_source_revision('7e000000-0000-4000-8000-000000000001','sv-owner@example.test',%L)$$,
  pg_temp.sv_revision(2, gen_random_uuid(), '{"other":true}')), 'business_record_access_denied');

-- Not shared yet: Mooney cannot read the source or base a Version on it.
select pg_temp.sv_assert(public.read_system_version_source('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000001',
  'sv-owner@example.test', (select id from sv_ids where name = 'source')) is null, 'an unshared source is invisible');
select pg_temp.sv_assert(jsonb_array_length(public.read_system_version_source_revisions('7e000000-0000-4000-8000-000000000020',
  '7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'source'), null)) = 0, 'unshared revisions are invisible');
create or replace function pg_temp.sv_lineage(vid uuid, business uuid, sys uuid, actor uuid, label text) returns jsonb language sql as $$
  select jsonb_build_object('id', vid, 'version', jsonb_build_object('businessId', business, 'systemId', sys),
    'source', jsonb_build_object('businessId', '7e000000-0000-4000-8000-000000000020', 'systemId', (select id from sv_ids where name = 'source')),
    'context', jsonb_build_object('kind', 'agency_client', 'label', label),
    'baseline', jsonb_build_object('revision', 1, 'definition', '{"followUp":{"message":"We will call you back soon."},"routing":{"minutes":30}}'::jsonb),
    'overrides', '[]'::jsonb, 'bindings', '[]'::jsonb, 'localData', '{}'::jsonb, 'releases', '[]'::jsonb, 'currentRelease', null,
    'decisions', '[]'::jsonb, 'grants', '[]'::jsonb, 'rowRevision', 1, 'createdBy', actor,
    'createdAt', '2026-10-07T12:00:00.000Z', 'updatedAt', '2026-10-07T12:00:00.000Z')
$$;
select pg_temp.sv_expect(format($$select public.create_system_version('7e000000-0000-4000-8000-000000000001','sv-owner@example.test',%L)$$,
  pg_temp.sv_lineage((select id from sv_ids where name = 'version_intake'), '7e000000-0000-4000-8000-000000000010',
    (select id from sv_ids where name = 'mooney_intake'), '7e000000-0000-4000-8000-000000000001', 'Mooney')), 'business_record_access_denied');
select public.put_system_version_source('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test',
  (select id from sv_ids where name = 'source'), array['7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-000000000011']::uuid[]);
select pg_temp.sv_assert(public.read_system_version_source('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000001',
  'sv-owner@example.test', (select id from sv_ids where name = 'source'))->'sharedWith' = '["7e000000-0000-4000-8000-000000000010"]'::jsonb,
  'a grantee sees only its own share');

-- The Version is owned by the descendant business, made by its owner.
select public.create_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test',
  pg_temp.sv_lineage((select id from sv_ids where name = 'version_intake'), '7e000000-0000-4000-8000-000000000010',
    (select id from sv_ids where name = 'mooney_intake'), '7e000000-0000-4000-8000-000000000001', 'Mooney'));
select public.create_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test',
  pg_temp.sv_lineage((select id from sv_ids where name = 'version_book'), '7e000000-0000-4000-8000-000000000010',
    (select id from sv_ids where name = 'mooney_book'), '7e000000-0000-4000-8000-000000000001', 'Mooney bookings'));
select public.create_system_version('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test',
  pg_temp.sv_lineage((select id from sv_ids where name = 'version_lakeside'), '7e000000-0000-4000-8000-000000000011',
    (select id from sv_ids where name = 'lakeside_intake'), '7e000000-0000-4000-8000-000000000007', 'Lakeside'));
select pg_temp.sv_assert((select business_workspace_id from public.system_versions where id = (select id from sv_ids where name = 'version_intake'))
  = '7e000000-0000-4000-8000-000000000010', 'the Version belongs to the descendant business');
-- Copying anything but the definition is refused, as is a forged baseline.
select pg_temp.sv_expect(format($$select public.create_system_version('7e000000-0000-4000-8000-000000000007','sv-lakeside@example.test',%L)$$,
  jsonb_set(pg_temp.sv_lineage(gen_random_uuid(), '7e000000-0000-4000-8000-000000000011', (select id from sv_ids where name = 'lakeside_intake'),
    '7e000000-0000-4000-8000-000000000007', 'Again'), '{baseline,definition}', '{"forged":true}')), 'system_version_input_invalid');
-- Another business cannot create a Version on Mooney's System.
select pg_temp.sv_expect(format($$select public.create_system_version('7e000000-0000-4000-8000-000000000007','sv-lakeside@example.test',%L)$$,
  pg_temp.sv_lineage(gen_random_uuid(), '7e000000-0000-4000-8000-000000000010', (select id from sv_ids where name = 'mooney_book'),
    '7e000000-0000-4000-8000-000000000007', 'Taken')), 'business_record_access_denied');

-- Being the source author grants nothing: Strelva (no membership here) reads nothing.
select pg_temp.sv_assert(public.read_system_version('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test',
  (select id from sv_ids where name = 'version_intake')) is null, 'source author without a grant is refused');
select pg_temp.sv_assert(public.read_system_version('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test',
  (select id from sv_ids where name = 'version_intake')) is null, 'a sibling client cannot read another client''s Version');
select pg_temp.sv_assert(public.read_system_version('7e000000-0000-4000-8000-000000000003', 'sv-stranger@example.test',
  (select id from sv_ids where name = 'version_intake')) is null, 'a stranger reads nothing');

-- A partner agency with an accepted assignment reads and changes only that work's Version.
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test', (select id from sv_ids where name = 'version_intake'));
  perform pg_temp.sv_assert(v is not null, 'assigned partner reads its assigned Version');
  v := public.save_system_version('7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test', (select id from sv_ids where name = 'version_intake'), 1,
    jsonb_set(v, '{overrides}', '[{"path":"routing.minutes","value":10,"setBy":"7e000000-0000-4000-8000-000000000005","setAt":"2026-10-07T12:01:00.000Z"}]'));
  perform pg_temp.sv_assert((v->>'rowRevision')::int = 2 and v->'overrides'->0->>'path' = 'routing.minutes', 'assigned partner sets an override');
  perform pg_temp.sv_assert(public.read_system_version('7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test',
    (select id from sv_ids where name = 'version_book')) is null, 'assigned partner cannot read unassigned work''s Version');
  -- An agency with no assignment or delegation is refused like a stranger.
  perform pg_temp.sv_assert(public.read_system_version('7e000000-0000-4000-8000-000000000008', 'sv-unassigned@example.test',
    (select id from sv_ids where name = 'version_intake')) is null, 'agency without assignment is refused');
end $$;

-- A delegated agency reads the delegated work's Version and cannot change it.
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000006', 'sv-delegate@example.test', (select id from sv_ids where name = 'version_book'));
  perform pg_temp.sv_assert(v is not null, 'delegated agency reads the delegated Version');
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000006','sv-delegate@example.test',%L,1,%L)$q$,
    (select id from sv_ids where name = 'version_book'), jsonb_set(v, '{localData}', '{"x":1}')), 'business_record_access_denied');
end $$;

-- A member changes only local data.
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000002', 'sv-member@example.test', (select id from sv_ids where name = 'version_book'));
  v := public.save_system_version('7e000000-0000-4000-8000-000000000002', 'sv-member@example.test', (select id from sv_ids where name = 'version_book'), 1,
    jsonb_set(v, '{localData}', '{"chairs":4}'));
  perform pg_temp.sv_assert(v->'localData' = '{"chairs":4}', 'member saves local data');
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000002','sv-member@example.test',%L,2,%L)$q$,
    (select id from sv_ids where name = 'version_book'), jsonb_set(v, '{overrides}', '[{"path":"routing.minutes","value":1,"setBy":"7e000000-0000-4000-8000-000000000002","setAt":"2026-10-07T12:02:00.000Z"}]')),
    'business_record_access_denied');
  -- A stale row revision is refused.
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000002','sv-member@example.test',%L,1,%L)$q$,
    (select id from sv_ids where name = 'version_book'), v), 'system_version_stale');
end $$;

-- One account binds one Version, even inside one business; another business's account never binds.
insert into public.workspace_calendar_connections(id, workspace_id, provider, calendar_id, calendar_name, time_zone, status, created_by) values
  ('7e000000-0000-4000-8000-0000000009c1', '7e000000-0000-4000-8000-000000000010', 'google', 'primary', 'Mooney', 'America/New_York', 'connected', '7e000000-0000-4000-8000-000000000001'),
  ('7e000000-0000-4000-8000-0000000009c2', '7e000000-0000-4000-8000-000000000011', 'google', 'primary', 'Lakeside', 'America/New_York', 'connected', '7e000000-0000-4000-8000-000000000007');
do $$ declare v jsonb; b jsonb; begin
  b := '[{"kind":"booking_calendar","connectionId":"calendar:7e000000-0000-4000-8000-0000000009c1","ownerBusinessId":"7e000000-0000-4000-8000-000000000010","boundBy":"7e000000-0000-4000-8000-000000000001","boundAt":"2026-10-07T12:03:00.000Z"}]';
  v := public.read_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'));
  v := public.save_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'), 2, jsonb_set(v, '{bindings}', b));
  perform pg_temp.sv_assert(jsonb_array_length(v->'bindings') = 1, 'owner binds its own calendar');
  v := public.read_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_book'));
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000001','sv-owner@example.test',%L,2,%L)$q$,
    (select id from sv_ids where name = 'version_book'), jsonb_set(v, '{bindings}', b)), 'system_version_binding_taken');
  v := public.read_system_version('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test', (select id from sv_ids where name = 'version_lakeside'));
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000007','sv-lakeside@example.test',%L,1,%L)$q$,
    (select id from sv_ids where name = 'version_lakeside'), jsonb_set(v, '{bindings}', b)), 'system_version_binding_foreign');
  perform pg_temp.sv_assert(public.read_system_version_connection_owner('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test',
    'calendar:7e000000-0000-4000-8000-0000000009c1') is null, 'another business learns nothing about a connection');
  perform pg_temp.sv_assert(public.system_version_connection_holder('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test',
    'calendar:7e000000-0000-4000-8000-0000000009c1') = 'elsewhere', 'a holder in another business is not named');
end $$;

-- A grant shows lineage to the source author without bindings.
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'));
  v := public.save_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'), 3,
    jsonb_set(v, '{grants}', '[{"granteeBusinessId":"7e000000-0000-4000-8000-000000000020","scope":"lineage","grantedBy":"7e000000-0000-4000-8000-000000000001","grantedAt":"2026-10-07T12:04:00.000Z"}]'));
  v := public.read_system_version('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test', (select id from sv_ids where name = 'version_intake'));
  perform pg_temp.sv_assert(v is not null and v->'bindings' = '[]' and v->'localData' = '{}', 'lineage grant hides bindings and data');
  -- A grantee never writes.
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000004','sv-strelva@example.test',%L,4,%L)$q$,
    (select id from sv_ids where name = 'version_intake'), v), 'business_record_access_denied');
  -- Granting someone else's grant away, or erasing it, is refused.
  v := public.read_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'));
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000001','sv-owner@example.test',%L,4,%L)$q$,
    (select id from sv_ids where name = 'version_intake'), jsonb_set(v, '{grants}', '[]')), 'system_version_history_immutable');
end $$;

-- A release records a spine revision and moves the System's pointer; releases never change after.
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'));
  v := public.save_system_version('7e000000-0000-4000-8000-000000000001', 'sv-owner@example.test', (select id from sv_ids where name = 'version_intake'), 4,
    jsonb_set(jsonb_set(v, '{releases}', jsonb_build_array(jsonb_build_object('number', 1, 'definition', '{"followUp":{"message":"We will call you back soon."},"routing":{"minutes":10}}'::jsonb,
      'baselineRevision', 1, 'overridePaths', '["routing.minutes"]'::jsonb, 'releasedBy', '7e000000-0000-4000-8000-000000000001', 'releasedAt', '2026-10-07T12:05:00.000Z'))),
      '{currentRelease}', '1'));
  perform pg_temp.sv_assert((select current_revision_number from public.systems where id = (select id from sv_ids where name = 'mooney_intake')) = 1
    and (select implementation->>'kind' from public.system_revisions where system_id = (select id from sv_ids where name = 'mooney_intake')) = 'system_version_release',
    'a release is a spine revision and the current pointer');
  perform pg_temp.sv_expect($q$update public.system_version_releases set baseline_revision = 2$q$, 'system_version_history_immutable');
  -- Releasing as another user is refused.
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000001','sv-owner@example.test',%L,5,%L)$q$,
    (select id from sv_ids where name = 'version_intake'), jsonb_set(v, '{releases}', (v->'releases') || jsonb_build_array(jsonb_build_object('number', 2,
      'definition', '{"x":1}'::jsonb, 'baselineRevision', 1, 'overridePaths', '[]'::jsonb, 'releasedBy', '7e000000-0000-4000-8000-000000000005', 'releasedAt', '2026-10-07T12:06:00.000Z')))),
    'system_version_input_invalid');
end $$;

-- Baselines move forward only, to a published revision's exact definition.
select public.publish_system_version_source_revision('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test',
  pg_temp.sv_revision(2, (select id from sv_ids where name = 'revision_2'), '{"followUp":{"message":"Within one business day."},"routing":{"minutes":30}}'));
do $$ declare v jsonb; begin
  v := public.read_system_version('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test', (select id from sv_ids where name = 'version_lakeside'));
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000007','sv-lakeside@example.test',%L,1,%L)$q$,
    (select id from sv_ids where name = 'version_lakeside'), jsonb_set(v, '{baseline}', '{"revision":2,"definition":{"forged":true}}')), 'system_version_input_invalid');
  v := public.save_system_version('7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test', (select id from sv_ids where name = 'version_lakeside'), 1,
    jsonb_set(v, '{baseline}', '{"revision":2,"definition":{"followUp":{"message":"Within one business day."},"routing":{"minutes":30}}}'));
  perform pg_temp.sv_assert((v->'baseline'->>'revision')::int = 2, 'adoption moves the baseline forward');
  perform pg_temp.sv_expect(format($q$select public.save_system_version('7e000000-0000-4000-8000-000000000007','sv-lakeside@example.test',%L,2,%L)$q$,
    (select id from sv_ids where name = 'version_lakeside'), jsonb_set(v, '{baseline}', '{"revision":1,"definition":{"followUp":{"message":"We will call you back soon."},"routing":{"minutes":30}}}')),
    'system_version_baseline_backward');
end $$;

-- The workspace view: Versions in scope, and a hidden same-business source never listed.
select public.create_system_version_source('7e000000-0000-4000-8000-000000000011', '7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test',
  '{"name":"Lakeside website","kind":"website","hidden":true}', '7e000000-0000-4000-8000-0000000008b1', repeat('2', 64));
do $$ declare b jsonb; begin
  b := public.read_business_versions('7e000000-0000-4000-8000-000000000011', '7e000000-0000-4000-8000-000000000007', 'sv-lakeside@example.test');
  perform pg_temp.sv_assert(jsonb_array_length(b->'hiddenSources') = 1, 'the hidden source is named so it is not listed');
  perform pg_temp.sv_assert(b->'versions'->0->>'latestRevision' = '2' and b->'versions'->0->>'baselineRevision' = '2', 'versions carry baseline and latest');
  b := public.read_business_versions('7e000000-0000-4000-8000-000000000010', '7e000000-0000-4000-8000-000000000005', 'sv-partner@example.test');
  perform pg_temp.sv_assert(jsonb_array_length(b->'versions') = 1, 'an agency sees only the Versions of its work');
end $$;
select pg_temp.sv_expect($$select public.read_business_versions('7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000003','sv-stranger@example.test')$$, 'business_record_access_denied');

-- The Library: Strelva lists its sources and only the Versions it may read.
do $$ declare l jsonb; begin
  l := public.read_workspace_version_sources('7e000000-0000-4000-8000-000000000020', '7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test');
  perform pg_temp.sv_assert(jsonb_array_length(l->'sources') = 1 and jsonb_array_length(l->'sources'->0->'revisions') = 2, 'library lists the source and revisions');
  perform pg_temp.sv_assert(jsonb_array_length(l->'sources'->0->'versions') = 1
    and l->'sources'->0->'versions'->0->>'access' = 'lineage', 'library shows only the granted Version');
end $$;
select pg_temp.sv_expect($$select public.read_workspace_version_sources('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000001','sv-owner@example.test')$$, 'business_record_access_denied');

-- Strelva's agency workspace is a row an operator sets, not a string.
select pg_temp.sv_assert(public.read_platform_workspace('strelva_agency') is null, 'no Strelva agency until an operator names one');
select pg_temp.sv_expect($$select public.set_platform_workspace('sv-owner@example.test','strelva_agency','7e000000-0000-4000-8000-000000000020')$$, 'tenant_conversion_operator_required');
insert into public.super_admins(user_id, email) values ('7e000000-0000-4000-8000-000000000004', 'sv-strelva@example.test');
select pg_temp.sv_expect($$select public.set_platform_workspace('sv-strelva@example.test','strelva_agency','7e000000-0000-4000-8000-000000000010')$$, 'platform_workspace_not_agency');
select public.set_platform_workspace('sv-strelva@example.test', 'strelva_agency', '7e000000-0000-4000-8000-000000000020');
select pg_temp.sv_assert(public.read_platform_workspace('strelva_agency') = '7e000000-0000-4000-8000-000000000020', 'operator names Strelva''s agency');

\echo 'system versions checks passed'
rollback;
