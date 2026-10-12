\set ON_ERROR_STOP on

-- Internal tool contact and assigned-person fields, and the notice receipt.
-- Fictional local fixture only; never production.

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

create function pg_temp.expect_error(stmt text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm <> expected then
      raise exception 'expected % but got % for: %', expected, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, stmt;
end;
$$;

-- 01 operator (made the tool), 02 staff member who submits, 03 outsider,
-- 04 owner of another business. Two businesses: Leslie (10) and Other (12).
insert into public.users(id, email, verified_at) values
 ('e8000000-0000-4000-8000-000000000001', 'links-operator@example.test', now()),
 ('e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', now()),
 ('e8000000-0000-4000-8000-000000000003', 'links-outsider@example.test', now()),
 ('e8000000-0000-4000-8000-000000000004', 'links-other@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
 ('e8000000-0000-4000-8000-000000000010', 'customer', 'Leslie Bookkeeping', 'e8000000-0000-4000-8000-000000000001'),
 ('e8000000-0000-4000-8000-000000000012', 'customer', 'Other business', 'e8000000-0000-4000-8000-000000000004'),
 ('e8000000-0000-4000-8000-000000000013', 'personal', 'Staff personal', 'e8000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000001', 'admin', 'e8000000-0000-4000-8000-000000000001'),
 ('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000002', 'member', 'e8000000-0000-4000-8000-000000000001'),
 ('e8000000-0000-4000-8000-000000000012', 'e8000000-0000-4000-8000-000000000004', 'owner', 'e8000000-0000-4000-8000-000000000004'),
 ('e8000000-0000-4000-8000-000000000013', 'e8000000-0000-4000-8000-000000000002', 'owner', 'e8000000-0000-4000-8000-000000000002');
insert into public.business_records(workspace_id, created_by, updated_by) values
 ('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001'),
 ('e8000000-0000-4000-8000-000000000012', 'e8000000-0000-4000-8000-000000000004', 'e8000000-0000-4000-8000-000000000004');
insert into public.business_people(id, workspace_id, name, email, source, created_by, updated_by, active) values
 ('e8000000-0000-4000-8000-000000000020', 'e8000000-0000-4000-8000-000000000010', 'Sam Rivera', 'sam@leslie.example.test', 'operator', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', true),
 ('e8000000-0000-4000-8000-000000000021', 'e8000000-0000-4000-8000-000000000010', 'Pat No Email', null, 'operator', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', true),
 ('e8000000-0000-4000-8000-000000000022', 'e8000000-0000-4000-8000-000000000012', 'Other Staff', 'staff@other.example.test', 'owner', 'e8000000-0000-4000-8000-000000000004', 'e8000000-0000-4000-8000-000000000004', true),
 ('e8000000-0000-4000-8000-000000000023', 'e8000000-0000-4000-8000-000000000010', 'Former Staff', 'former@leslie.example.test', 'operator', 'e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000001', false);
insert into public.business_contacts(id, workspace_id, name, email, phone, sources, first_seen_at, last_seen_at) values
 ('e8000000-0000-4000-8000-000000000030', 'e8000000-0000-4000-8000-000000000010', 'Acme by email', 'acme@client.example.test', null, array['inquiry'], now(), now()),
 ('e8000000-0000-4000-8000-000000000031', 'e8000000-0000-4000-8000-000000000010', 'Acme by phone', null, '716-555-0100', array['booking'], now(), now()),
 ('e8000000-0000-4000-8000-000000000032', 'e8000000-0000-4000-8000-000000000012', 'Other client', 'client@other.example.test', null, array['owner'], now(), now());

-- Field types: contact and assigned_person validate; two assigned people do not.
create temp table links_spec(spec jsonb);
insert into links_spec values (jsonb_build_object('title', 'New client intake', 'maintenanceOwner', 'e8000000-0000-4000-8000-000000000001',
  'fields', jsonb_build_array(
    jsonb_build_object('id', 'business', 'label', 'Client business', 'type', 'text', 'required', true),
    jsonb_build_object('id', 'client', 'label', 'Client contact', 'type', 'contact', 'required', true),
    jsonb_build_object('id', 'handler', 'label', 'Handled by', 'type', 'assigned_person', 'required', false),
    jsonb_build_object('id', 'documents', 'label', 'Bank statements', 'type', 'boolean', 'required', false)),
  'components', jsonb_build_array(jsonb_build_object('kind', 'form', 'fields', jsonb_build_array('business', 'client', 'handler', 'documents')))));
select public.validate_application_spec((select spec from links_spec));
select pg_temp.expect_error($$select public.validate_application_spec(jsonb_set((select spec from links_spec), '{fields,3}',
  jsonb_build_object('id', 'second', 'label', 'Second', 'type', 'assigned_person', 'required', false)))$$, 'application_schema_invalid');
select pg_temp.expect_error($$select public.validate_application_record((select spec from links_spec), 'r', '{"business":"Acme","client":"Acme Co"}'::jsonb)$$, 'application_record_invalid');

-- An installed tool in Leslie's business (the release is written directly; the
-- publish path is proven by application-releases-schema.sql).
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
select 'e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010', 'applications', 'application', 'New client intake',
  jsonb_build_object('version', 1, 'revision', 0, 'title', 'New client intake', 'createdBy', 'e8000000-0000-4000-8000-000000000001',
    'createdAt', '2026-10-07T12:00:00Z', 'history', '[]'::jsonb, 'spec', spec, 'specVersion', 1, 'status', 'draft',
    'versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', spec)), 'rehearsal', null, 'records', '[]'::jsonb),
  'e8000000-0000-4000-8000-000000000001'
from links_spec;
insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
select 'e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010', 1, spec, 'e8000000-0000-4000-8000-000000000001' from links_spec;
update public.application_states set current_release_version = 1, lifecycle_status = 'installed'
  where work_id = 'e8000000-0000-4000-8000-000000000040';

-- Resolve: a new email becomes a new contact with source internal_app.
create temp table resolved(name text, value jsonb);
insert into resolved select 'new', public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test',
  '[{"fieldId":"client","kind":"contact","name":"Brightline Co","email":"Owner@Brightline.example.test"},{"fieldId":"handler","kind":"assigned_person","email":"SAM@leslie.example.test"}]');
