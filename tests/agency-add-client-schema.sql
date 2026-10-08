\set ON_ERROR_STOP on
-- An agency adds a client (20261015100000_agency_add_client.sql, #259), on
-- fictional rows: the business is created with no direct membership, the
-- agency reaches it only through its provider seat and the actor's staff
-- row, facts stay unconfirmed, another agency sees nothing, abuse limits
-- hold, a replay uses no quota, and the owner claim link makes its verified
-- recipient the owner while the agency still serves the business.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.ac_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency add client assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ac_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ac_role(p_workspace uuid, p_user uuid, p_email text) returns text language plpgsql as $$
begin
  return public.business_record_assert_actor(p_workspace, p_user, p_email, false);
exception when others then return sqlerrm;
end; $$;

-- Privileges: RLS on, no table access, service-role commands only.
select pg_temp.ac_assert((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.agency_client_additions'::regclass, 'public.agency_client_add_quota'::regclass, 'public.agency_client_owner_claims'::regclass)), 'rls on');
select pg_temp.ac_assert(not has_table_privilege('service_role', 'public.agency_client_additions', 'select')
  and not has_table_privilege('authenticated', 'public.agency_client_owner_claims', 'select')
  and not has_table_privilege('anon', 'public.agency_client_add_quota', 'insert'), 'no table privileges');
select pg_temp.ac_assert(
  has_function_privilege('service_role', 'public.agency_add_client(uuid,text,uuid,jsonb,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.issue_agency_client_owner_claim(uuid,text,uuid,uuid,text,text,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.accept_agency_client_owner_claim(text,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_client_owner_claim(text)', 'execute')
  and has_function_privilege('service_role', 'public.list_agency_client_additions(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.agency_add_client(uuid,text,uuid,jsonb,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.accept_agency_client_owner_claim(text,uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.agency_client_assert_actor(uuid,text,uuid)', 'execute'),
  'only service_role runs the commands');

insert into public.users(id, email, verified_at) values
  ('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test', now()),
  ('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test', now()),
  ('ac000000-0000-4000-8000-000000000003', 'ac-a-member@agency-a.example.test', now()),
  ('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test', now()),
  ('ac000000-0000-4000-8000-000000000005', 'ac-stranger@example.test', now()),
  ('ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test', now()),
  ('ac000000-0000-4000-8000-000000000007', 'ac-unverified@agency-a.example.test', null),
  ('ac000000-0000-4000-8000-000000000008', 'someone-else@ac-bakery.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('ac000000-0000-4000-8000-000000000020', 'agency', 'Agency A', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000030', 'agency', 'Agency B', 'ac000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000001', 'owner', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000002', 'admin', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000003', 'member', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000020', 'ac000000-0000-4000-8000-000000000007', 'admin', 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000030', 'ac000000-0000-4000-8000-000000000004', 'owner', 'ac000000-0000-4000-8000-000000000004');
insert into public.agency_prospecting_profiles(workspace_id, slug, contact_url, contact_email, enabled) values
  ('ac000000-0000-4000-8000-000000000020', 'ac-agency-a', 'https://agency-a.example.test/contact', 'hello@agency-a.example.test', true),
  ('ac000000-0000-4000-8000-000000000030', 'ac-agency-b', 'https://agency-b.example.test/contact', 'hello@agency-b.example.test', true);
insert into public.prospects(id, agency_workspace_id, source, result_id, name, email, url, business, score, grade) values
  ('ac000000-0000-4000-8000-0000000000a1', 'ac000000-0000-4000-8000-000000000020', 'audit', 'r-1', 'Pat Baker', 'owner@ac-bakery.example.test',
    'https://ac-bakery.example.test', 'AC Bakery', 61, 'C'),
  ('ac000000-0000-4000-8000-0000000000b1', 'ac000000-0000-4000-8000-000000000030', 'audit', 'r-2', 'Lee Plumber', 'lee@ac-plumbing.example.test',
    'https://ac-plumbing.example.test', 'AC Plumbing', 40, 'D');

create temporary table ac_results(name text primary key, body jsonb) on commit drop;
-- add(name, actor, email, agency, input, command, digest)
create or replace function pg_temp.ac_add(p_user uuid, p_email text, p_agency uuid, p_input jsonb, p_command uuid, p_digest text) returns jsonb
language sql as $$
  select public.agency_add_client(p_user, p_email, p_agency, p_input, p_command, p_digest)
$$;

-- Who may add: an owner or admin of the agency, verified, with their own email.
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000003', 'ac-a-member@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope"}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_access_denied');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope"}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_access_denied');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000005', 'ac-stranger@example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope"}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_access_denied');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000007', 'ac-unverified@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope"}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_access_denied');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'not-me@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope"}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_access_denied');
-- Input: the agency can never confirm a fact or set the owner's address.
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope","facts":{"phone":{"value":"716-555-0100","verified":true}}}', gen_random_uuid(), repeat('a', 64))$$,
  'agency_client_invalid');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope","facts":{"owner_recipient":{"value":{"email":"me@agency-a.example.test"}}}}', gen_random_uuid(), repeat('a', 64))$$,
  'agency_client_invalid');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Nope","sourceUrl":"javascript:alert(1)"}', gen_random_uuid(), repeat('a', 64))$$,
  'agency_client_invalid');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"  "}', gen_random_uuid(), repeat('a', 64))$$, 'agency_client_invalid');
