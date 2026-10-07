\set ON_ERROR_STOP on
-- The neutral service actor (20261009153000_platform_service_actor.sql), on
-- fictional rows: a session exists only for a business whose active provider
-- of record is verified for the purpose's effect, for Strelva's agency and an
-- outside agency alike; it reads as the owner, else a direct admin, else the
-- provider's staffed seat holder; and it logs the provider it served.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.pa_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'platform service actor assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.pa_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.pa_item(p_source text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'running.approve', 'route', 'owner_decides', 'title', 'Keep replying to reviews',
    'approveEffect', 'Your agency keeps doing this.', 'notYetEffect', 'Nothing runs.', 'sourceLifecycle', 'standing_responsibility',
    'sourceId', p_source, 'revisionHash', repeat('d', 64), 'urgent', false, 'adminMayDecide', true)
$$;
create or replace function pg_temp.pa_plan(p_source text) returns jsonb language sql as $$
  select jsonb_build_object('kind', 'system.change_live', 'route', 'owner_decides', 'title', 'Make it live: A rebuilt website',
    'approveEffect', 'It goes live one step at a time.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'make_real',
    'sourceId', p_source, 'revisionHash', repeat('e', 64), 'urgent', false, 'adminMayDecide', false)
$$;

select pg_temp.pa_assert(
  has_function_privilege('service_role', 'public.platform_serves_business(uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.strelva_service_reader(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.platform_serves_business(uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.platform_serving_provider(uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.platform_service_identity(uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.strelva_runs_business(uuid)', 'execute'),
  'service-role entry points only');
select pg_temp.pa_assert(public.platform_service_effect('needs_you_sync') = 'email'
  and public.platform_service_effect('make_real_resume') = 'publish'
  and public.platform_service_effect('make_real_link') = 'publish', 'purpose to effect');

insert into public.users(id, email, verified_at) values
  ('6c000000-0000-4000-8000-000000000001', 'pa-operator@strelva.example.test', now()),
  ('6c000000-0000-4000-8000-000000000002', 'pa-north-owner@north.example.test', now()),
  ('6c000000-0000-4000-8000-000000000003', 'pa-north-staff@north.example.test', now()),
  ('6c000000-0000-4000-8000-000000000004', 'pa-client-owner@example.test', null),
  ('6c000000-0000-4000-8000-000000000005', 'pa-unverified-agency@else.example.test', now());
insert into public.super_admins(user_id, email) values ('6c000000-0000-4000-8000-000000000001', 'pa-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('6c000000-0000-4000-8000-000000000020', 'agency', 'Strelva agency fixture', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000030', 'agency', 'Northside Web', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000040', 'agency', 'Unverified Agency', '6c000000-0000-4000-8000-000000000005'),
  ('6c000000-0000-4000-8000-000000000010', 'customer', 'Converted Strelva client', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000011', 'customer', 'Northside client', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000012', 'customer', 'Unverified agency client', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000013', 'customer', 'No provider', '6c000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('6c000000-0000-4000-8000-000000000020', '6c000000-0000-4000-8000-000000000001', 'owner', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000002', 'owner', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000003', 'member', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000040', '6c000000-0000-4000-8000-000000000005', 'owner', '6c000000-0000-4000-8000-000000000005'),
  -- Converted today: the operator holds admin (the pre-7A conversion path).
  ('6c000000-0000-4000-8000-000000000010', '6c000000-0000-4000-8000-000000000001', 'admin', '6c000000-0000-4000-8000-000000000001'),
  -- The Northside client's owner exists but never verified (never signed in).
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000004', 'owner', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000005', 'admin', '6c000000-0000-4000-8000-000000000005'),
  ('6c000000-0000-4000-8000-000000000013', '6c000000-0000-4000-8000-000000000001', 'admin', '6c000000-0000-4000-8000-000000000001');
select public.designate_strelva_agency_workspace('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000020');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('pa-fixture-site', '6c000000-0000-4000-8000-0000000000a1', 'Platform Actor Fixture', true, 'pa-tenant-owner@example.test');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('6c000000-0000-4000-8000-0000000000a1', 'pa-fixture-site', '6c000000-0000-4000-8000-000000000010',
    '6c000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-0000000000b1', repeat('a', 64), '{}'::jsonb);
-- Outside providers by the owner's ordinary choice (provider row + seat). The
-- unverified owner cannot choose, so these fixture rows are written directly.
insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by) values
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000030', 'business_choice', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000040', 'business_choice', '6c000000-0000-4000-8000-000000000005');
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000030', 'owner', '6c000000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000003', '6c000000-0000-4000-8000-000000000002');
select pg_temp.pa_assert((select provider_workspace_id from public.workspace_providers
  where customer_workspace_id = '6c000000-0000-4000-8000-000000000010' and status = 'active') = '6c000000-0000-4000-8000-000000000020',
  'conversion still marks Strelva as provider of record');

-- Nobody is verified yet: nobody is served, Strelva's agency included.
select pg_temp.pa_assert(public.strelva_service_reader(w, 'needs_you_sync') is null and not public.strelva_runs_business(w), 'unverified: no session')
  from unnest(array['6c000000-0000-4000-8000-000000000010', '6c000000-0000-4000-8000-000000000011',
    '6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000013']::uuid[]) w;