select pg_temp.assert_true((select value->'client'->>'created' from resolved where name = 'new') = 'true', 'new contact created');
select pg_temp.assert_true((select value->'handler'->>'id' from resolved where name = 'new') = 'e8000000-0000-4000-8000-000000000020', 'assigned person found by email');
select pg_temp.assert_true(exists(select 1 from public.business_contacts c
  where c.id = (select (value->'client'->>'id')::uuid from resolved where name = 'new')
    and c.workspace_id = 'e8000000-0000-4000-8000-000000000010' and c.email = 'owner@brightline.example.test'
    and c.name = 'Brightline Co' and c.sources = array['internal_app']), 'contact stored in this business with source internal_app');
select pg_temp.assert_true(exists(select 1 from public.business_record_revisions
  where workspace_id = 'e8000000-0000-4000-8000-000000000010' and source = 'internal_app' and actor_kind = 'member'
    and actor_id = 'e8000000-0000-4000-8000-000000000002'), 'contact upsert leaves a business record revision');

-- The same email finds the same contact.
insert into resolved select 'again', public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"client","kind":"contact","email":"owner@brightline.example.test"}]');
select pg_temp.assert_true((select value->'client'->>'id' from resolved where name = 'again') = (select value->'client'->>'id' from resolved where name = 'new')
  and (select value->'client'->>'created' from resolved where name = 'again') = 'false', 'existing contact reused');

-- Email matches one contact, phone another: the email match wins and says so.
insert into resolved select 'conflict', public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"client","kind":"contact","email":"acme@client.example.test","phone":"(716) 555-0100"}]');
select pg_temp.assert_true((select value->'client'->>'id' from resolved where name = 'conflict') = 'e8000000-0000-4000-8000-000000000030'
  and (select value->'client'->>'conflict' from resolved where name = 'conflict') = 'true', 'conflict keeps the email match and is reported');
select pg_temp.assert_true((select phone from public.business_contacts where id = 'e8000000-0000-4000-8000-000000000030') is null,
  'the phone is not stolen from the other contact');

-- Unknown, inactive or foreign staff are refused.
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"handler","kind":"assigned_person","email":"staff@other.example.test"}]')$$, 'application_record_person_unknown');
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"handler","kind":"assigned_person","email":"former@leslie.example.test"}]')$$, 'application_record_person_unknown');
-- A field of the wrong kind, or one the release does not have, is refused.
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"business","kind":"contact","email":"a@b.example.test"}]')$$, 'application_record_invalid');
-- Outsiders and other businesses' tools are refused.
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000003', 'links-outsider@example.test', '[{"fieldId":"client","kind":"contact","email":"x@y.example.test"}]')$$, 'workspace_membership_required');
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000012', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000004', 'links-other@example.test', '[{"fieldId":"client","kind":"contact","email":"x@y.example.test"}]')$$, 'application_access_denied');
select pg_temp.expect_error($$select public.resolve_internal_tool_links('e8000000-0000-4000-8000-000000000013', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', '[{"fieldId":"client","kind":"contact","email":"x@y.example.test"}]')$$, 'application_record_link_denied');

-- Submit stores ids. Another business's contact or person is refused.
select count(*) from public.submit_application_record('e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', 1, 0, 'r1',
  jsonb_build_object('business', 'Brightline', 'client', (select value->'client'->>'id' from resolved where name = 'new'),
    'handler', 'e8000000-0000-4000-8000-000000000020'));
select pg_temp.assert_true((select values->>'client' from public.application_records where work_id = 'e8000000-0000-4000-8000-000000000040' and record_id = 'r1')
  = (select value->'client'->>'id' from resolved where name = 'new'), 'the record stores the contact id, not a name');
select pg_temp.expect_error($$select count(*) from public.submit_application_record('e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', 1, null, 'r2',
  '{"business":"Leak","client":"e8000000-0000-4000-8000-000000000032"}'::jsonb)$$, 'application_record_link_denied');
select pg_temp.expect_error($$select count(*) from public.submit_application_record('e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', 1, null, 'r3',
  '{"business":"Leak","client":"e8000000-0000-4000-8000-000000000030","handler":"e8000000-0000-4000-8000-000000000022"}'::jsonb)$$, 'application_record_link_denied');
select pg_temp.expect_error($$select count(*) from public.submit_application_record('e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', 1, null, 'r4',
  '{"business":"Leak","client":"Acme Co"}'::jsonb)$$, 'application_record_invalid');
-- The edit path is guarded by the same trigger.
select pg_temp.expect_error($$update public.application_records set values = values || '{"client":"e8000000-0000-4000-8000-000000000032"}'::jsonb
  where work_id = 'e8000000-0000-4000-8000-000000000040' and record_id = 'r1'$$, 'application_record_link_denied');

-- Notice receipts: one per record, idempotent, and bound to this business.
create temp table claims(name text, value jsonb);
insert into claims select 'first', public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040', 'r1', 'handler',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test');
select pg_temp.assert_true((select value->>'claimed' from claims where name = 'first') = 'true'
  and (select value->>'recipientEmail' from claims where name = 'first') = 'sam@leslie.example.test'
  and (select value->>'personName' from claims where name = 'first') = 'Sam Rivera', 'first claim returns the assigned person');
insert into claims select 'second', public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040', 'r1', 'handler',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test');
select pg_temp.assert_true((select value->>'claimed' from claims where name = 'second') = 'false'
  and (select value->>'noticeId' from claims where name = 'second') = (select value->>'noticeId' from claims where name = 'first'), 'second claim never sends twice');
