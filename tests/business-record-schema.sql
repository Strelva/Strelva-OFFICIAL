\set ON_ERROR_STOP on
-- Business record behavior on fictional rows. Runs inside a transaction that
-- is rolled back, so the cluster is left as it was found.
begin;
create or replace function pg_temp.br_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business record assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.br_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Only the actor-checked RPCs are reachable, and only by the service role.
select pg_temp.br_assert(
  not has_function_privilege('anon', 'public.read_business_record(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_business_record(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.patch_business_record(uuid,uuid,text,text,bigint,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.patch_business_record(uuid,uuid,text,text,bigint,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.undo_business_record_revision(uuid,uuid,text,text,bigint,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.upsert_business_contacts(uuid,uuid,text,text,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_business_owner_recipient(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.business_record_apply(uuid,uuid,text,text,jsonb,jsonb,bigint,uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.business_record_entity_write(uuid,text,text,jsonb,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_business_record(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.patch_business_record(uuid,uuid,text,text,bigint,jsonb,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.convert_tenant_to_business(text,text,jsonb,uuid,text)', 'EXECUTE'),
  'only service_role executes the business record RPCs');
select pg_temp.br_assert(
  not has_table_privilege('service_role', 'public.business_records', 'SELECT')
  and not has_table_privilege('service_role', 'public.business_contacts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.business_record_facts', 'SELECT')
  and not has_table_privilege('anon', 'public.tenant_workspace_links', 'SELECT')
  and (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.business_records'::regclass, 'public.business_record_facts'::regclass, 'public.business_services'::regclass,
    'public.business_people'::regclass, 'public.business_contacts'::regclass, 'public.business_record_revisions'::regclass,
    'public.tenant_workspace_links'::regclass)),
  'tables are RLS-on with no direct grants');

insert into public.users(id, email, verified_at) values
  ('be000000-0000-4000-8000-000000000001', 'br-owner@example.test', now()),
  ('be000000-0000-4000-8000-000000000002', 'br-member@example.test', now()),
  ('be000000-0000-4000-8000-000000000003', 'br-stranger@example.test', now()),
  ('be000000-0000-4000-8000-000000000004', 'br-other-owner@example.test', now()),
  ('be000000-0000-4000-8000-000000000005', 'br-agency@example.test', now()),
  ('be000000-0000-4000-8000-000000000006', 'br-unverified@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('be000000-0000-4000-8000-000000000010', 'customer', 'Juniper Bakery', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000011', 'customer', 'Other Business', 'be000000-0000-4000-8000-000000000004'),
  ('be000000-0000-4000-8000-000000000012', 'personal', 'Personal', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000013', 'customer', 'Exited Business', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000014', 'agency', 'Fictional Agency', 'be000000-0000-4000-8000-000000000005'),
  ('be000000-0000-4000-8000-000000000015', 'customer', 'Disposable Business', 'be000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'owner', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000002', 'member', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000011', 'be000000-0000-4000-8000-000000000004', 'owner', 'be000000-0000-4000-8000-000000000004'),
  ('be000000-0000-4000-8000-000000000012', 'be000000-0000-4000-8000-000000000001', 'owner', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000013', 'be000000-0000-4000-8000-000000000001', 'owner', 'be000000-0000-4000-8000-000000000001'),
  ('be000000-0000-4000-8000-000000000014', 'be000000-0000-4000-8000-000000000005', 'owner', 'be000000-0000-4000-8000-000000000005'),
  ('be000000-0000-4000-8000-000000000015', 'be000000-0000-4000-8000-000000000001', 'owner', 'be000000-0000-4000-8000-000000000001');

-- An empty record reads as revision 0 for any member.
select pg_temp.br_assert((public.read_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000002', 'br-member@example.test')->>'revision') = '0', 'member reads an empty record');
select pg_temp.br_assert((public.read_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'BR-Owner@example.test ')->>'access') = 'owner', 'owner access reported');

-- Non-members, other businesses, unverified identities and personal workspaces are refused.
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000003','br-stranger@example.test')$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000004','br-other-owner@example.test')$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_record_history('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000004','br-other-owner@example.test',10)$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_contacts('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000004','br-other-owner@example.test',10)$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000004','br-other-owner@example.test','owner',0,'{"facts":{"phone":{"value":"716-555-0100"}}}','be000000-0000-4000-8000-0000000000f0',repeat('0',64))$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.upsert_business_contacts('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000004','br-other-owner@example.test','inquiries','[{"email":"x@example.test","source":"inquiry"}]','be000000-0000-4000-8000-0000000000f1',repeat('0',64))$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000006','br-unverified@example.test')$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000012','be000000-0000-4000-8000-000000000001','br-owner@example.test')$$, 'business_record_access_denied');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-member@example.test')$$, 'business_record_access_denied');
-- A plain member reads but cannot write.
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000002','br-member@example.test','owner',0,'{"facts":{"phone":{"value":"716-555-0100"}}}','be000000-0000-4000-8000-0000000000f2',repeat('0',64))$$, 'business_record_access_denied');

