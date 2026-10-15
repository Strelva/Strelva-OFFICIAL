\set ON_ERROR_STOP on
-- Owner reach (20261027100000_owner_reach.sql) on fictional rows: staff
-- addresses are recognised without a hard-coded domain, an agency cannot issue
-- an owner claim to one, the agency read says whether each owner can be reached
-- without emitting any address, and the operator report is operators-only.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.or_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner reach assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.or_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.or_assert(
  has_function_privilege('service_role', 'public.read_agency_client_owner_reach(uuid,uuid,text,uuid[])', 'execute')
  and has_function_privilege('service_role', 'public.operator_owner_reach_report(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.owner_contact_staff_reason(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_agency_client_owner_reach(uuid,uuid,text,uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.operator_owner_reach_report(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.owner_contact_staff_reason(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.owner_reach_public_mail_domains()', 'execute'),
  'only service_role runs the reach functions');

insert into public.users(id, email, verified_at) values
  ('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test', now()),
  ('0e000000-0000-4000-8000-000000000002', 'op@orr-platform.example.test', now()),
  ('0e000000-0000-4000-8000-000000000003', 'other@orr-other.example.test', now()),
  ('0e000000-0000-4000-8000-000000000004', 'plain@gmail.com', now()),
  ('0e000000-0000-4000-8000-000000000005', 'pat@orr-florist.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('0e000000-0000-4000-8000-000000000020', 'agency', 'ORR Agency', '0e000000-0000-4000-8000-000000000001'),
  ('0e000000-0000-4000-8000-000000000030', 'agency', 'ORR Other Agency', '0e000000-0000-4000-8000-000000000003'),
  ('0e000000-0000-4000-8000-000000000011', 'customer', 'ORR Bakery', '0e000000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000001', 'owner', '0e000000-0000-4000-8000-000000000001'),
  ('0e000000-0000-4000-8000-000000000030', '0e000000-0000-4000-8000-000000000003', 'owner', '0e000000-0000-4000-8000-000000000003');
insert into public.super_admins(user_id, email) values ('0e000000-0000-4000-8000-000000000002', 'op@orr-platform.example.test');

-- A client the agency added (no owner yet) and a converted client with staff-trusted contact.
create temporary table or_ids on commit drop as
  select (public.agency_add_client('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test',
    '0e000000-0000-4000-8000-000000000020', '{"name":"ORR Florist"}', '0e000000-0000-4000-8000-0000000000c1', repeat('1', 64))->>'customerWorkspaceId')::uuid as florist;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('0e000000-0000-4000-8000-000000000011', '0e000000-0000-4000-8000-000000000005', 'owner', '0e000000-0000-4000-8000-000000000005');
select public.choose_business_provider('0e000000-0000-4000-8000-000000000005', 'pat@orr-florist.example.test',
  '0e000000-0000-4000-8000-000000000011', '0e000000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test',
  '0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000011', '0e000000-0000-4000-8000-000000000001', true);
delete from public.workspace_memberships where workspace_id = '0e000000-0000-4000-8000-000000000011' and role = 'owner';

-- Staff reasons.
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'Op@orr-platform.example.test ') = 'platform_operator', 'super admin is platform_operator');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'boss@orr-agency.example.test') = 'agency_member', 'serving agency member');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'new.hire@orr-agency.example.test') = 'staff_domain', 'agency domain');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'someone@orr-platform.example.test') = 'staff_domain', 'platform domain');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'pat@orr-florist.example.test') is null, 'owner address is not staff');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'boss@orr-other.example.test') is null, 'another agency is not staff for this business');
-- A public mail domain is never a staff domain, even when a member uses it.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000004', 'member', '0e000000-0000-4000-8000-000000000001');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'someone.else@gmail.com') is null, 'gmail is never a staff domain');
select pg_temp.or_assert(public.owner_contact_staff_reason((select florist from or_ids), 'plain@gmail.com') = 'agency_member', 'a member is staff even on gmail');

-- Claims: staff addresses are refused, a real owner address works.
select pg_temp.or_expect($$select public.issue_agency_client_owner_claim('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test',
  '0e000000-0000-4000-8000-000000000020', (select florist from or_ids), 'boss@orr-agency.example.test', repeat('a', 64), now() + interval '14 days')$$,
  'agency_client_claim_recipient_staff');
select pg_temp.or_expect($$select public.issue_agency_client_owner_claim('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test',
  '0e000000-0000-4000-8000-000000000020', (select florist from or_ids), 'op@orr-platform.example.test', repeat('a', 64), now() + interval '14 days')$$,
  'agency_client_claim_recipient_staff');
select pg_temp.or_assert(public.issue_agency_client_owner_claim('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test',
  '0e000000-0000-4000-8000-000000000020', (select florist from or_ids), 'owner@orr-florist-owner.example.test', repeat('b', 64), now() + interval '14 days')
  ->'delivery'->>'status' = 'not_sent', 'real owner claim is recorded not sent');

