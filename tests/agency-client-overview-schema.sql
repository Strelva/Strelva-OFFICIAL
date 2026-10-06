\set ON_ERROR_STOP on
-- agency_client_overview on fictional rows: one read for every client, each
-- row scoped exactly as opening that client would be. Rolled back at the end.
-- Fails against the pre-migration database (the function does not exist).
begin;
create or replace function pg_temp.ao_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'agency overview assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ao_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.ao_assert(
  has_function_privilege('service_role', 'public.agency_client_overview(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.agency_client_overview(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.agency_client_overview(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.agency_overview_client(uuid,uuid,text,uuid,boolean)', 'EXECUTE'),
  'only service_role reads the agency overview');

insert into public.users(id, email, verified_at) values
  ('8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', now()),
  ('8e000000-0000-4000-8000-000000000002', 'ao-owner@example.test', now()),
  ('8e000000-0000-4000-8000-000000000003', 'ao-stranger@example.test', now()),
  ('8e000000-0000-4000-8000-000000000004', 'ao-teammate@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('8e000000-0000-4000-8000-000000000020', 'agency', 'Strelva (fictional)', '8e000000-0000-4000-8000-000000000001'),
  ('8e000000-0000-4000-8000-000000000010', 'customer', 'Harbor Dental', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-000000000011', 'customer', 'Twin Trees', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-000000000012', 'customer', 'Mooney Firm', '8e000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'owner', '8e000000-0000-4000-8000-000000000001'),
  ('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000004', 'member', '8e000000-0000-4000-8000-000000000001'),
  ('8e000000-0000-4000-8000-000000000010', '8e000000-0000-4000-8000-000000000002', 'owner', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-000000000011', '8e000000-0000-4000-8000-000000000002', 'owner', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-000000000012', '8e000000-0000-4000-8000-000000000002', 'owner', '8e000000-0000-4000-8000-000000000002'),
  -- Strelva's operator is an admin member of Mooney, as conversion leaves it.
  ('8e000000-0000-4000-8000-000000000012', '8e000000-0000-4000-8000-000000000001', 'admin', '8e000000-0000-4000-8000-000000000002');

-- Harbor delegates one schedule (w1) to the agency; it also has a second System the agency must not see.
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('8e000000-0000-4000-8000-0000000000a1', '8e000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Cleanings', '{}', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-0000000000a2', '8e000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Private', '{}', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-0000000000a3', '8e000000-0000-4000-8000-000000000011', 'tracker', 'tracker', 'Menu', '{}', '8e000000-0000-4000-8000-000000000002');
insert into public.workspace_delegations(customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by) values
  ('8e000000-0000-4000-8000-000000000010', '8e000000-0000-4000-8000-0000000000a1', '8e000000-0000-4000-8000-000000000020',
   '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000001'),
  ('8e000000-0000-4000-8000-000000000011', '8e000000-0000-4000-8000-0000000000a3', '8e000000-0000-4000-8000-000000000020',
   '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000001');
insert into public.systems(id, business_workspace_id, name, kind, lifecycle, origin_kind, origin_ref, command_id, command_digest, created_by, updated_by) values
  (public.system_origin_id('8e000000-0000-4000-8000-000000000010', 'saved_work', '8e000000-0000-4000-8000-0000000000a1'), '8e000000-0000-4000-8000-000000000010',
   'Cleanings', 'booking', 'draft', 'saved_work', '8e000000-0000-4000-8000-0000000000a1', gen_random_uuid(), repeat('a', 64), '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000002'),
  (public.system_origin_id('8e000000-0000-4000-8000-000000000010', 'saved_work', '8e000000-0000-4000-8000-0000000000a2'), '8e000000-0000-4000-8000-000000000010',
   'Private', 'tracker', 'draft', 'saved_work', '8e000000-0000-4000-8000-0000000000a2', gen_random_uuid(), repeat('a', 64), '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000002'),
  (public.system_origin_id('8e000000-0000-4000-8000-000000000011', 'saved_work', '8e000000-0000-4000-8000-0000000000a3'), '8e000000-0000-4000-8000-000000000011',
   'Menu', 'tracker', 'draft', 'saved_work', '8e000000-0000-4000-8000-0000000000a3', gen_random_uuid(), repeat('a', 64), '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000002'),
  ('8e000000-0000-4000-8000-0000000005c1', '8e000000-0000-4000-8000-000000000012', 'attymooney.com', 'website', 'draft', null, null,
   gen_random_uuid(), repeat('a', 64), '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000002');
insert into public.service_requests(business_workspace_id, status, request_text, outcome, scope, provider_kind, provider_agency_workspace_id, created_by) values
  ('8e000000-0000-4000-8000-000000000010', 'requested', 'Add Saturday hours', 'Saturday bookings open', array['booking'], 'agency',
   '8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000002');

-- Not a member of the agency: refused. A bad page size: refused.
select pg_temp.ao_expect($$select public.agency_client_overview('8e000000-0000-4000-8000-000000000020','8e000000-0000-4000-8000-000000000003','ao-stranger@example.test',null,50)$$, 'business_record_access_denied');
select pg_temp.ao_expect($$select public.agency_client_overview('8e000000-0000-4000-8000-000000000010','8e000000-0000-4000-8000-000000000002','ao-owner@example.test',null,50)$$, 'business_record_access_denied');
select pg_temp.ao_expect($$select public.agency_client_overview('8e000000-0000-4000-8000-000000000020','8e000000-0000-4000-8000-000000000001','ao-agency@example.test',null,0)$$, 'system_input_invalid');

-- Without workspace_providers, clients come from delegations and assignments only.
do $$ declare o jsonb; harbor jsonb; per_client jsonb; begin
  perform pg_temp.ao_assert(to_regclass('public.workspace_providers') is null, 'fixture assumes no provider table yet');
  o := public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', null, 50);
  perform pg_temp.ao_assert((o->>'providersRead')::boolean = false, 'says the provider table was not read');
  perform pg_temp.ao_assert((select array_agg(c->>'name' order by c->>'name') from jsonb_array_elements(o->'clients') c) = array['Harbor Dental','Twin Trees'],
    'delegated clients only; an admin membership alone is not a client');
  -- The batched row equals what opening the client returns.
  select c into harbor from jsonb_array_elements(o->'clients') c where c->>'name' = 'Harbor Dental';
  per_client := public.read_business_systems('8e000000-0000-4000-8000-000000000010', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test');
  perform pg_temp.ao_assert((select array_agg(s->>'id' order by s->>'id') from jsonb_array_elements(harbor->'systems') s)
    = (select array_agg(s->>'id' order by s->>'id') from jsonb_array_elements(per_client->'systems') s), 'batched systems equal the per-client read');
  perform pg_temp.ao_assert(jsonb_array_length(harbor->'systems') = 1 and harbor->>'reach' = 'agency', 'agency sees only its delegated System');
  perform pg_temp.ao_assert((harbor->>'openRequests')::int = 1, 'open request counted');
  perform pg_temp.ao_assert(exists (select 1 from jsonb_array_elements(o->'queue') q where q->>'kind' = 'request' and q->>'title' = 'Add Saturday hours'),
    'request appears in the queue');
  perform pg_temp.ao_assert(jsonb_array_length(o->'team') = 2, 'team lists both agency members');
  perform pg_temp.ao_assert(jsonb_array_length((select t->'clients' from jsonb_array_elements(o->'team') t where t->>'email' = 'ao-teammate@example.test')) = 2,
    'a teammate reaches the delegated clients through the agency');
end $$;

-- Paging by cursor.
do $$ declare first jsonb; second jsonb; begin
  first := public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', null, 1);
  perform pg_temp.ao_assert(jsonb_array_length(first->'clients') = 1 and first->>'nextCursor' is not null, 'first page has a cursor');
  second := public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test',
    (first->>'nextCursor')::uuid, 1);
  perform pg_temp.ao_assert(second->'clients'->0->>'name' = 'Twin Trees' and second->>'nextCursor' is null, 'second page ends the list');
end $$;

-- A revoked delegation removes the client: the read never widens.
update public.workspace_delegations set status = 'revoked', revoked_at = now(), revoked_by = '8e000000-0000-4000-8000-000000000002'
  where customer_workspace_id = '8e000000-0000-4000-8000-000000000011';
select pg_temp.ao_assert(jsonb_array_length(public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001',
  'ao-agency@example.test', null, 50)->'clients') = 1, 'revoked client disappears');

-- When workspace_providers exists (another 1.0.0 stream adds it), the mark lists
-- Mooney, read under the operator's admin membership: the whole business.
create table public.workspace_providers (
  customer_workspace_id uuid not null references public.workspaces(id),
  provider_workspace_id uuid not null references public.workspaces(id),
  status text not null, started_at timestamptz not null default now(), ended_at timestamptz);
insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, status) values
  ('8e000000-0000-4000-8000-000000000012', '8e000000-0000-4000-8000-000000000020', 'active'),
  ('8e000000-0000-4000-8000-000000000011', '8e000000-0000-4000-8000-000000000020', 'ended');
