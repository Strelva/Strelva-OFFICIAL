\set ON_ERROR_STOP on
-- Inquiry records (20261009113000_inquiry_records.sql): spam held in
-- tenant_leads, inquiry_events, contact on capture, the workspace read and
-- the held-item review. Fictional tenants only; rolls back.
begin;
create or replace function pg_temp.ir_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry records assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ir_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ir_lead(lead_id text, hash text, captured text, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('leadId', lead_id, 'submissionHash', hash, 'name', 'Dana Reed',
    'email', 'Dana@Example.test', 'message', 'Private party for 30?', 'source', 'contact-form', 'capturedAt', captured) || extra
$$;

insert into public.users(id, email, verified_at) values
  ('d0000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e4', 'ir-admin@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e6', 'ir-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('d0000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ir-site', 'd0000000-0000-4000-8000-0000000000b1', 'McClear Fixture', true),
  ('ir-other', 'd0000000-0000-4000-8000-0000000000b2', 'Other Inquiry Site', true),
  ('ir-plain', 'd0000000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

create temporary table ir_ws(name text primary key, id uuid) on commit drop;
insert into ir_ws select 'site', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-site',
  '{"tenantId":"ir-site","tenantStableId":"d0000000-0000-4000-8000-0000000000b1","workspaceName":"McClear Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd0000000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into ir_ws select 'other', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-other',
  '{"tenantId":"ir-other","tenantStableId":"d0000000-0000-4000-8000-0000000000b2","workspaceName":"Other Inquiry Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd0000000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select (select id from ir_ws where name = 'site'), u, r, 'd0000000-0000-4000-8000-0000000000e2'::uuid
  from (values ('d0000000-0000-4000-8000-0000000000e2'::uuid, 'owner'), ('d0000000-0000-4000-8000-0000000000e3'::uuid, 'member'),
    ('d0000000-0000-4000-8000-0000000000e4'::uuid, 'admin'), ('d0000000-0000-4000-8000-0000000000e6'::uuid, 'owner')) m(u, r)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ((select id from ir_ws where name = 'other'), 'd0000000-0000-4000-8000-0000000000e5', 'owner', 'd0000000-0000-4000-8000-0000000000e5')
  on conflict (workspace_id, user_id) do update set role = excluded.role;

-- Locked down.
select pg_temp.ir_assert((select relrowsecurity from pg_class where oid = 'public.inquiry_events'::regclass), 'rls on events');
select pg_temp.ir_assert(not has_table_privilege('anon', 'public.inquiry_events', 'select')
  and not has_table_privilege('authenticated', 'public.inquiry_events', 'select')
  and not has_table_privilege('service_role', 'public.inquiry_events', 'insert'), 'no direct event table access');
select pg_temp.ir_assert(not has_function_privilege('anon', 'public.hold_tenant_lead_as_spam(text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_workspace_leads(uuid,uuid,text,text[],integer,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.decide_held_workspace_lead(uuid,uuid,text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.after_tenant_lead_capture(text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.inquiry_event_write(uuid,uuid,text,text,text,text,jsonb,text)', 'execute')
  and not has_function_privilege('service_role', 'public.inquiry_assert_member(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.hold_tenant_lead_as_spam(text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.record_inquiry_event(text,text,text,text,text,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_workspace_inquiry_events(uuid,uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_lead_digests(text,timestamptz)', 'execute'), 'function grants');

-- A kept lead, then its capture follow-up: event plus a new contact.
select public.record_tenant_lead('ir-site', pg_temp.ir_lead('lead_kept1', 'k1', '2026-10-05T21:40:00.000Z',
  '{"fields":{"phone":"716-555-0100"}}'), 'dual_write');
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-site', 'lead_kept1'))->>'contact' = 'created', 'contact created on capture');
select pg_temp.ir_assert((select c.email = 'dana@example.test' and c.phone = '716-555-0100' and c.sources = array['inquiry']
  from public.business_contacts c join public.tenant_leads l on l.contact_id = c.id where l.lead_id = 'lead_kept1'), 'lead points at its contact');
-- Replay is a no-op: one captured event, one contact_linked event.
select public.after_tenant_lead_capture('ir-site', 'lead_kept1');
select pg_temp.ir_assert((select count(*) from public.inquiry_events where lead_id = 'lead_kept1') = 2, 'events written once');

-- The same person by phone only merges into the same contact.
select public.record_tenant_lead('ir-site', pg_temp.ir_lead('lead_kept2', 'k2', '2026-10-06T08:00:00.000Z',
  '{"email":"dana.other@example.test","fields":{"phone":"(716) 555-0100"}}'), 'dual_write');
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-site', 'lead_kept2'))->>'contact' = 'merged', 'phone match merges');
select pg_temp.ir_assert((select count(*) from public.business_contacts where workspace_id = (select id from ir_ws where name = 'site')) = 1, 'one contact for one person');
select pg_temp.ir_assert((select email from public.business_contacts where workspace_id = (select id from ir_ws where name = 'site')) = 'dana@example.test',
  'a merge never overwrites a known email');
-- A booking for the same person points at the same contact (shared dedupe rule).
select pg_temp.ir_assert((select 'inquiry' = any(sources) from public.business_contacts where email = 'dana@example.test'), 'source inquiry');

-- Unconverted tenant: captured event, no contact. Unknown lead: missing.
select public.record_tenant_lead('ir-plain', pg_temp.ir_lead('lead_plain', 'p1', '2026-10-06T08:00:00.000Z'), 'dual_write');
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-plain', 'lead_plain'))->>'contact' = 'none', 'no business, no contact');
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-site', 'lead_nobody'))->>'status' = 'missing', 'unknown lead is missing');
select pg_temp.ir_expect($$select public.after_tenant_lead_capture('no-such-site', 'lead_kept1')$$, 'inquiry_record_unknown_tenant');
-- No email and no usable phone: skipped, lead kept.
select public.record_tenant_lead('ir-site', pg_temp.ir_lead('lead_anon', 'a1', '2026-10-06T09:00:00.000Z', '{"email":"not an email"}'), 'dual_write');
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-site', 'lead_anon'))->>'contact' = 'skipped', 'unmatchable contact skipped');
select pg_temp.ir_assert(exists(select 1 from public.tenant_leads where lead_id = 'lead_anon'), 'lead survives a skipped contact');

-- Spam held for review.
select pg_temp.ir_assert((public.hold_tenant_lead_as_spam('ir-site', '{"id":"spam_one","reason":"honeypot","name":"Buy now",
  "email":"bot@example.test","message":"cheap pills","source":"v1-leads","createdAt":"2026-10-06T10:00:00.000Z"}'))->>'status' = 'recorded', 'spam held');
select pg_temp.ir_assert((public.hold_tenant_lead_as_spam('ir-site', '{"id":"spam_one","reason":"honeypot","createdAt":"2026-10-06T10:00:00.000Z"}'))->>'status' = 'exists',
  'holding is idempotent');
select pg_temp.ir_expect($$select public.hold_tenant_lead_as_spam('ir-site', '{"id":"not-spam","reason":"x","createdAt":"2026-10-06T10:00:00Z"}')$$, 'inquiry_record_invalid');
select pg_temp.ir_expect($$select public.hold_tenant_lead_as_spam('no-such-site', '{"id":"spam_x","reason":"x","createdAt":"2026-10-06T10:00:00Z"}')$$, 'inquiry_record_unknown_tenant');
select pg_temp.ir_assert((select intake_state = 'held_as_spam' and char_length(submission_hash) = 16 and contact_id is null
  from public.tenant_leads where lead_id = 'lead_spam_one'), 'held row shape');
-- Spam never becomes a contact.
select pg_temp.ir_assert((public.after_tenant_lead_capture('ir-site', 'lead_spam_one'))->>'contactId' is null, 'spam has no contact');
-- A real lead with a short hash is never a duplicate of spam.
select pg_temp.ir_assert((public.record_tenant_lead('ir-site', pg_temp.ir_lead('lead_real', 's', '2026-10-06T10:00:30.000Z'), 'dual_write'))->>'status' = 'recorded',
  'real lead next to spam is recorded');

-- The cutover reads skip spam.
select pg_temp.ir_assert(not exists(select 1 from jsonb_array_elements(public.read_tenant_leads('ir-site', 500, null)) e where e->>'leadId' = 'lead_spam_one'), 'operator list skips spam');
select pg_temp.ir_assert(public.read_tenant_lead('ir-site', 'lead_spam_one') is null, 'by-id skips spam');
select pg_temp.ir_assert(not (public.read_tenant_lead_digests('ir-site', null) ? 'lead_spam_one'), 'digests skip spam');
select pg_temp.ir_assert(public.read_tenant_lead_digests('ir-site', null) ? 'lead_kept1', 'digests keep leads');

-- Workspace read: direct members only, by business, paged.
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_leads((select id from ir_ws where name = 'site'),
  'd0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', null, 50, null)) = 4, 'member reads the normal records');
select pg_temp.ir_assert((public.read_workspace_leads((select id from ir_ws where name = 'site'),
  'd0000000-0000-4000-8000-0000000000e2', 'IR-Owner@example.test', array['held_as_spam'], 50, null))->0->>'heldReason' = 'honeypot', 'held list');
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_leads((select id from ir_ws where name = 'site'),
  'd0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', null, 1, '2026-10-06T09:30:00Z')) = 1, 'paged with p_before');
select pg_temp.ir_expect(format($$select public.read_workspace_leads(%L, 'd0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', null, 50, null)$$,
  (select id from ir_ws where name = 'site')), 'inquiry_access_denied');
select pg_temp.ir_expect(format($$select public.read_workspace_leads(%L, 'd0000000-0000-4000-8000-0000000000e6', 'ir-unverified@example.test', null, 50, null)$$,
  (select id from ir_ws where name = 'site')), 'inquiry_access_denied');
select pg_temp.ir_expect(format($$select public.read_workspace_leads(%L, 'd0000000-0000-4000-8000-0000000000e2', 'someone-else@example.test', null, 50, null)$$,
  (select id from ir_ws where name = 'site')), 'inquiry_access_denied');
select pg_temp.ir_expect(format($$select public.read_workspace_leads(%L, 'd0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', array['deleted'], 50, null)$$,
  (select id from ir_ws where name = 'site')), 'inquiry_record_invalid');
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_leads((select id from ir_ws where name = 'other'),
  'd0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', array['kept','held_as_spam','released','confirmed_spam'], 50, null)) = 0,
  'the other business sees none of these');