select pg_temp.ac_assert(not exists (select 1 from public.agency_client_additions) and not exists (select 1 from public.agency_client_add_quota),
  'refused adds leave nothing behind');

-- From a URL: the agency admin adds AC Florist with scanned facts.
insert into ac_results values ('florist', pg_temp.ac_add('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020',
  '{"name":"AC Florist","sourceUrl":"https://ac-florist.example.test/","facts":{"phone":{"value":"(716) 555-0142"},"email":{"value":"hello@ac-florist.example.test"},"address":{"value":{"formatted":"12 Elm St, Buffalo, NY"}}}}',
  'ac000000-0000-4000-8000-0000000000c1', repeat('1', 64)));
select pg_temp.ac_assert((select body->>'replayed' from ac_results where name = 'florist') = 'false'
  and (select body->>'sourceKind' from ac_results where name = 'florist') = 'url'
  and (select (body->>'factsSeeded')::int from ac_results where name = 'florist') = 5, 'florist receipt');
create temporary table ac_ids on commit drop as
  select (select (body->>'customerWorkspaceId')::uuid from ac_results where name = 'florist') as florist;
select pg_temp.ac_assert((select kind = 'customer' and name = 'AC Florist' and created_by = 'ac000000-0000-4000-8000-000000000002'
  from public.workspaces where id = (select florist from ac_ids)), 'business workspace');
-- The seat, not admin membership: nobody is a direct member of the business.
select pg_temp.ac_assert(not exists (select 1 from public.workspace_memberships where workspace_id = (select florist from ac_ids)),
  'no direct membership at all');
select pg_temp.ac_assert(exists (select 1 from public.workspace_providers where customer_workspace_id = (select florist from ac_ids)
  and provider_workspace_id = 'ac000000-0000-4000-8000-000000000020' and source = 'agency_added' and status = 'active'), 'provider of record');
select pg_temp.ac_assert(exists (select 1 from public.provider_seats where customer_workspace_id = (select florist from ac_ids)
  and agency_workspace_id = 'ac000000-0000-4000-8000-000000000020' and granted_by_kind = 'agency_added' and status = 'active'), 'provider seat');
select pg_temp.ac_assert((select array_agg(user_id) from public.agency_client_staff where customer_workspace_id = (select florist from ac_ids)
  and status = 'active') = array['ac000000-0000-4000-8000-000000000002'::uuid], 'acting staff assigned, only them');
-- Every seeded fact is the agency's and unconfirmed; the URL became the website link.
select pg_temp.ac_assert((select count(*) from public.business_record_facts where workspace_id = (select florist from ac_ids)) = 5
  and not exists (select 1 from public.business_record_facts where workspace_id = (select florist from ac_ids) and (verified or source <> 'agency')),
  'facts unconfirmed, source agency');
