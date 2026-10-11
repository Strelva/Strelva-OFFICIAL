\set ON_ERROR_STOP on
-- Agency signup (#258): open signup creates an agency through the ordinary
-- create_owned_workspace path, and that grants nothing outside the agency's
-- own workspace. One owner membership; no seat, provider row, client staff,
-- delegation, designation or verification; every effect unverified. The
-- per-person cap and the identity check hold. Only members read the agency's
-- verification. Fictional rows, inside a transaction that is rolled back.
begin;
create or replace function pg_temp.as_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency signup assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.as_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

insert into public.users(id, email, verified_at) values
  ('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', now()),
  ('5a000000-0000-4000-8000-000000000002', 'as-unverified@northside.example.test', null),
  ('5a000000-0000-4000-8000-000000000003', 'as-business-owner@example.test', now());
-- An existing business elsewhere on the platform, owned by someone else.
insert into public.workspaces(id, kind, name, created_by) values
  ('5a000000-0000-4000-8000-000000000030', 'customer', 'Lakeview Bakery', '5a000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5a000000-0000-4000-8000-000000000030', '5a000000-0000-4000-8000-000000000003', 'owner', '5a000000-0000-4000-8000-000000000003');

create temp table as_before on commit drop as select
  (select count(*) from public.workspace_memberships) memberships,
  (select count(*) from public.provider_seats) seats,
  (select count(*) from public.workspace_providers) providers,
  (select count(*) from public.agency_client_staff) staff,
  (select count(*) from public.workspace_delegations) delegations,
  (select count(*) from public.agency_verifications) verifications,
  (select count(*) from public.platform_workspaces) designations;

create temp table as_agency on commit drop as
  select id from public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'AS-Freelancer@Northside.example.test', 'agency', '  Northside Web Care  ');

select pg_temp.as_assert((select count(*) = 1 from as_agency), 'one agency created');
select pg_temp.as_assert((select kind = 'agency' and name = 'Northside Web Care' and created_by = '5a000000-0000-4000-8000-000000000001'
  from public.workspaces where id = (select id from as_agency)), 'agency row, trimmed name, creator');
select pg_temp.as_assert((select count(*) = 1 and bool_and(user_id = '5a000000-0000-4000-8000-000000000001' and role = 'owner')
  from public.workspace_memberships where workspace_id = (select id from as_agency)), 'only the creator, as owner');

-- Nothing outside the agency's own workspace: one new membership, nothing else.
select pg_temp.as_assert((select count(*) from public.workspace_memberships) = (select memberships + 1 from as_before), 'exactly one new membership');
select pg_temp.as_assert(not exists (select 1 from public.workspace_memberships
  where user_id = '5a000000-0000-4000-8000-000000000001' and workspace_id <> (select id from as_agency)), 'no membership in any other workspace');
select pg_temp.as_assert((select count(*) from public.provider_seats) = (select seats from as_before)
  and (select count(*) from public.workspace_providers) = (select providers from as_before)
  and (select count(*) from public.agency_client_staff) = (select staff from as_before)
  and (select count(*) from public.workspace_delegations) = (select delegations from as_before)
  and (select count(*) from public.agency_verifications) = (select verifications from as_before)
  and (select count(*) from public.platform_workspaces) = (select designations from as_before), 'no seat, provider, staff, delegation, verification or designation');
select pg_temp.as_assert(public.provider_seat_role('5a000000-0000-4000-8000-000000000030', '5a000000-0000-4000-8000-000000000001', false) is null,
  'no seat role in the existing business');

-- Every effect starts unverified, and the agency's member reads that.
select pg_temp.as_assert(not public.agency_effect_allowed((select id from as_agency), e), 'unverified: ' || e)
  from unnest(public.agency_effect_names()) e;
select pg_temp.as_assert((select count(*) = 4 and bool_and(x->>'status' = 'unverified' and x->>'recorded' = 'false')
  from jsonb_array_elements(public.read_agency_verification('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test',
    (select id from as_agency))->'effects') x), 'member reads four unverified effects');
select pg_temp.as_assert(public.read_agency_provider_seats('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test',
  (select id from as_agency)) = '[]'::jsonb, 'no clients');
select pg_temp.as_assert(public.list_provided_clients('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test',
  (select id from as_agency)) = '[]'::jsonb, 'no provided clients');

-- Someone outside the agency cannot read its verification or seats.
select pg_temp.as_expect(format($$select public.read_agency_verification('5a000000-0000-4000-8000-000000000003', 'as-business-owner@example.test', %L)$$,
  (select id from as_agency)), 'agency_verification_access_denied');
select pg_temp.as_expect(format($$select public.read_agency_provider_seats('5a000000-0000-4000-8000-000000000003', 'as-business-owner@example.test', %L)$$,
  (select id from as_agency)), 'provider_seat_access_denied');
-- A customer workspace is not an agency for the read either.
select pg_temp.as_expect($$select public.read_agency_verification('5a000000-0000-4000-8000-000000000003', 'as-business-owner@example.test', '5a000000-0000-4000-8000-000000000030')$$,
  'agency_verification_access_denied');

-- Refusals on the ordinary path.
select pg_temp.as_expect($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000002', 'as-unverified@northside.example.test', 'agency', 'Unverified Agency')$$,
  'verified_identity_required');
select pg_temp.as_expect($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'someone-else@example.test', 'agency', 'Wrong Email Agency')$$,
  'verified_identity_required');
select pg_temp.as_expect($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', 'agency', '   ')$$,
  'workspace_name_invalid');
select pg_temp.as_expect(format($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', 'agency', %L)$$,
  repeat('x', 121)), 'workspace_name_invalid');
select pg_temp.as_expect($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', 'customer', 'Not This Way')$$,
  'workspace_kind_invalid');

-- The per-person cap: five workspaces created by one person, the agency included.
select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', 'agency', 'Agency ' || n)
  from generate_series(2, 5) n;
select pg_temp.as_assert((select count(*) = 5 from public.workspaces where created_by = '5a000000-0000-4000-8000-000000000001'), 'five created');
select pg_temp.as_expect($$select public.create_owned_workspace('5a000000-0000-4000-8000-000000000001', 'as-freelancer@northside.example.test', 'agency', 'Sixth Agency')$$,
  'workspace_limit_reached');
select pg_temp.as_assert((select count(*) = 5 from public.workspaces where created_by = '5a000000-0000-4000-8000-000000000001'), 'the sixth was not created');

-- The browser and agency roles cannot call the path directly.
select pg_temp.as_assert(not has_function_privilege('anon', 'public.create_owned_workspace(uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.create_owned_workspace(uuid,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.create_owned_workspace(uuid,text,text,text)', 'execute'), 'service role only');
rollback;
\echo 'Agency signup schema checks passed.'