-- Review: members and admins may not release; the owner and Strelva may.
create temporary table ir_spam(id uuid) on commit drop;
insert into ir_spam select id from public.tenant_leads where lead_id = 'lead_spam_one';
select pg_temp.ir_expect(format($$select public.decide_held_workspace_lead(%L, 'd0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', %L, 'release')$$,
  (select id from ir_ws where name = 'site'), (select id from ir_spam)), 'inquiry_access_denied');
select pg_temp.ir_expect(format($$select public.decide_held_workspace_lead(%L, 'd0000000-0000-4000-8000-0000000000e4', 'ir-admin@example.test', %L, 'release')$$,
  (select id from ir_ws where name = 'site'), (select id from ir_spam)), 'inquiry_access_denied');
-- Another business's owner can't reach it through their own business either.
select pg_temp.ir_expect(format($$select public.decide_held_workspace_lead(%L, 'd0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', %L, 'release')$$,
  (select id from ir_ws where name = 'other'), (select id from ir_spam)), 'inquiry_not_found');
select pg_temp.ir_expect(format($$select public.decide_held_workspace_lead(%L, 'd0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', %L, 'delete')$$,
  (select id from ir_ws where name = 'site'), (select id from ir_spam)), 'inquiry_record_invalid');
select pg_temp.ir_assert((public.decide_held_workspace_lead((select id from ir_ws where name = 'site'), 'd0000000-0000-4000-8000-0000000000e2',
  'ir-owner@example.test', (select id from ir_spam), 'release'))#>>'{lead,intakeState}' = 'released', 'owner releases');
select pg_temp.ir_assert((public.decide_held_workspace_lead((select id from ir_ws where name = 'site'), 'd0000000-0000-4000-8000-0000000000e2',
  'ir-owner@example.test', (select id from ir_spam), 'release'))->>'status' = 'unchanged', 'release twice is unchanged');
-- Released: a normal record in the workspace and operator reads, still outside parity digests.
select pg_temp.ir_assert(exists(select 1 from jsonb_array_elements(public.read_workspace_leads((select id from ir_ws where name = 'site'),
  'd0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', null, 50, null)) e where e->>'leadId' = 'lead_spam_one'), 'released reads as normal');
select pg_temp.ir_assert(public.read_tenant_lead('ir-site', 'lead_spam_one')->>'intakeState' = 'released', 'by-id reads released');
select pg_temp.ir_assert(not (public.read_tenant_lead_digests('ir-site', null) ? 'lead_spam_one'), 'released stays out of parity');
-- Strelva puts it back, then confirms spam.
select pg_temp.ir_assert((public.decide_held_workspace_lead((select id from ir_ws where name = 'site'), 'd0000000-0000-4000-8000-0000000000e1',
  'ir-operator@strelva.example.test', (select id from ir_spam), 'hold'))#>>'{lead,intakeState}' = 'held_as_spam', 'operator puts it back');
select pg_temp.ir_assert((public.decide_held_workspace_lead((select id from ir_ws where name = 'site'), 'd0000000-0000-4000-8000-0000000000e1',
  'ir-operator@strelva.example.test', (select id from ir_spam), 'confirm_spam'))#>>'{lead,intakeState}' = 'confirmed_spam', 'operator confirms');
select pg_temp.ir_assert((select array_agg(kind || ':' || actor order by at, id) from public.inquiry_events where lead_id = 'lead_spam_one')
  = array['held_as_spam:system', 'released:owner', 'reheld:operator', 'confirmed_spam:operator'], 'every decision has a receipt');
-- A kept lead is not under review.
select pg_temp.ir_expect(format($$select public.decide_held_workspace_lead(%L, 'd0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', %L, 'confirm_spam')$$,
  (select id from ir_ws where name = 'site'), (select id from public.tenant_leads where lead_id = 'lead_kept1')), 'inquiry_not_held');

-- Events: read by members of the business only; append-only; app copies are idempotent.
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_inquiry_events((select id from ir_ws where name = 'site'),
  'd0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', (select id from ir_spam))) = 4, 'member reads events');
select pg_temp.ir_expect(format($$select public.read_workspace_inquiry_events(%L, 'd0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', %L)$$,
  (select id from ir_ws where name = 'other'), (select id from ir_spam)), 'inquiry_not_found');
select pg_temp.ir_assert((public.record_inquiry_event('ir-site', 'lead_kept1', 'delivery', 'strelva', null, '{"status":"accepted"}', 'delivery:reply:1'))->>'status' = 'recorded', 'delivery copy');
select pg_temp.ir_assert((public.record_inquiry_event('ir-site', 'lead_kept1', 'delivery', 'strelva', null, '{"status":"accepted"}', 'delivery:reply:1'))->>'status' = 'exists', 'delivery copy once');
select pg_temp.ir_expect($$select public.record_inquiry_event('ir-site', 'lead_kept1', 'released', 'owner', null, null, null)$$, 'inquiry_record_invalid');
select pg_temp.ir_expect($$select public.record_inquiry_event('no-such-site', 'lead_kept1', 'reply', 'owner', null, null, null)$$, 'inquiry_record_unknown_tenant');
select pg_temp.ir_expect($$update public.inquiry_events set kind = 'reply'$$, 'inquiry_events_immutable');
select pg_temp.ir_expect($$delete from public.inquiry_events$$, 'inquiry_events_immutable');
rollback;