select public.finish_internal_tool_notice((select (value->>'noticeId')::uuid from claims where name = 'first'), 'e8000000-0000-4000-8000-000000000010', 'sent', null, 'provider-1');
select pg_temp.assert_true((select status = 'sent' and attempts = 1 and provider_message_id = 'provider-1' from public.internal_tool_notices
  where id = (select (value->>'noticeId')::uuid from claims where name = 'first')), 'receipt records the send');
select pg_temp.expect_error($$select public.finish_internal_tool_notice((select (value->>'noticeId')::uuid from claims where name = 'first'), 'e8000000-0000-4000-8000-000000000010', 'failed', 'again', null)$$, 'internal_tool_notice_denied');
select pg_temp.expect_error($$select public.finish_internal_tool_notice((select (value->>'noticeId')::uuid from claims where name = 'first'), 'e8000000-0000-4000-8000-000000000012', 'sent', null, null)$$, 'internal_tool_notice_denied');
select pg_temp.expect_error($$select public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000012', 'e8000000-0000-4000-8000-000000000040', 'r1', 'handler',
  'e8000000-0000-4000-8000-000000000004', 'links-other@example.test')$$, 'internal_tool_notice_denied');
select pg_temp.expect_error($$select public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040', 'r1', 'handler',
  'e8000000-0000-4000-8000-000000000003', 'links-outsider@example.test')$$, 'workspace_membership_required');
select pg_temp.expect_error($$select public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040', 'r1', 'business',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test')$$, 'internal_tool_notice_denied');

-- A person with no email: the receipt says so and nothing is claimed for sending.
select count(*) from public.submit_application_record('e8000000-0000-4000-8000-000000000040', 'e8000000-0000-4000-8000-000000000010',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test', 1, null, 'r5',
  '{"business":"Quiet Co","client":"e8000000-0000-4000-8000-000000000030","handler":"e8000000-0000-4000-8000-000000000021"}'::jsonb);
insert into claims select 'no-email', public.claim_internal_tool_notice('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040', 'r5', 'handler',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test');
select pg_temp.assert_true((select value->>'claimed' = 'false' and value->>'status' = 'skipped' from claims where name = 'no-email'), 'no email means a skipped receipt');

select pg_temp.assert_true(jsonb_array_length(public.read_internal_tool_notices('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000002', 'links-staff@example.test')) = 2, 'members read the receipts');
select pg_temp.expect_error($$select public.read_internal_tool_notices('e8000000-0000-4000-8000-000000000010', 'e8000000-0000-4000-8000-000000000040',
  'e8000000-0000-4000-8000-000000000004', 'links-other@example.test')$$, 'workspace_membership_required');

-- Contact sources include newsletter; nothing here is reachable with a public key.
select pg_temp.assert_true('newsletter' = any(public.business_contact_sources()) and 'internal_app' = any(public.business_contact_sources()), 'contact sources extended');
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.internal_tool_notices'::regclass)
  and not has_table_privilege('authenticated', 'public.internal_tool_notices', 'select')
  and not has_table_privilege('anon', 'public.internal_tool_notices', 'select')
  and not has_table_privilege('service_role', 'public.internal_tool_notices', 'select')
  and not has_function_privilege('authenticated', 'public.resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.claim_internal_tool_notice(uuid,uuid,text,text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.finish_internal_tool_notice(uuid,uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_internal_tool_notices(uuid,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.claim_internal_tool_notice(uuid,uuid,text,text,uuid,text)', 'execute'),
  'internal tool link surfaces are service-role only');