-- The owner writes facts, a service and a person in one revision.
create temporary table br_first(value jsonb);
insert into br_first select public.patch_business_record(
  'be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 0,
  jsonb_build_object(
    'facts', jsonb_build_object(
      'display_name', jsonb_build_object('value', 'Juniper Bakery', 'verified', true),
      'phone', jsonb_build_object('value', '716-555-0100'),
      'owner_recipient', jsonb_build_object('value', jsonb_build_object('email', 'br-owner@example.test', 'name', 'Juniper Owner')),
      'hours', jsonb_build_object('value', jsonb_build_object('timezone', 'America/New_York',
        'weekly', jsonb_build_array(jsonb_build_object('day', 2, 'opens', '08:00', 'closes', '15:00')),
        'overrides', jsonb_build_array(jsonb_build_object('date', '2026-12-25', 'closed', true, 'label', 'Closed for Christmas')))),
      'links', jsonb_build_object('value', jsonb_build_array(jsonb_build_object('kind', 'website', 'url', 'https://juniper.example.test/')))),
    'services', jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', 'Custom cake', 'durationMinutes', 30, 'priceText', 'From $40')),
    'people', jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', 'Sam Baker', 'roleTitle', 'Head baker', 'userId', 'be000000-0000-4000-8000-000000000002'))),
  'be000000-0000-4000-8000-000000000020', repeat('a', 64));
select pg_temp.br_assert((select value->>'revision' from br_first) = '1' and (select value->>'sequence' from br_first) = '1' and (select value->>'changeCount' from br_first) = '7', 'first patch is revision 1 with seven changes');
select pg_temp.br_assert((select source = 'owner' and verified from public.business_record_facts where workspace_id = 'be000000-0000-4000-8000-000000000010' and fact_key = 'display_name'), 'owner-verified provenance stored');
select pg_temp.br_assert((select not verified from public.business_record_facts where workspace_id = 'be000000-0000-4000-8000-000000000010' and fact_key = 'phone'), 'verified defaults to false');
select pg_temp.br_assert((public.read_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000002', 'br-member@example.test')#>>'{services,0,name}') = 'Custom cake', 'member reads the service');

-- Exact retry replays; same command with a different body conflicts.
select pg_temp.br_assert(public.patch_business_record(
  'be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 0,
  '{"facts":{"phone":{"value":"716-555-0100"}}}', 'be000000-0000-4000-8000-000000000020', repeat('a', 64))
  = (select value from br_first) || '{"replayed":true}'::jsonb, 'retry with same command returns the same result');
select pg_temp.br_assert((select count(*) from public.business_record_revisions where workspace_id = 'be000000-0000-4000-8000-000000000010') = 1, 'retry wrote no second revision');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',1,'{"facts":{"phone":{"value":"716-555-0101"}}}','be000000-0000-4000-8000-000000000020',repeat('b',64))$$, 'business_record_idempotency_conflict');

-- A stale revision is rejected.
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',0,'{"facts":{"phone":{"value":"716-555-0101"}}}','be000000-0000-4000-8000-000000000021',repeat('c',64))$$, 'business_record_revision_conflict');

-- Validation and provenance rules.
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',1,'{"facts":{"hours":{"value":{"timezone":"America/New_York","weekly":[{"day":2,"opens":"18:00","closes":"08:00"}]}}}}','be000000-0000-4000-8000-000000000022',repeat('d',64))$$, 'business_record_patch_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',1,'{"facts":{"favorite_color":{"value":"blue"}}}','be000000-0000-4000-8000-000000000023',repeat('d',64))$$, 'business_record_patch_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','bookings',1,'{"facts":{"phone":{"value":"716-555-0101","verified":true}}}','be000000-0000-4000-8000-000000000024',repeat('d',64))$$, 'business_record_patch_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','tenant_import',1,'{"facts":{"phone":{"value":"716-555-0101"}}}','be000000-0000-4000-8000-000000000025',repeat('d',64))$$, 'business_record_source_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','operator',1,'{"facts":{"phone":{"value":"716-555-0101"}}}','be000000-0000-4000-8000-000000000026',repeat('d',64))$$, 'business_record_source_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',1,'{"people":[{"op":"upsert","name":"Outsider","userId":"be000000-0000-4000-8000-000000000003"}]}','be000000-0000-4000-8000-000000000027',repeat('d',64))$$, 'business_record_patch_invalid');
select pg_temp.br_assert((select revision from public.business_records where workspace_id = 'be000000-0000-4000-8000-000000000010') = 1, 'rejected patches left the record untouched');

-- Change the phone, then undo it: the previous value and provenance return.
select public.patch_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'bookings', 1,
  '{"facts":{"phone":{"value":"716-555-0101"},"description":{"value":"Cakes to order."}}}', 'be000000-0000-4000-8000-000000000028', repeat('e', 64));
select pg_temp.br_assert((select value #>> '{}' from public.business_record_facts where workspace_id = 'be000000-0000-4000-8000-000000000010' and fact_key = 'phone') = '716-555-0101', 'phone changed');
select pg_temp.br_assert((public.undo_business_record_revision('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 2,
  'be000000-0000-4000-8000-000000000029', repeat('f', 64))->>'revision') = '3', 'undo is a new revision');
select pg_temp.br_assert((select value #>> '{}' = '716-555-0100' and source = 'owner' from public.business_record_facts where workspace_id = 'be000000-0000-4000-8000-000000000010' and fact_key = 'phone'), 'undo restored phone and its provenance');
select pg_temp.br_assert(not exists (select 1 from public.business_record_facts where workspace_id = 'be000000-0000-4000-8000-000000000010' and fact_key = 'description'), 'undo removed the fact that revision added');
select pg_temp.br_expect($$select public.undo_business_record_revision('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',2,'be000000-0000-4000-8000-00000000002a',repeat('f',64))$$, 'business_record_undo_already_applied');
select pg_temp.br_assert((public.read_business_record_history('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000002', 'br-member@example.test', 10)#>>'{1,undoneBy}') = '3', 'history shows which revision undid revision 2');
-- Undo refuses to clobber a later edit.
select public.patch_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 3,
  '{"facts":{"phone":{"value":"716-555-0102"}}}', 'be000000-0000-4000-8000-00000000002b', repeat('1', 64));
select public.patch_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 4,
  '{"facts":{"phone":{"value":"716-555-0103"}}}', 'be000000-0000-4000-8000-00000000002c', repeat('2', 64));
select pg_temp.br_expect($$select public.undo_business_record_revision('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',4,'be000000-0000-4000-8000-00000000002d',repeat('3',64))$$, 'business_record_undo_conflict');

-- Contacts deduplicate on normalized email and phone and never bump the profile revision.
create temporary table br_contacts(value jsonb);
insert into br_contacts select public.upsert_business_contacts('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'inquiries',
  '[{"name":"Jordan","email":"Jordan@Example.org","seenAt":"2026-09-01T10:00:00Z","source":"inquiry"},
    {"name":"Casey","phone":"(716) 555-0122","seenAt":"2026-09-02T10:00:00Z","source":"inquiry"},
    {"email":"jordan@example.org","phone":"716 555 0122","seenAt":"2026-08-01T10:00:00Z","source":"booking"},
    {"email":"casey@example.net","phone":"+1 716-555-0122","seenAt":"2026-09-03T10:00:00Z","source":"booking"}]',
  'be000000-0000-4000-8000-000000000030', repeat('4', 64));
select pg_temp.br_assert((select value#>>'{contacts,created}' = '2' and value#>>'{contacts,merged}' = '2' and value->>'revision' = '5' from br_contacts), 'two contacts created, two merged, revision unchanged');
select pg_temp.br_assert((select count(*) from public.business_contacts where workspace_id = 'be000000-0000-4000-8000-000000000010') = 2, 'deduplicated to two contacts');
select pg_temp.br_assert((select phone is null and sources = array['booking','inquiry'] and first_seen_at = '2026-08-01T10:00:00Z' from public.business_contacts where workspace_id = 'be000000-0000-4000-8000-000000000010' and email = 'jordan@example.org'), 'merge kept the earliest sighting and did not steal Casey''s phone');
select pg_temp.br_assert((select email = 'casey@example.net' from public.business_contacts where workspace_id = 'be000000-0000-4000-8000-000000000010' and phone_key = '17165550122'), 'phone match filled the missing email');
select pg_temp.br_assert((select (value->>'changeCount')::int = 0 from (select public.upsert_business_contacts('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'inquiries',
  '[{"email":"jordan@example.org","seenAt":"2026-08-15T10:00:00Z","source":"inquiry"}]', 'be000000-0000-4000-8000-000000000031', repeat('5', 64)) value) r), 'a known contact seen again inside its window changes nothing');
-- A profile patch at the unchanged revision still succeeds after intake.
select pg_temp.br_assert((public.patch_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 5,
  '{"facts":{"email":{"value":"hello@juniper.example.test"}}}', 'be000000-0000-4000-8000-000000000032', repeat('6', 64))->>'revision') = '6', 'intake does not make an open edit stale');
select pg_temp.br_expect($$select public.upsert_business_contacts('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000001','br-owner@example.test','inquiries','[{"name":"Nobody","source":"inquiry"}]','be000000-0000-4000-8000-000000000033',repeat('7',64))$$, 'business_record_patch_invalid');
-- Undoing the intake revision removes what it created.
select public.undo_business_record_revision('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner',
  (select (value->>'sequence')::bigint from br_contacts), 'be000000-0000-4000-8000-000000000034', repeat('8', 64));
select pg_temp.br_assert((select count(*) from public.business_contacts where workspace_id = 'be000000-0000-4000-8000-000000000010') = 0, 'undo of intake removed its contacts');

-- History is immutable.
select pg_temp.br_expect($$update public.business_record_revisions set source = 'agent' where workspace_id = 'be000000-0000-4000-8000-000000000010'$$, 'business_record_history_immutable');
select pg_temp.br_expect($$delete from public.business_record_revisions where workspace_id = 'be000000-0000-4000-8000-000000000010'$$, 'business_record_history_immutable');

-- The owner recipient resolves from the record fact. Nothing is sent.
select pg_temp.br_assert((public.resolve_business_owner_recipient('be000000-0000-4000-8000-000000000010')->>'email') = 'br-owner@example.test'
  and (public.resolve_business_owner_recipient('be000000-0000-4000-8000-000000000010')->>'from') = 'record', 'owner recipient from the record');
select pg_temp.br_assert(public.resolve_business_owner_recipient('be000000-0000-4000-8000-000000000011') is null, 'no recipient when neither record nor tenant has one');

-- After exit, writes stop and reads continue.
select public.patch_business_record('be000000-0000-4000-8000-000000000013', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 0,
  '{"facts":{"phone":{"value":"716-555-0144"}}}', 'be000000-0000-4000-8000-000000000040', repeat('9', 64));
insert into public.workspace_exit_requests(workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation,
  maintained_resource_action, state, completed_at)
  values ('be000000-0000-4000-8000-000000000013', 'be000000-0000-4000-8000-000000000001', 'br-exit', repeat('9', 64), 'pause', 'keep', 'stop',
    '{"status":"completed"}', now());
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000013','be000000-0000-4000-8000-000000000001','br-owner@example.test','owner',1,'{"facts":{"phone":{"value":"716-555-0145"}}}','be000000-0000-4000-8000-000000000041',repeat('9',64))$$, 'workspace_exit_future_work_blocked');
select pg_temp.br_expect($$select public.upsert_business_contacts('be000000-0000-4000-8000-000000000013','be000000-0000-4000-8000-000000000001','br-owner@example.test','inquiries','[{"email":"late@example.test","source":"inquiry"}]','be000000-0000-4000-8000-000000000042',repeat('9',64))$$, 'workspace_exit_future_work_blocked');
select pg_temp.br_assert((public.read_business_record('be000000-0000-4000-8000-000000000013', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test')->>'revision') = '1', 'exited record stays readable');

-- An agency member is refused until an accepted assignment and accepted delivery exist.
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000005','br-agency@example.test')$$, 'business_record_access_denied');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  values ('be000000-0000-4000-8000-000000000050', 'be000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Agency work', '{}', 'be000000-0000-4000-8000-000000000001');
insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
    assignee_workspace_id, offer_key, work_scope, status, accepted_at, expires_at)
  values ('be000000-0000-4000-8000-000000000051', 'be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000050',
    'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'be000000-0000-4000-8000-000000000005', 'br-agency@example.test', 'agency',
    'be000000-0000-4000-8000-000000000014', 'br-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp() + interval '7 days');
insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
    accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by)
  values ('be000000-0000-4000-8000-000000000052', 'be000000-0000-4000-8000-000000000010', 'business_record_fixture', '1.0.0', '[]',
    '{"kind":"provider_requested","providerKind":"agency"}', array['operate'], array['workspace'], 'br-install', repeat('a', 64),
    'be000000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000001');
insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
    command_digest, requested_by, expires_at, accepted_by, accepted_at, history)
  values ('be000000-0000-4000-8000-000000000053', 'be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000052',
    'be000000-0000-4000-8000-000000000051', 'requested', array['operate'], 'br-delivery', repeat('a', 64),
    'be000000-0000-4000-8000-000000000001', clock_timestamp() + interval '7 days', null, null, '[]');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000005','br-agency@example.test')$$, 'business_record_access_denied');
update public.offering_provider_deliveries set status = 'accepted', accepted_by = 'be000000-0000-4000-8000-000000000005', accepted_at = clock_timestamp()
  where id = 'be000000-0000-4000-8000-000000000053';
select pg_temp.br_assert((public.read_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000005', 'br-agency@example.test')->>'access') = 'agency', 'accepted delivery grants agency read');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000005','br-agency@example.test','owner',6,'{"facts":{"phone":{"value":"716-555-0160"}}}','be000000-0000-4000-8000-000000000054',repeat('b',64))$$, 'business_record_source_invalid');
select pg_temp.br_expect($$select public.patch_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000005','br-agency@example.test','agency',6,'{"facts":{"phone":{"value":"716-555-0160","verified":true}}}','be000000-0000-4000-8000-000000000055',repeat('b',64))$$, 'business_record_source_invalid');
select pg_temp.br_assert((public.patch_business_record('be000000-0000-4000-8000-000000000010', 'be000000-0000-4000-8000-000000000005', 'br-agency@example.test', 'agency', 6,
  '{"facts":{"phone":{"value":"716-555-0160"}}}', 'be000000-0000-4000-8000-000000000056', repeat('b', 64))->>'revision') = '7', 'agency writes with agency provenance');
select pg_temp.br_assert((select actor_kind = 'agency' and source = 'agency' from public.business_record_revisions where workspace_id = 'be000000-0000-4000-8000-000000000010' and command_id = 'be000000-0000-4000-8000-000000000056'), 'agency revision attributed');
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000011','be000000-0000-4000-8000-000000000005','br-agency@example.test')$$, 'business_record_access_denied');
update public.operational_assignments set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = 'be000000-0000-4000-8000-000000000001'
  where id = 'be000000-0000-4000-8000-000000000051';
select pg_temp.br_expect($$select public.read_business_record('be000000-0000-4000-8000-000000000010','be000000-0000-4000-8000-000000000005','br-agency@example.test')$$, 'business_record_access_denied');

-- Deleting a business removes its record and history with it.
select public.patch_business_record('be000000-0000-4000-8000-000000000015', 'be000000-0000-4000-8000-000000000001', 'br-owner@example.test', 'owner', 0,
  '{"facts":{"phone":{"value":"716-555-0170"}}}', 'be000000-0000-4000-8000-000000000060', repeat('c', 64));
delete from public.workspaces where id = 'be000000-0000-4000-8000-000000000015';
select pg_temp.br_assert(not exists (select 1 from public.business_record_revisions where workspace_id = 'be000000-0000-4000-8000-000000000015'), 'workspace deletion cascades the record');
rollback;