select pg_temp.ac_assert((select value from public.business_record_facts where workspace_id = (select florist from ac_ids) and fact_key = 'links')
  = '[{"kind":"website","url":"https://ac-florist.example.test/"}]'::jsonb
  and (select value #>> '{}' from public.business_record_facts where workspace_id = (select florist from ac_ids) and fact_key = 'display_name') = 'AC Florist',
  'name and website link');
select pg_temp.ac_assert((select actor_kind = 'agency' and source = 'agency' from public.business_record_revisions
  where workspace_id = (select florist from ac_ids) and sequence = 1), 'revision names the agency');

-- Access resolves through the seat for the staffed person only; agency B and strangers see nothing.
select pg_temp.ac_assert(pg_temp.ac_role((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test') = 'admin',
  'staffed admin reaches the client');
select pg_temp.ac_assert(pg_temp.ac_role((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test') = 'business_record_access_denied',
  'unstaffed agency owner does not');
select pg_temp.ac_assert(pg_temp.ac_role((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test') = 'business_record_access_denied',
  'other agency does not');
select pg_temp.ac_assert(pg_temp.ac_role((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000005', 'ac-stranger@example.test') = 'business_record_access_denied',
  'stranger does not');
select pg_temp.ac_assert(public.list_provided_clients('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020') @> jsonb_build_array(jsonb_build_object('customerWorkspaceId', (select florist from ac_ids),
  'access', 'provider_seat', 'source', 'agency_added')), 'agency A lists it');
select pg_temp.ac_assert(public.list_provided_clients('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000030') = '[]'::jsonb
  and public.read_agency_provider_seats('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000030') = '[]'::jsonb, 'agency B lists nothing');
select pg_temp.ac_expect($$select public.list_agency_client_additions('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000020')$$, 'agency_client_access_denied');
select pg_temp.ac_assert(jsonb_array_length(public.list_agency_client_additions('ac000000-0000-4000-8000-000000000003', 'ac-a-member@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020')) = 1, 'any agency A member reads its additions');
-- Connecting the existing site works for the staffed seat holder, not for agency B.
select pg_temp.ac_assert(public.connected_site_assert_actor((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000002',
  'ac-a-admin@agency-a.example.test', true) = 'admin', 'seat holder may connect the site');
select pg_temp.ac_expect($$select public.connected_site_assert_actor((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000004',
  'ac-b-owner@agency-b.example.test', false)$$, 'workspace_access_denied');
-- With no owner ever signing in, the platform serves the business through
-- its provider of record once that agency is verified for the effect, never before.
select pg_temp.ac_assert(public.platform_serving_provider((select florist from ac_ids), 'email') is null, 'unverified agency: not served');
insert into public.agency_verifications(agency_workspace_id, effect, status, evidence, verified_by, verifier_is_agency_member)
  values ('ac000000-0000-4000-8000-000000000020', 'email', 'verified', '{"fixture":true}', 'ac000000-0000-4000-8000-000000000005', false);
select pg_temp.ac_assert(public.platform_serving_provider((select florist from ac_ids), 'email') = 'ac000000-0000-4000-8000-000000000020'
  and (select user_id from public.platform_service_identity((select florist from ac_ids), 'ac000000-0000-4000-8000-000000000020'))
    = 'ac000000-0000-4000-8000-000000000002', 'verified agency: served, as its staff member');

-- Replay: same command, same receipt, no quota used. Same command, other input: conflict.
select pg_temp.ac_assert((select additions from public.agency_client_add_quota where agency_workspace_id = 'ac000000-0000-4000-8000-000000000020') = 1, 'one addition counted');
select pg_temp.ac_assert((pg_temp.ac_add('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"AC Florist"}', 'ac000000-0000-4000-8000-0000000000c1', repeat('1', 64))
  ->> 'customerWorkspaceId')::uuid = (select florist from ac_ids), 'replay returns the same business');
select pg_temp.ac_assert((select additions from public.agency_client_add_quota where agency_workspace_id = 'ac000000-0000-4000-8000-000000000020') = 1
  and (select count(*) from public.agency_client_additions) = 1, 'replay used no quota');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Other"}', 'ac000000-0000-4000-8000-0000000000c1', repeat('2', 64))$$, 'agency_client_idempotency_conflict');

-- From a prospect: only the agency's own, and only once.
insert into ac_results values ('bakery', pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"AC Bakery","sourceUrl":"https://ac-bakery.example.test","prospectId":"ac000000-0000-4000-8000-0000000000a1"}',
  'ac000000-0000-4000-8000-0000000000c2', repeat('3', 64)));
select pg_temp.ac_assert((select body->>'sourceKind' = 'prospect' and body->>'prospectId' = 'ac000000-0000-4000-8000-0000000000a1'
  from ac_results where name = 'bakery'), 'prospect receipt');
alter table ac_ids add column bakery uuid;
update ac_ids set bakery = (select (body->>'customerWorkspaceId')::uuid from ac_results where name = 'bakery');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"AC Bakery again","prospectId":"ac000000-0000-4000-8000-0000000000a1"}', gen_random_uuid(), repeat('4', 64))$$,
  'agency_client_prospect_added');
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"AC Plumbing","prospectId":"ac000000-0000-4000-8000-0000000000b1"}', gen_random_uuid(), repeat('4', 64))$$,
  'agency_client_prospect_not_found');

-- Abuse limits: the daily quota, then the businesses still waiting for an owner.
update public.agency_client_add_quota set additions = (select daily from public.agency_client_add_limits())
  where agency_workspace_id = 'ac000000-0000-4000-8000-000000000020';
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Over the day"}', gen_random_uuid(), repeat('5', 64))$$, 'agency_client_daily_limit');
select pg_temp.ac_assert(not exists (select 1 from public.workspaces where name = 'Over the day'), 'refused add created no business');
update public.agency_client_add_quota set additions = 2 where agency_workspace_id = 'ac000000-0000-4000-8000-000000000020';
create or replace function public.agency_client_add_limits(out daily integer, out waiting_for_owner integer)
language sql immutable set search_path = public, pg_temp as $$ select 25, 2 $$;
select pg_temp.ac_expect($$select pg_temp.ac_add('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', '{"name":"Too many waiting"}', gen_random_uuid(), repeat('6', 64))$$, 'agency_client_waiting_limit');
create or replace function public.agency_client_add_limits(out daily integer, out waiting_for_owner integer)
language sql immutable set search_path = public, pg_temp as $$ select 25, 100 $$;
-- Agency B's quota is its own.
insert into ac_results values ('plumbing', pg_temp.ac_add('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000030', '{"name":"AC Plumbing","prospectId":"ac000000-0000-4000-8000-0000000000b1"}',
  'ac000000-0000-4000-8000-0000000000c3', repeat('7', 64)));
select pg_temp.ac_assert(pg_temp.ac_role((select (body->>'customerWorkspaceId')::uuid from ac_results where name = 'plumbing'),
  'ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test') = 'business_record_access_denied', 'agency A cannot reach B''s client');

-- Unclaimed agency clients do not use the acting person's workspace cap.
insert into ac_results select 'extra-' || n, pg_temp.ac_add('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', jsonb_build_object('name', 'Extra ' || n), gen_random_uuid(), repeat('8', 64))
  from generate_series(1, 5) n;
select pg_temp.ac_assert((select count(*) from public.workspaces where created_by = 'ac000000-0000-4000-8000-000000000002') = 6, 'admin created six');
select pg_temp.ac_assert((select kind from public.create_owned_workspace('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'agency', 'Admin side agency')) = 'agency', 'cap ignores added clients');

-- Owner claim: only the adding agency's owner/admin issues it, nothing is sent.
select pg_temp.ac_expect($$select public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000003', 'ac-a-member@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select bakery from ac_ids), 'owner@ac-bakery.example.test', repeat('b', 64), now() + interval '14 days')$$,
  'agency_client_access_denied');
select pg_temp.ac_expect($$select public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000004', 'ac-b-owner@agency-b.example.test',
  'ac000000-0000-4000-8000-000000000030', (select bakery from ac_ids), 'owner@ac-bakery.example.test', repeat('b', 64), now() + interval '14 days')$$,
  'agency_client_access_denied');
select pg_temp.ac_expect($$select public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select bakery from ac_ids), 'owner@ac-bakery.example.test', repeat('b', 64), now() + interval '60 days')$$,
  'agency_client_claim_invalid');
insert into ac_results values ('claim-1', public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select bakery from ac_ids), ' Owner@AC-Bakery.example.test ', repeat('b', 64), now() + interval '14 days'));
select pg_temp.ac_assert((select body->'delivery' = '{"status":"not_sent","reason":"gated","decision":"R08","agencyEmailVerified":true}'::jsonb
  and body->>'recipientEmail' = 'owner@ac-bakery.example.test' and body->>'replacedPending' = 'false' from ac_results where name = 'claim-1'),
  'recorded not sent: gated, with the agency email gate');
-- Reissuing replaces the pending link.
insert into ac_results values ('claim-2', public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select bakery from ac_ids), 'owner@ac-bakery.example.test', repeat('c', 64), now() + interval '14 days'));
select pg_temp.ac_assert((select body->>'replacedPending' = 'true' from ac_results where name = 'claim-2')
  and (select status from public.agency_client_owner_claims where token_hash = repeat('b', 64)) = 'revoked', 'old link revoked');