-- Converted client: staff-trusted contact and an open owner decision.
insert into public.business_owner_recipient_trust(workspace_id, email, trusted_via)
  values ('0e000000-0000-4000-8000-000000000011', 'boss@orr-agency.example.test', 'conversion');
insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by) values
  ('0e000000-0000-4000-8000-0000000000bb', '0e000000-0000-4000-8000-000000000011', 'Client website', 'website',
   '0e000000-0000-4000-8000-0000000000bb', repeat('a', 64), '0e000000-0000-4000-8000-000000000001', '0e000000-0000-4000-8000-000000000001');
insert into public.owner_decisions(id, workspace_id, system_id, change_kind, route, title, approve_effect, not_yet_effect,
    source_lifecycle, source_id, revision_hash, sign_in_required, expires_at) values
  ('0e000000-0000-4000-8000-000000000041', '0e000000-0000-4000-8000-000000000011', '0e000000-0000-4000-8000-0000000000bb',
   'system.go_live', 'owner_decides', 'Make the client website live', 'Goes live', 'Stays private', 'system_release', 'orr-release',
   repeat('c', 64), false, now() + interval '3 days');

create temporary table or_read on commit drop as
  select public.read_agency_client_owner_reach('0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000001',
    'boss@orr-agency.example.test', array[(select florist from or_ids), '0e000000-0000-4000-8000-000000000011', gen_random_uuid()]) as body;
select pg_temp.or_assert(jsonb_array_length((select body from or_read)) = 2, 'an unreadable workspace is skipped');
select pg_temp.or_assert((select body::text from or_read) !~ '@', 'no address anywhere in the agency read');
select pg_temp.or_assert((select e->>'contact' from or_read, jsonb_array_elements(body) e where e->>'workspaceId' = '0e000000-0000-4000-8000-000000000011') = 'trusted_staff', 'staff-trusted contact');
select pg_temp.or_assert((select e->>'contact' from or_read, jsonb_array_elements(body) e where e->>'workspaceId' = (select florist::text from or_ids)) = 'none', 'added client has no contact');
select pg_temp.or_assert((select e->'invite'->>'kind' = 'agency_claim' and e->'invite'->>'deliveryStatus' = 'not_sent'
    and (e->'invite'->>'recipientStaff')::boolean = false and (e->>'canIssueClaim')::boolean
  from or_read, jsonb_array_elements(body) e where e->>'workspaceId' = (select florist::text from or_ids)), 'pending claim, issuable');
select pg_temp.or_assert((select (e->>'canIssueClaim')::boolean = false from or_read, jsonb_array_elements(body) e where e->>'workspaceId' = '0e000000-0000-4000-8000-000000000011'), 'converted client cannot take a claim');
select pg_temp.or_assert((select jsonb_array_length(e->'decisions') = 1 and e->'decisions'->0->>'expiresAt' is not null
  from or_read, jsonb_array_elements(body) e where e->>'workspaceId' = '0e000000-0000-4000-8000-000000000011'), 'open owner decision has a lapse time');
-- Another agency's staff cannot read this agency's clients.
select pg_temp.or_assert(jsonb_array_length(public.read_agency_client_owner_reach('0e000000-0000-4000-8000-000000000030', '0e000000-0000-4000-8000-000000000003',
  'other@orr-other.example.test', array['0e000000-0000-4000-8000-000000000011']::uuid[])) = 0, 'another agency sees nothing');
select pg_temp.or_expect($$select public.read_agency_client_owner_reach('0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000003',
  'other@orr-other.example.test', array['0e000000-0000-4000-8000-000000000011']::uuid[])$$, 'agency_client_access_denied');
select pg_temp.or_expect($$select public.read_agency_client_owner_reach('0e000000-0000-4000-8000-000000000020', '0e000000-0000-4000-8000-000000000001',
  'wrong@orr-agency.example.test', array['0e000000-0000-4000-8000-000000000011']::uuid[])$$, 'agency_client_access_denied');

-- Operator report: operators only; carries the staff reason.
select pg_temp.or_expect($$select public.operator_owner_reach_report('0e000000-0000-4000-8000-000000000001', 'boss@orr-agency.example.test')$$, 'workspace_release_operator_required');
select pg_temp.or_assert((select e->'trusted'->>'staffReason' = 'agency_member' and (e->>'openDecisions')::int = 1 and e->>'soonestLapse' is not null
  from jsonb_array_elements(public.operator_owner_reach_report('0e000000-0000-4000-8000-000000000002', 'op@orr-platform.example.test')) e
  where e->>'workspaceId' = '0e000000-0000-4000-8000-000000000011'), 'operator report names the staff contact and the lapse');
select pg_temp.or_assert((select e->'invite'->>'kind' = 'agency_claim'
  from jsonb_array_elements(public.operator_owner_reach_report('0e000000-0000-4000-8000-000000000002', 'op@orr-platform.example.test')) e
  where e->>'workspaceId' = (select florist::text from or_ids)), 'operator report shows the pending claim');
rollback;