do $$ declare o jsonb; mooney jsonb; begin
  o := public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', null, 50);
  perform pg_temp.ao_assert((o->>'providersRead')::boolean, 'provider table read when present');
  select c into mooney from jsonb_array_elements(o->'clients') c where c->>'name' = 'Mooney Firm';
  perform pg_temp.ao_assert(mooney is not null and (mooney->>'provider')::boolean and mooney->>'reach' = 'member' and mooney->>'role' = 'admin',
    'a provider-marked client is read under the admin membership');
  perform pg_temp.ao_assert(mooney->'systems'->0->>'name' = 'attymooney.com', 'the whole business is visible to its admin member');
  perform pg_temp.ao_assert(not exists (select 1 from jsonb_array_elements(o->'clients') c where c->>'name' = 'Twin Trees'), 'an ended provider mark lists nothing');
  -- The teammate is not a Mooney member: the mark grants nothing.
  perform pg_temp.ao_assert(not exists (select 1 from jsonb_array_elements(o->'team') t, jsonb_array_elements(t->'clients') c
    where t->>'email' = 'ao-teammate@example.test' and c->>'name' = 'Mooney Firm'), 'a provider mark grants the teammate nothing');
end $$;
-- A provider-marked client the actor cannot open is left out, not shown.
insert into public.workspaces(id, kind, name, created_by) values
  ('8e000000-0000-4000-8000-000000000013', 'customer', 'No Access Bakery', '8e000000-0000-4000-8000-000000000002');
insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, status) values
  ('8e000000-0000-4000-8000-000000000013', '8e000000-0000-4000-8000-000000000020', 'active');
select pg_temp.ao_assert(not exists (select 1 from jsonb_array_elements(public.agency_client_overview('8e000000-0000-4000-8000-000000000020',
  '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', null, 50)->'clients') c where c->>'name' = 'No Access Bakery'),
  'a provider mark without access is never a row');

-- Fifty clients load in one call well under a second.
insert into public.workspaces(id, kind, name, created_by)
  select ('8e000000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid, 'customer', 'Client ' || lpad(i::text, 2, '0'), '8e000000-0000-4000-8000-000000000002'
  from generate_series(1, 50) i;
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  select ('8e000000-0000-4000-8002-' || lpad(i::text, 12, '0'))::uuid, ('8e000000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid,
    'tracker', 'tracker', 'Work', '{}', '8e000000-0000-4000-8000-000000000002' from generate_series(1, 50) i;
insert into public.workspace_delegations(customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by)
  select ('8e000000-0000-4000-8001-' || lpad(i::text, 12, '0'))::uuid, ('8e000000-0000-4000-8002-' || lpad(i::text, 12, '0'))::uuid,
    '8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000002', '8e000000-0000-4000-8000-000000000001' from generate_series(1, 50) i;
do $$ declare started timestamptz := clock_timestamp(); o jsonb; begin
  o := public.agency_client_overview('8e000000-0000-4000-8000-000000000020', '8e000000-0000-4000-8000-000000000001', 'ao-agency@example.test', null, 100);
  perform pg_temp.ao_assert(jsonb_array_length(o->'clients') = 52, 'fifty more clients in one page');
  perform pg_temp.ao_assert(clock_timestamp() - started < interval '1 second', format('fifty clients load under a second (took %s)', clock_timestamp() - started));
  raise notice 'agency overview: 52 clients in %', clock_timestamp() - started;
end $$;

\echo 'agency client overview checks passed'
rollback;