select pg_temp.ac_assert(public.read_agency_client_owner_claim(repeat('c', 64)) @> '{"workspaceName":"AC Bakery","agencyName":"Agency A","status":"pending"}'::jsonb,
  'claim preview');
select pg_temp.ac_expect($$select public.read_agency_client_owner_claim(repeat('d', 64))$$, 'agency_client_claim_not_found');

-- Accepting: the verified account with the claimed address, nobody else.
select pg_temp.ac_expect($$select public.accept_agency_client_owner_claim(repeat('c', 64), 'ac000000-0000-4000-8000-000000000008', 'someone-else@ac-bakery.example.test')$$,
  'agency_client_claim_recipient_mismatch');
select pg_temp.ac_expect($$select public.accept_agency_client_owner_claim(repeat('c', 64), 'ac000000-0000-4000-8000-000000000006', 'wrong@ac-bakery.example.test')$$,
  'agency_client_claim_identity_required');
select pg_temp.ac_assert(public.accept_agency_client_owner_claim(repeat('b', 64), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test')->>'status'
  = 'revoked', 'a replaced link grants nothing');
select pg_temp.ac_assert(public.accept_agency_client_owner_claim(repeat('c', 64), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test')
  @> '{"status":"accepted","alreadyAccepted":false,"workspaceName":"AC Bakery"}'::jsonb, 'owner accepted');
select pg_temp.ac_assert((select role from public.workspace_memberships where workspace_id = (select bakery from ac_ids)
  and user_id = 'ac000000-0000-4000-8000-000000000006') = 'owner'
  and (select count(*) from public.workspace_memberships where workspace_id = (select bakery from ac_ids)) = 1, 'only the owner is a member');
select pg_temp.ac_assert(public.accept_agency_client_owner_claim(repeat('c', 64), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test')
  @> '{"status":"accepted","alreadyAccepted":true}'::jsonb, 'accept replays');
-- The agency keeps its seat; the owner can now end it. No new link once owned.
select pg_temp.ac_assert(pg_temp.ac_role((select bakery from ac_ids), 'ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test') = 'admin'
  and pg_temp.ac_role((select bakery from ac_ids), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test') = 'owner', 'seat stays, owner owns');
select pg_temp.ac_expect($$select public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select bakery from ac_ids), 'owner@ac-bakery.example.test', repeat('e', 64), now() + interval '14 days')$$,
  'agency_client_owner_exists');
select pg_temp.ac_assert((public.end_provider_seat('ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test', (select bakery from ac_ids),
  'ac000000-0000-4000-8000-000000000020', null)->>'ended')::boolean, 'owner ends the agency seat');
select pg_temp.ac_assert(pg_temp.ac_role((select bakery from ac_ids), 'ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test')
  = 'business_record_access_denied', 'agency access ends with its seat');

-- The offer stands only while the agency still holds the seat.
insert into ac_results values ('claim-florist', public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select florist from ac_ids), 'owner@ac-bakery.example.test', repeat('f', 64), now() + interval '14 days'));
select pg_temp.ac_assert((public.end_provider_seat('ac000000-0000-4000-8000-000000000001', 'ac-a-owner@agency-a.example.test', (select florist from ac_ids),
  'ac000000-0000-4000-8000-000000000020', 'Stepping back')->>'ended')::boolean, 'agency steps back');
select pg_temp.ac_expect($$select public.accept_agency_client_owner_claim(repeat('f', 64), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test')$$,
  'agency_client_claim_sponsor_invalid');
select pg_temp.ac_assert(not exists (select 1 from public.workspace_memberships where workspace_id = (select florist from ac_ids)), 'no owner written');

-- An expired link grants nothing.
insert into ac_results values ('claim-extra', public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000002', 'ac-a-admin@agency-a.example.test',
  'ac000000-0000-4000-8000-000000000020', (select (body->>'customerWorkspaceId')::uuid from ac_results where name = 'extra-1'),
  'owner@ac-bakery.example.test', repeat('9', 64), clock_timestamp() + interval '400 milliseconds'));
select pg_sleep(0.5);
select pg_temp.ac_assert(public.read_agency_client_owner_claim(repeat('9', 64))->>'status' = 'expired'
  and public.accept_agency_client_owner_claim(repeat('9', 64), 'ac000000-0000-4000-8000-000000000006', 'owner@ac-bakery.example.test')->>'status' = 'expired',
  'expired link');

-- History is kept: receipts and claims do not change.
select pg_temp.ac_expect($$update public.agency_client_additions set source_url = null$$, 'agency_client_addition_immutable');
select pg_temp.ac_expect($$delete from public.agency_client_additions$$, 'agency_client_addition_immutable');
select pg_temp.ac_expect($$update public.agency_client_owner_claims set recipient_email = 'x@example.test'$$, 'agency_client_owner_claim_immutable');
select pg_temp.ac_expect($$update public.agency_client_owner_claims set status = 'pending' where status = 'accepted'$$, 'agency_client_owner_claim_immutable');

-- A creator who claims these clients owns them directly: both creation
-- commands must count those businesses toward the existing five-workspace cap.
do $$
declare r record; token_hash text;
begin
  for r in select name,(body->>'customerWorkspaceId')::uuid as id from ac_results where name in ('extra-1','extra-2','extra-3','extra-4') loop
    token_hash := md5(r.name)||md5(r.name);
    perform public.issue_agency_client_owner_claim('ac000000-0000-4000-8000-000000000002','ac-a-admin@agency-a.example.test',
      'ac000000-0000-4000-8000-000000000020',r.id,'ac-a-admin@agency-a.example.test',token_hash,now()+interval '1 hour');
    perform public.accept_agency_client_owner_claim(token_hash,'ac000000-0000-4000-8000-000000000002','ac-a-admin@agency-a.example.test');
  end loop;
end $$;
select pg_temp.ac_expect($$select public.create_owned_workspace('ac000000-0000-4000-8000-000000000002','ac-a-admin@agency-a.example.test',
  'agency','Over claimed owner cap')$$,'workspace_limit_reached');
select pg_temp.ac_expect($$select public.enter_customer_business('ac000000-0000-4000-8000-000000000002','ac-a-admin@agency-a.example.test',
  'Over claimed owner cap',null,null,gen_random_uuid(),repeat('b',64))$$,'workspace_limit_reached');
select pg_temp.ac_assert(has_function_privilege('service_role','public.authorize_agency_client_add(uuid,text,uuid)','execute')
  and not has_function_privilege('authenticated','public.authorize_agency_client_add(uuid,text,uuid)','execute')
  and not has_function_privilege('anon','public.authorize_agency_client_add(uuid,text,uuid)','execute'),'admission is service only');

rollback;
\echo 'Agency add client SQL contract passed.'
