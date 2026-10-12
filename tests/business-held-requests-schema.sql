\set ON_ERROR_STOP on
-- Held requests (20261024100000) on fictional rows, rolled back: a request typed
-- at business entry with no agency is kept on the business, visible to its
-- members, and filed to the agency the owner brings in once it accepts.
begin;
create function pg_temp.hr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'held request assertion failed: %', message; end if; end; $$;
create function pg_temp.hr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.hr_assert(not has_table_privilege('service_role', 'public.business_held_requests', 'select')
  and has_function_privilege('service_role', 'public.read_business_held_requests(uuid,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.decide_business_held_request(uuid,text,uuid,uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_business_held_requests(uuid,text,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.business_held_request_route(uuid,uuid)', 'execute'), 'privileges');

insert into public.users(id, email, verified_at) values
  ('c8000000-0000-4000-8000-000000000001', 'hr-owner@hr-bakery.example.test', now()),
  ('c8000000-0000-4000-8000-000000000002', 'hr-agency@hr-agency.example.test', now()),
  ('c8000000-0000-4000-8000-000000000003', 'hr-other@hr-other.example.test', now()),
  ('c8000000-0000-4000-8000-000000000004', 'hr-stranger@hr-x.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('c8000000-0000-4000-8000-0000000000a1', 'agency', 'HR Studio', 'c8000000-0000-4000-8000-000000000002'),
  ('c8000000-0000-4000-8000-0000000000b1', 'agency', 'HR Other', 'c8000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('c8000000-0000-4000-8000-0000000000a1', 'c8000000-0000-4000-8000-000000000002', 'owner', 'c8000000-0000-4000-8000-000000000002'),
  ('c8000000-0000-4000-8000-0000000000b1', 'c8000000-0000-4000-8000-000000000003', 'owner', 'c8000000-0000-4000-8000-000000000003');

do $$
declare
  owner_id constant uuid := 'c8000000-0000-4000-8000-000000000001';
  agency_user constant uuid := 'c8000000-0000-4000-8000-000000000002';
  other_user constant uuid := 'c8000000-0000-4000-8000-000000000003';
  stranger constant uuid := 'c8000000-0000-4000-8000-000000000004';
  studio constant uuid := 'c8000000-0000-4000-8000-0000000000a1';
  other constant uuid := 'c8000000-0000-4000-8000-0000000000b1';
  entered jsonb; replay jsonb; business uuid; held jsonb; second jsonb; business2 uuid; req uuid;
begin
  entered := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', 'HR Bakery', null,
    'Please rebuild my menu page.', 'c8000000-0000-4000-8000-0000000000c1', repeat('a', 64));
  business := (entered->>'workspaceId')::uuid;
  perform pg_temp.hr_assert((entered->>'agencyRequired')::boolean and entered->>'requestId' is null and entered->>'heldRequestId' is not null, format('held at entry: %s', entered));
  replay := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', 'HR Bakery', null,
    'Please rebuild my menu page.', 'c8000000-0000-4000-8000-0000000000c1', repeat('a', 64));
  perform pg_temp.hr_assert(replay->>'heldRequestId' = entered->>'heldRequestId' and (replay->>'alreadyCreated')::boolean, 'replay returns the same held request');
  perform pg_temp.hr_assert((select count(*) from public.business_held_requests where workspace_id = business) = 1, 'one held request');
  perform pg_temp.hr_assert(not exists (select 1 from public.service_requests where business_workspace_id = business), 'nothing filed or sent');

  held := public.read_business_held_requests(owner_id, 'hr-owner@hr-bakery.example.test', business);
  perform pg_temp.hr_assert(jsonb_array_length(held) = 1 and held->0->>'text' = 'Please rebuild my menu page.' and held->0->>'status' = 'held', format('owner sees it: %s', held));
  perform pg_temp.hr_expect(format('select public.read_business_held_requests(%L,%L,%L)', stranger, 'hr-stranger@hr-x.example.test', business), 'service_request_access_denied');
  perform pg_temp.hr_expect(format('select public.decide_business_held_request(%L,%L,%L,%L,%L,null)', stranger, 'hr-stranger@hr-x.example.test', business, entered->>'heldRequestId', 'withdraw'), 'provider_seat_owner_required');

  -- The owner brings in an agency; nothing is filed until the agency accepts.
  perform public.set_agency_directory_listing(agency_user, 'hr-agency@hr-agency.example.test', studio, 'Websites for bakeries.', true);
  perform public.bring_in_agency(owner_id, 'hr-owner@hr-bakery.example.test', business, studio, '[{"scope":"website","level":"prepare"}]', 'I bring in HR Studio for my website.');
  perform pg_temp.hr_assert((select status from public.business_held_requests where workspace_id = business) = 'held', 'still held while proposed');
  perform pg_temp.hr_assert(jsonb_array_length(public.read_agency_proposals(agency_user, 'hr-agency@hr-agency.example.test', studio)) = 1, 'agency reads its proposals');
  perform public.respond_to_agency_proposal(agency_user, 'hr-agency@hr-agency.example.test', studio, business, true);
  select routed_request_id into req from public.business_held_requests where workspace_id = business and status = 'routed' and routed_agency_workspace_id = studio;
  perform pg_temp.hr_assert(req is not null, 'filed to the agency on acceptance');
  perform pg_temp.hr_assert((select provider_kind = 'agency' and provider_agency_workspace_id = studio and created_by = owner_id and request_text = 'Please rebuild my menu page.'
    from public.service_requests where id = req), 'an ordinary Request, as the owner, to that agency');
  held := public.read_business_held_requests(owner_id, 'hr-owner@hr-bakery.example.test', business);
  perform pg_temp.hr_assert(held->0->>'status' = 'routed' and held->0->>'agencyName' = 'HR Studio', 'owner sees where it went');

  -- Two agencies: no single agency, so the request stays held; the owner files it or withdraws it.
  second := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', 'HR Cafe', null,
    'Set up online orders.', 'c8000000-0000-4000-8000-0000000000c2', repeat('b', 64));
  business2 := (second->>'workspaceId')::uuid;
  perform public.set_agency_directory_listing(other_user, 'hr-other@hr-other.example.test', other, 'Ordering systems.', true);
  perform public.bring_in_agency(owner_id, 'hr-owner@hr-bakery.example.test', business2, studio, '[{"scope":"website","level":"prepare"}]', 'Website.');
  perform public.bring_in_agency(owner_id, 'hr-owner@hr-bakery.example.test', business2, other, '[{"scope":"internal_tools","level":"prepare"}]', 'Orders.');
  perform public.respond_to_agency_proposal(agency_user, 'hr-agency@hr-agency.example.test', studio, business2, true);
  perform pg_temp.hr_assert((select status from public.business_held_requests where workspace_id = business2) = 'routed', 'first single agency receives it');

  second := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', 'HR Deli', null,
    'Fix my hours.', 'c8000000-0000-4000-8000-0000000000c3', repeat('c', 64));
  business2 := (second->>'workspaceId')::uuid;
  perform public.bring_in_agency(owner_id, 'hr-owner@hr-bakery.example.test', business2, studio, '[{"scope":"website","level":"prepare"}]', 'Website.');
  perform public.bring_in_agency(owner_id, 'hr-owner@hr-bakery.example.test', business2, other, '[{"scope":"internal_tools","level":"prepare"}]', 'Orders.');
  perform public.respond_to_agency_proposal(other_user, 'hr-other@hr-other.example.test', other, business2, true);
  perform public.respond_to_agency_proposal(agency_user, 'hr-agency@hr-agency.example.test', studio, business2, true);
  -- The first acceptance was the single agency then; it received the request.
  perform pg_temp.hr_assert((select routed_agency_workspace_id from public.business_held_requests where workspace_id = business2) = other, 'went to the first agency to accept');

  second := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', null, business2,
    'And add a catering form.', 'c8000000-0000-4000-8000-0000000000c4', repeat('d', 64));
  perform pg_temp.hr_assert(second->>'heldRequestId' is not null, 'two agencies: held for the owner to choose');
  perform pg_temp.hr_expect(format('select public.decide_business_held_request(%L,%L,%L,%L,%L,%L)', owner_id, 'hr-owner@hr-bakery.example.test', business2, second->>'heldRequestId', 'route', business), 'held_request_agency_required');
  held := public.decide_business_held_request(owner_id, 'hr-owner@hr-bakery.example.test', business2, (second->>'heldRequestId')::uuid, 'route', studio);
  perform pg_temp.hr_assert((select status = 'routed' and routed_agency_workspace_id = studio from public.business_held_requests where id = (second->>'heldRequestId')::uuid), 'owner filed it to the agency they chose');

  second := public.enter_customer_business(owner_id, 'hr-owner@hr-bakery.example.test', null, business2,
    'Never mind this one.', 'c8000000-0000-4000-8000-0000000000c5', repeat('e', 64));
  perform public.decide_business_held_request(owner_id, 'hr-owner@hr-bakery.example.test', business2, (second->>'heldRequestId')::uuid, 'withdraw', null);
  perform pg_temp.hr_assert((select status from public.business_held_requests where id = (second->>'heldRequestId')::uuid) = 'withdrawn', 'withdrawn');
  perform pg_temp.hr_expect(format('select public.decide_business_held_request(%L,%L,%L,%L,%L,null)', owner_id, 'hr-owner@hr-bakery.example.test', business2, second->>'heldRequestId', 'withdraw'), 'held_request_not_found');
end $$;
rollback;