select pg_temp.pa_assert(not exists (select 1 from public.strelva_service_actions
  where workspace_id::text like '6c000000-%'), 'a refused session logs nothing');

-- Verify Strelva's agency and Northside for email through the same record.
select public.record_agency_verification('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000020',
  'email', 'verified', '{"note":"fixture"}', null);
select public.record_agency_verification('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000030',
  'email', 'verified', '{"note":"fixture"}', null);

create temporary table pa_sessions(name text primary key, body jsonb) on commit drop;
insert into pa_sessions values
  ('strelva', public.strelva_service_reader('6c000000-0000-4000-8000-000000000010', 'needs_you_sync')),
  ('north', public.strelva_service_reader('6c000000-0000-4000-8000-000000000011', 'needs_you_sync')),
  ('unverified', public.strelva_service_reader('6c000000-0000-4000-8000-000000000012', 'needs_you_sync')),
  ('none', public.strelva_service_reader('6c000000-0000-4000-8000-000000000013', 'needs_you_sync')),
  ('north-resume', public.strelva_service_reader('6c000000-0000-4000-8000-000000000011', 'make_real_resume'));

-- Strelva's agency, once verified: today's behavior (reads as the operator's admin membership).
select pg_temp.pa_assert((select body->>'userId' = '6c000000-0000-4000-8000-000000000001' and body->>'role' = 'admin'
  and body->>'providerWorkspaceId' = '6c000000-0000-4000-8000-000000000020' and body->>'label' = 'Strelva (system)'
  from pa_sessions where name = 'strelva'), 'Strelva agency client served as before once verified');
-- An outside verified agency: same promise; reads as its staffed seat holder because the owner never signed in.
select pg_temp.pa_assert((select body->>'userId' = '6c000000-0000-4000-8000-000000000003' and body->>'role' = 'admin'
  and body->>'providerWorkspaceId' = '6c000000-0000-4000-8000-000000000030'
  from pa_sessions where name = 'north'), 'outside agency client served, via the seat');
select pg_temp.pa_assert((select body is null from pa_sessions where name = 'unverified'), 'unverified agency: no session');
select pg_temp.pa_assert((select body is null from pa_sessions where name = 'none'), 'no provider of record: no session');
select pg_temp.pa_assert((select body is null from pa_sessions where name = 'north-resume'), 'verified for email is not publish');
select pg_temp.pa_assert(public.strelva_runs_business('6c000000-0000-4000-8000-000000000011')
  and not public.strelva_runs_business('6c000000-0000-4000-8000-000000000012'), 'the old name answers the neutral rule');
select pg_temp.pa_assert((select provider_workspace_id from public.strelva_service_actions
  where id = (select (body->>'sessionId')::uuid from pa_sessions where name = 'north')) = '6c000000-0000-4000-8000-000000000030',
  'the session logs the provider it served');

-- The session opens an item for the outside agency's client exactly as for Strelva's.
select pg_temp.pa_assert((public.open_owner_decision_as_service('6c000000-0000-4000-8000-000000000011',
  (select (body->>'sessionId')::uuid from pa_sessions where name = 'north'), pg_temp.pa_item('north-standing'))->>'openedBy') = 'Strelva (system)',
  'opened under the neutral session');

-- Make real by owner link follows publish, for every agency alike.
create temporary table pa_items(name text primary key, id uuid) on commit drop;
insert into pa_items values ('plan', (public.open_owner_decision('6c000000-0000-4000-8000-000000000010',
  pg_temp.pa_plan('website-rebuild:pa1@1'))->>'id')::uuid);
select pg_temp.pa_assert(public.strelva_make_real_link_session('6c000000-0000-4000-8000-000000000010',
  (select id from pa_items where name = 'plan'), 'pa-tenant-owner@example.test') is null, 'no publish verification: no link session');
select public.record_agency_verification('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000020',
  'publish', 'verified', '{"note":"fixture"}', null);
select pg_temp.pa_assert((public.strelva_make_real_link_session('6c000000-0000-4000-8000-000000000010',
  (select id from pa_items where name = 'plan'), 'pa-tenant-owner@example.test')->>'providerWorkspaceId') = '6c000000-0000-4000-8000-000000000020',
  'verified for publish: link session names the provider');

-- Revoking a verification stops new sessions.
select public.record_agency_verification('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000030',
  'email', 'unverified', '{}', 'Fixture revocation.');
select pg_temp.pa_assert(public.strelva_service_reader('6c000000-0000-4000-8000-000000000011', 'needs_you_sync') is null, 'revoked: no session');

-- Ending the seat leaves no identity to read as when the owner never signed in.
select public.record_agency_verification('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000030',
  'email', 'verified', '{"note":"fixture again"}', null);
update public.provider_seats set status = 'ended', ended_by = '6c000000-0000-4000-8000-000000000002', ended_at = clock_timestamp()
  where customer_workspace_id = '6c000000-0000-4000-8000-000000000011';
select pg_temp.pa_assert(public.strelva_service_reader('6c000000-0000-4000-8000-000000000011', 'needs_you_sync') is null,
  'no owner account, no seat: no session');

rollback;
