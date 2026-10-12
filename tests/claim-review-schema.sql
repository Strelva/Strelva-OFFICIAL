\set ON_ERROR_STOP on
-- Claim review (20261024300000) on fictional rows, rolled back: found facts are
-- staged with their source and never confirmed by the agency; the adding agency
-- holds pre-claim Prepare in every area and Prepare decides nothing; a second
-- agency sees nothing; the owner's claim confirms, changes or removes each fact
-- as the owner and records consent per area; owner-only rights stay the owner's.
begin;
create function pg_temp.cr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'claim review assertion failed: %', message; end if; end; $$;
create function pg_temp.cr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Privileges: tables closed, three service-role commands, helpers private.
select pg_temp.cr_assert((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.business_found_facts'::regclass, 'public.agency_client_claim_reviews'::regclass)), 'rls on');
select pg_temp.cr_assert(not has_table_privilege('service_role', 'public.business_found_facts', 'select')
  and not has_table_privilege('authenticated', 'public.agency_client_claim_reviews', 'select'), 'no table privileges');
select pg_temp.cr_assert(
  has_function_privilege('service_role', 'public.stage_agency_client_found_facts(uuid,text,uuid,uuid,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.read_agency_client_claim_review(text,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.accept_agency_client_claim_review(text,uuid,text,jsonb,jsonb,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.accept_agency_client_claim_review(text,uuid,text,jsonb,jsonb,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.read_agency_client_claim_review(text,uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.agency_client_assert_pre_claim(uuid,text,uuid,uuid)', 'execute'),
  'only service_role runs the commands');

insert into public.users(id, email, verified_at) values
  ('c7000000-0000-4000-8000-000000000001', 'cr-a-owner@agency-a.example.test', now()),
  ('c7000000-0000-4000-8000-000000000002', 'cr-a-member@agency-a.example.test', now()),
  ('c7000000-0000-4000-8000-000000000003', 'cr-b-owner@agency-b.example.test', now()),
  ('c7000000-0000-4000-8000-000000000004', 'pat@cr-bakery.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('c7000000-0000-4000-8000-0000000000a1', 'agency', 'North Studio', 'c7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-0000000000b1', 'agency', 'Other Agency', 'c7000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-000000000001', 'owner', 'c7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-000000000002', 'member', 'c7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-0000000000b1', 'c7000000-0000-4000-8000-000000000003', 'owner', 'c7000000-0000-4000-8000-000000000003');

do $$
declare
  a_owner constant uuid := 'c7000000-0000-4000-8000-000000000001';
  a_member constant uuid := 'c7000000-0000-4000-8000-000000000002';
  b_owner constant uuid := 'c7000000-0000-4000-8000-000000000003';
  pat constant uuid := 'c7000000-0000-4000-8000-000000000004';
  north constant uuid := 'c7000000-0000-4000-8000-0000000000a1';
  other constant uuid := 'c7000000-0000-4000-8000-0000000000b1';
  token text := repeat('c', 64);
  h constant text := repeat('e', 64);
  business uuid; added jsonb; staged jsonb; review jsonb; accepted jsonb; replay jsonb; item jsonb;
  found_phone uuid; found_hours uuid; found_description uuid; found_service uuid; found_person uuid; found_email uuid;
  found jsonb := jsonb_build_array(
    jsonb_build_object('entity','fact','key','phone','value','(716) 555-0142','sourceUrl','https://cr-bakery.example.test/contact','quote','Call (716) 555-0142'),
    jsonb_build_object('entity','fact','key','email','value','hello@cr-bakery.example.test','sourceUrl','https://cr-bakery.example.test/contact','quote','hello@cr-bakery.example.test'),
    jsonb_build_object('entity','fact','key','hours','value',jsonb_build_object('weekly',jsonb_build_array(jsonb_build_object('day',1,'opens','07:00','closes','15:00'))),'sourceUrl','https://cr-bakery.example.test/','quote','Mo 07:00-15:00'),
    jsonb_build_object('entity','fact','key','description','value','A neighborhood bakery on Elmwood.','sourceUrl','https://cr-bakery.example.test/','quote','A neighborhood bakery on Elmwood.'),
    jsonb_build_object('entity','fact','key','links','value',jsonb_build_array(jsonb_build_object('kind','website','url','https://cr-bakery.example.test/'),jsonb_build_object('kind','instagram','url','https://instagram.com/crbakery')),'sourceUrl','https://cr-bakery.example.test/','quote','Instagram'),
    jsonb_build_object('entity','service','value',jsonb_build_object('name','Custom cakes'),'sourceUrl','https://cr-bakery.example.test/services','quote','Custom cakes'),
    jsonb_build_object('entity','person','value',jsonb_build_object('name','Pat Baker'),'sourceUrl','https://cr-bakery.example.test/about','quote','Pat Baker, owner'));
begin
  added := public.agency_add_client(a_owner, 'cr-a-owner@agency-a.example.test', north,
    '{"name":"CR Bakery","sourceUrl":"https://cr-bakery.example.test/"}', 'c7000000-0000-4000-8000-0000000000c1', repeat('a', 64));
  business := (added->>'customerWorkspaceId')::uuid;
  perform public.issue_agency_client_owner_claim(a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    'pat@cr-bakery.example.test', token, clock_timestamp() + interval '14 days');

  -- Only the adding agency's owner or admin stages, and only valid, sourced items.
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', b_owner, 'cr-b-owner@agency-b.example.test', other, business, found), 'agency_client_access_denied');
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_member, 'cr-a-member@agency-a.example.test', north, business, found), 'agency_client_access_denied');
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    '[{"entity":"fact","key":"phone","value":"(716) 555-0142","sourceUrl":"https://cr-bakery.example.test/","quote":"x","verified":true}]'), 'agency_client_invalid');
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    '[{"entity":"fact","key":"owner_recipient","value":{"email":"x@y.example.test"},"sourceUrl":"https://cr-bakery.example.test/","quote":"x"}]'), 'agency_client_invalid');
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    '[{"entity":"fact","key":"phone","value":"(716) 555-0142","sourceUrl":"javascript:alert(1)","quote":"x"}]'), 'agency_client_invalid');

  staged := public.stage_agency_client_found_facts(a_owner, 'cr-a-owner@agency-a.example.test', north, business, found);
  perform pg_temp.cr_assert((staged->>'staged')::int = 7 and (staged->>'waiting')::int = 7, format('staged all seven: %s', staged));
  perform pg_temp.cr_assert(jsonb_array_length(staged->'preparing') = 5, 'pre-claim Prepare in every area');
  replay := public.stage_agency_client_found_facts(a_owner, 'cr-a-owner@agency-a.example.test', north, business, found);
  perform pg_temp.cr_assert((replay->>'staged')::int = 0 and (replay->>'waiting')::int = 7, 'restaging adds nothing');
  perform pg_temp.cr_assert((select count(*) from public.agency_scope_grants where customer_workspace_id = business) = 5, 'restaging opens no second grant');

  -- Staging never touches the record and never confirms anything.
  perform pg_temp.cr_assert(not exists (select 1 from public.business_record_facts where workspace_id = business and (verified or fact_key in ('phone','email','hours','description'))), 'record holds no found fact');
  perform pg_temp.cr_assert(not exists (select 1 from public.business_services where workspace_id = business)
    and not exists (select 1 from public.business_people where workspace_id = business), 'no found service or person in the record');
  perform pg_temp.cr_assert(not exists (select 1 from public.business_found_facts where workspace_id = business and status <> 'unconfirmed'), 'every found fact waits for the owner');
  perform pg_temp.cr_assert((select bool_and(found_by_kind = 'agency' and agency_workspace_id = north and found_by = a_owner and source_kind = 'website_crawl')
    from public.business_found_facts where workspace_id = business), 'agency-found website facts name the agency');

  -- Pre-claim grants are Prepare only, by constraint.
  perform pg_temp.cr_expect(format($q$insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent, proposed_by, responded_by, responded_at, basis)
    values (%L, %L, 'website', 'full_control', 'proposed', 'x', %L, null, null, 'pre_claim')$q$, business, other, a_owner), '%agency_scope_grants_pre_claim_prepare_only%');

  -- Prepare decides nothing: no Needs you item in any area can be approved by the agency.
  item := public.open_owner_decision(business, jsonb_build_object('kind','system.go_live','route','owner_decides','title','Put the new site live',
    'approveEffect','The site goes live.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId','site:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  item := public.open_owner_decision(business, jsonb_build_object('kind','google.post','route','owner_decides','title','Post the opening hours',
    'approveEffect','The post goes up.','notYetEffect','Nothing is posted.','sourceLifecycle','google_post','sourceId','post:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  item := public.open_owner_decision(business, jsonb_build_object('kind','customer.message','route','owner_decides','title','Reply to an inquiry',
    'approveEffect','The reply is sent.','notYetEffect','Nothing is sent.','sourceLifecycle','inquiry_reply','sourceId','reply:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');

  -- Effects are refused where they happen, whoever calls: no System goes live,
  -- no item is approved, no public page, no form capture or injected data.
  insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by) values
    ('c7000000-0000-4000-8000-0000000000e1', business, 'Booking page', 'booking', 'c7000000-0000-4000-8000-0000000000e2', repeat('d', 64), a_owner, a_owner);
  perform pg_temp.cr_expect(format($q$update public.systems set lifecycle = 'live' where id = %L$q$, 'c7000000-0000-4000-8000-0000000000e1'), 'agency_client_pre_claim_prepare_only');
  perform pg_temp.cr_expect(format($q$update public.owner_decisions set state = 'approved', decided_at = clock_timestamp(), decided_by_kind = 'operator', decided_by = %L where id = %L$q$, a_owner, item->>'id'), 'agency_client_pre_claim_prepare_only');
  perform pg_temp.cr_expect(format($q$insert into public.business_pages(workspace_id, handle, published, published_at, updated_by) values (%L, 'cr-bakery', true, clock_timestamp(), %L)$q$, business, a_owner), 'agency_client_pre_claim_prepare_only');
  perform public.create_connected_site(business, a_owner, 'cr-a-owner@agency-a.example.test', jsonb_build_object('publicKey', 'sk_pub_' || repeat('a', 24), 'label', 'CR Bakery',
    'siteUrl', 'https://cr-bakery.example.test', 'siteHost', 'cr-bakery.example.test', 'allowedOrigins', jsonb_build_array('https://cr-bakery.example.test'), 'verificationToken', repeat('b', 32)));
  perform pg_temp.cr_assert((select not capture_forms and not inject_schema from public.connected_sites where business_workspace_id = business), 'pre-claim connected site captures nothing');
  perform pg_temp.cr_expect(format($q$update public.connected_sites set capture_forms = true where business_workspace_id = %L$q$, business), 'agency_client_pre_claim_prepare_only');
  -- The agency can't claim the business itself, even with a link to its own address.
  perform public.issue_agency_client_owner_claim(a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    'cr-a-member@agency-a.example.test', repeat('9', 64), clock_timestamp() + interval '14 days');
  perform pg_temp.cr_expect(format('select public.accept_agency_client_owner_claim(%L,%L,%L)', repeat('9', 64), a_member, 'cr-a-member@agency-a.example.test'), 'agency_client_claim_agency_member');
  perform public.issue_agency_client_owner_claim(a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    'pat@cr-bakery.example.test', repeat('d', 64), clock_timestamp() + interval '14 days');
  token := repeat('d', 64);

  -- A second agency sees nothing of the business before (or after) the claim.
  perform pg_temp.cr_expect(format('select public.read_business_record(%L,%L,%L)', business, b_owner, 'cr-b-owner@agency-b.example.test'), 'business_record_access_denied');
  perform pg_temp.cr_expect(format('select public.read_agency_client_claim_review(%L,%L,%L)', token, b_owner, 'cr-b-owner@agency-b.example.test'), 'agency_client_claim_recipient_mismatch');
  -- Not even the adding agency reads the review: it is the recipient's.
  perform pg_temp.cr_expect(format('select public.read_agency_client_claim_review(%L,%L,%L)', token, a_owner, 'cr-a-owner@agency-a.example.test'), 'agency_client_claim_recipient_mismatch');

  insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by) values
    ('c7000000-0000-4000-8000-0000000000d1', business, 'Order form', 'intake', 'c7000000-0000-4000-8000-0000000000d2', repeat('d', 64), a_owner, a_owner);
  review := public.read_agency_client_claim_review(token, pat, 'pat@cr-bakery.example.test');
  perform pg_temp.cr_assert(review->>'status' = 'pending' and review->>'agencyName' = 'North Studio' and jsonb_array_length(review->'found') = 7, format('review shows the found facts: %s', review));
  perform pg_temp.cr_assert(review->'found'->0->>'key' = 'phone' and review->'found'->0->>'sourceUrl' = 'https://cr-bakery.example.test/contact'
    and review->'found'->0->>'quote' = 'Call (716) 555-0142', 'each found fact carries its source');
  perform pg_temp.cr_assert(jsonb_array_length(review->'prepared') = 2 and review->'prepared' @> '[{"name":"Order form"},{"name":"Booking page"}]'::jsonb, 'review shows the drafts');
  select (f->>'id')::uuid into found_phone from jsonb_array_elements(review->'found') f where f->>'key' = 'phone';
  select (f->>'id')::uuid into found_email from jsonb_array_elements(review->'found') f where f->>'key' = 'email';
  select (f->>'id')::uuid into found_hours from jsonb_array_elements(review->'found') f where f->>'key' = 'hours';
  select (f->>'id')::uuid into found_description from jsonb_array_elements(review->'found') f where f->>'key' = 'description';
  select (f->>'id')::uuid into found_service from jsonb_array_elements(review->'found') f where f->>'entity' = 'service';
  select (f->>'id')::uuid into found_person from jsonb_array_elements(review->'found') f where f->>'entity' = 'person';

  -- Bad input claims nothing: four areas, a missing consent, hours without a time zone.
  perform pg_temp.cr_expect(format('select public.accept_agency_client_claim_review(%L,%L,%L,%L,%L,%L)', token, pat, 'pat@cr-bakery.example.test', '[]',
    '{"website":"prepare","inquiries":"prepare","bookings":"prepare","google":"prepare"}', '{}'), 'agency_client_claim_review_invalid');
  perform pg_temp.cr_expect(format('select public.accept_agency_client_claim_review(%L,%L,%L,%L,%L,%L)', token, pat, 'pat@cr-bakery.example.test', '[]',
    '{"website":"prepare","inquiries":"none","bookings":"none","google":"none","internal_tools":"none"}', '{}'), 'agency_client_claim_review_invalid');
  perform pg_temp.cr_expect(format('select public.accept_agency_client_claim_review(%L,%L,%L,%L,%L,%L)', token, pat, 'pat@cr-bakery.example.test',
    jsonb_build_array(jsonb_build_object('id', found_hours, 'decision', 'confirm')),
    '{"website":"none","inquiries":"none","bookings":"none","google":"none","internal_tools":"none"}', '{}'), 'agency_client_claim_review_invalid');
  perform pg_temp.cr_assert(public.agency_client_waiting_for_owner(business), 'refused review left the business unclaimed');
  -- Only the recipient claims.
  perform pg_temp.cr_expect(format('select public.accept_agency_client_claim_review(%L,%L,%L,%L,%L,%L)', token, a_owner, 'cr-a-owner@agency-a.example.test', '[]',
    '{"website":"full_control","inquiries":"full_control","bookings":"full_control","google":"full_control","internal_tools":"full_control"}',
    '{"website":"x","inquiries":"x","bookings":"x","google":"x","internal_tools":"x"}'), 'agency_client_claim_recipient_mismatch');

  accepted := public.accept_agency_client_claim_review(token, pat, 'pat@cr-bakery.example.test',
    jsonb_build_array(
      jsonb_build_object('id', found_phone, 'decision', 'confirm'),
      jsonb_build_object('id', found_hours, 'decision', 'confirm', 'value', jsonb_build_object('timezone', 'America/New_York', 'weekly', jsonb_build_array(jsonb_build_object('day',1,'opens','07:00','closes','15:00')))),
      jsonb_build_object('id', found_description, 'decision', 'change', 'value', 'Buffalo''s neighborhood bakery.'),
      jsonb_build_object('id', found_service, 'decision', 'confirm'),
      jsonb_build_object('id', found_person, 'decision', 'remove')),
    '{"website":"full_control","inquiries":"none","bookings":"prepare","google":"prepare","internal_tools":"none"}',
    '{"website":"I let North Studio have full control of my website.","bookings":"I let North Studio prepare my bookings.","google":"I let North Studio prepare my Google listing."}');
  perform pg_temp.cr_assert(accepted->>'status' = 'accepted' and accepted->>'alreadyAccepted' = 'false', format('claimed: %s', accepted));
  perform pg_temp.cr_assert((accepted->'facts'->>'confirmed')::int = 3 and (accepted->'facts'->>'changed')::int = 1
    and (accepted->'facts'->>'removed')::int = 1 and (accepted->'facts'->>'waiting')::int = 2, format('fact counts: %s', accepted->'facts'));
  perform pg_temp.cr_assert(exists (select 1 from public.workspace_memberships where workspace_id = business and user_id = pat and role = 'owner'), 'recipient is the owner');

  -- Confirmed and changed facts joined the record as the owner's; removed and undecided ones did not.
  perform pg_temp.cr_assert((select verified and source = 'owner' and value = to_jsonb('(716) 555-0142'::text) from public.business_record_facts where workspace_id = business and fact_key = 'phone'), 'phone confirmed by the owner');
  perform pg_temp.cr_assert((select verified and value->>'timezone' = 'America/New_York' from public.business_record_facts where workspace_id = business and fact_key = 'hours'), 'hours confirmed with the owner''s time zone');
  perform pg_temp.cr_assert((select verified and value = to_jsonb('Buffalo''s neighborhood bakery.'::text) from public.business_record_facts where workspace_id = business and fact_key = 'description'), 'description changed by the owner');
  perform pg_temp.cr_assert(not exists (select 1 from public.business_record_facts where workspace_id = business and fact_key = 'email'), 'undecided email waits, outside the record');
  perform pg_temp.cr_assert((select verified and source = 'owner' from public.business_services where workspace_id = business and name = 'Custom cakes'), 'service confirmed');
  perform pg_temp.cr_assert(not exists (select 1 from public.business_people where workspace_id = business), 'removed person never joined the record');
  perform pg_temp.cr_assert((select status from public.business_found_facts where id = found_person) = 'removed'
    and (select status from public.business_found_facts where id = found_description) = 'changed'
    and (select status from public.business_found_facts where id = found_email) = 'unconfirmed', 'found fact states');

  -- Consent per area: pre-claim grants ended; the owner's choices are the grants, each with its own words.
  perform pg_temp.cr_assert(not exists (select 1 from public.agency_scope_grants where customer_workspace_id = business and basis = 'pre_claim' and status <> 'ended'), 'pre-claim Prepare ended');
  -- Prepare takes effect at the claim; Full control waits for the agency's acceptance.
  perform pg_temp.cr_assert((select jsonb_object_agg(scope, level) from public.agency_scope_grants where customer_workspace_id = business and status = 'active')
    = '{"bookings":"prepare","google":"prepare"}'::jsonb, 'active grants are the owner''s Prepare choices');
  perform pg_temp.cr_assert((select jsonb_object_agg(scope, level) from public.agency_scope_grants where customer_workspace_id = business and status = 'proposed')
    = '{"website":"full_control","bookings":"prepare","google":"prepare"}'::jsonb and accepted->'waitingForAgency' = '["website"]'::jsonb, 'the owner''s complete set is proposed to the agency');
  perform pg_temp.cr_assert(public.business_scope_full_control(business, 'website') is null, 'no full control before the agency accepts');
  item := public.open_owner_decision(business, jsonb_build_object('kind','copy.routine','route','owner_decides','title','Update the footer',
    'approveEffect','The footer changes.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId','footer:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  perform pg_temp.cr_assert(public.read_agency_proposals(a_owner, 'cr-a-owner@agency-a.example.test', north) @> jsonb_build_array(jsonb_build_object('businessWorkspaceId', business)), 'the agency sees the proposal');
  -- A plain member of the agency can't accept for it; the agency owner accepts in one click.
  perform pg_temp.cr_expect(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)', a_member, 'cr-a-member@agency-a.example.test', north, business, public.agency_proposal_identity(business, north)), 'agency_directory_denied');
  perform pg_temp.cr_assert(public.respond_to_agency_proposal(a_owner, 'cr-a-owner@agency-a.example.test', north, business, true, public.agency_proposal_identity(business, north))->>'status' = 'accepted', 'agency accepted');
  perform pg_temp.cr_assert((select jsonb_object_agg(scope, level) from public.agency_scope_grants where customer_workspace_id = business and status = 'active')
    = '{"website":"full_control","bookings":"prepare","google":"prepare"}'::jsonb, format('after acceptance the grants are exactly the owner''s choices: %s', (select jsonb_agg(jsonb_build_array(scope, level, status, basis)) from public.agency_scope_grants where customer_workspace_id = business)));
  perform pg_temp.cr_assert((select consent from public.agency_scope_grants where customer_workspace_id = business and status = 'active' and scope = 'google')
    = 'I let North Studio prepare my Google listing.', 'consent recorded per area');
  perform pg_temp.cr_assert((select areas = '{"website":"full_control","inquiries":"none","bookings":"prepare","google":"prepare","internal_tools":"none"}'::jsonb
    and owner_id = pat and consents ? 'website' and not consents ? 'inquiries' from public.agency_client_claim_reviews where workspace_id = business), 'receipt records every area, none included');

  -- After the claim the owner turns things on.
  update public.connected_sites set capture_forms = true where business_workspace_id = business;
  insert into public.business_pages(workspace_id, handle, published, published_at, updated_by) values (business, 'cr-bakery', true, clock_timestamp(), pat);

  -- Replay changes nothing.
  replay := public.accept_agency_client_claim_review(token, pat, 'pat@cr-bakery.example.test', '[]',
    '{"website":"none","inquiries":"none","bookings":"none","google":"none","internal_tools":"none"}', '{}');
  perform pg_temp.cr_assert(replay->>'alreadyAccepted' = 'true' and not replay ? 'areas', 'replay is a plain replay');
  perform pg_temp.cr_assert((select count(*) from public.agency_scope_grants where customer_workspace_id = business and status = 'active') = 3, 'replay kept the grants');
  perform pg_temp.cr_assert((select count(*) from public.agency_client_claim_reviews where workspace_id = business) = 1, 'one receipt');

  -- Full control decides its area only; owner-only rights stay the owner's.
  item := public.open_owner_decision(business, jsonb_build_object('kind','copy.routine','route','owner_decides','title','Update the hours line',
    'approveEffect','The new hours go live.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId','hours:1','revisionHash',h,'adminMayDecide',false));
  -- 20261024132400: website documents stay with the owner until resolvers consume an exact agency claim.
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  item := public.open_owner_decision(business, jsonb_build_object('kind','google.post','route','owner_decides','title','Post this week',
    'approveEffect','The post goes up.','notYetEffect','Nothing is posted.','sourceLifecycle','google_post','sourceId','post:2','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  item := public.open_owner_decision(business, jsonb_build_object('kind','money','route','owner_decides','title','Change the plan',
    'approveEffect','The plan changes.','notYetEffect','Nothing changes.','sourceLifecycle','money','sourceId','plan:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.cr_expect(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', business, item->>'id', h, 'approve', 'agency', a_owner, 'cr-a-owner@agency-a.example.test'), 'owner_decision_owner_only');
  perform pg_temp.cr_expect(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', business, other, '[{"scope":"inquiries","level":"prepare"}]', 'x'), 'provider_seat_owner_required');
  perform pg_temp.cr_expect(format('select public.end_agency_for_business(%L,%L,%L,%L,null)', a_owner, 'cr-a-owner@agency-a.example.test', business, north), 'provider_seat_owner_required');
  -- After the claim nothing more is staged by the agency.
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business, found), 'agency_client_owner_exists');
  -- The second agency still sees nothing.
  perform pg_temp.cr_expect(format('select public.read_business_record(%L,%L,%L)', business, b_owner, 'cr-b-owner@agency-b.example.test'), 'business_record_access_denied');
  -- The owner ends the agency: its claim grants end with its seat.
  perform public.end_agency_for_business(pat, 'pat@cr-bakery.example.test', business, north, null);
  perform pg_temp.cr_assert(not exists (select 1 from public.agency_scope_grants where customer_workspace_id = business and status = 'active'), 'ending the agency ends its grants');
end $$;
-- The one Found-fact store beyond the claim: import columns staged by the
-- agency, the owner's own website read (with Later) and Google listing read.
do $$
declare
  a_owner constant uuid := 'c7000000-0000-4000-8000-000000000001';
  a_member constant uuid := 'c7000000-0000-4000-8000-000000000002';
  north constant uuid := 'c7000000-0000-4000-8000-0000000000a1';
  sam constant uuid := 'c7000000-0000-4000-8000-000000000005';
  kim constant uuid := 'c7000000-0000-4000-8000-000000000006';
  shop constant uuid := 'c7000000-0000-4000-8000-0000000000f1';
  business uuid; added jsonb; staged jsonb; read jsonb; decided jsonb;
  f_phone_sheet uuid; f_phone_site uuid; f_service uuid; f_hours uuid; f_cat uuid; f_phone_google uuid; f_desc_google uuid;
  rev bigint;
begin
  insert into public.users(id, email, verified_at) values (sam, 'sam@cr-shop.example.test', now()), (kim, 'kim@cr-shop.example.test', now());
  insert into public.workspaces(id, kind, name, created_by) values (shop, 'customer', 'CR Shop', sam);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (shop, sam, 'owner', sam), (shop, kim, 'member', sam);

  -- Import columns: a structured source, no quote, named for the agency.
  added := public.agency_add_client(a_owner, 'cr-a-owner@agency-a.example.test', north,
    '{"name":"CR Import Client","sourceUrl":"https://cr-import.example.test/"}', 'c7000000-0000-4000-8000-0000000000c9', repeat('b', 64));
  business := (added->>'customerWorkspaceId')::uuid;
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    '[{"entity":"fact","key":"phone","value":"(716) 555-0199","sourceKind":"google_listing","sourceRef":"accounts/1/locations/2"}]'), 'agency_client_invalid');
  perform pg_temp.cr_expect(format('select public.stage_agency_client_found_facts(%L,%L,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', north, business,
    '[{"entity":"fact","key":"phone","value":"(716) 555-0199"}]'), 'agency_client_invalid');
  staged := public.stage_agency_client_found_facts(a_owner, 'cr-a-owner@agency-a.example.test', north, business, jsonb_build_array(
    jsonb_build_object('entity','fact','key','phone','value','(716) 555-0199','sourceKind','client_import_sheet','sourceRef','site:cr-import.example.test/'),
    jsonb_build_object('entity','fact','key','address','value',jsonb_build_object('formatted','1 Main St, Buffalo, NY'),'sourceKind','client_import_gohighlevel','sourceRef','loc_123')));
  perform pg_temp.cr_assert((staged->>'staged')::int = 2, format('import facts staged: %s', staged));
  perform pg_temp.cr_assert((select count(*) = 2 and bool_and(quote is null and found_by_kind = 'agency' and agency_workspace_id = north)
    from public.business_found_facts where workspace_id = business), 'import facts carry no quote and name the agency');
  perform pg_temp.cr_assert(not exists (select 1 from public.business_record_facts where workspace_id = business and fact_key in ('phone','address')), 'import facts wait outside the record');
  -- The agency has no decide path: owner-only, and the agency isn't a member.
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', business,
    jsonb_build_array(jsonb_build_object('id', (select id from public.business_found_facts where workspace_id = business limit 1), 'decision', 'confirm')),
    gen_random_uuid(), repeat('a', 64)), 'found_fact_denied');
  perform pg_temp.cr_expect(format('select public.read_business_found_facts(%L,%L,%L)', a_owner, 'cr-a-owner@agency-a.example.test', business), 'found_fact_denied');

  -- The owner's own website read: only the owner stages; the store keeps it.
  perform pg_temp.cr_expect(format('select public.stage_owner_found_facts(%L,%L,%L,%L,null,%L)', kim, 'kim@cr-shop.example.test', shop, 'website_crawl',
    '[{"entity":"fact","key":"phone","value":"(716) 555-0101","sourceUrl":"https://cr-shop.example.test/","quote":"Call (716) 555-0101"}]'), 'found_fact_denied');
  perform pg_temp.cr_expect(format('select public.stage_owner_found_facts(%L,%L,%L,%L,null,%L)', sam, 'sam@cr-shop.example.test', shop, 'client_import_sheet', '[]'), 'found_fact_invalid');
  perform pg_temp.cr_expect(format('select public.stage_owner_found_facts(%L,%L,%L,%L,null,%L)', sam, 'sam@cr-shop.example.test', shop, 'website_crawl',
    '[{"entity":"fact","key":"phone","value":"(716) 555-0101","sourceUrl":"https://cr-shop.example.test/"}]'), 'found_fact_invalid');
  staged := public.stage_owner_found_facts(sam, 'sam@cr-shop.example.test', shop, 'website_crawl', null, jsonb_build_array(
    jsonb_build_object('entity','fact','key','phone','value','(716) 555-0101','sourceUrl','https://cr-shop.example.test/contact','quote','Call (716) 555-0101'),
    jsonb_build_object('entity','fact','key','hours','value',jsonb_build_object('weekly',jsonb_build_array(jsonb_build_object('day',2,'opens','09:00','closes','17:00'))),'sourceUrl','https://cr-shop.example.test/','quote','Tu 9-5'),
    jsonb_build_object('entity','service','value',jsonb_build_object('name','Repairs'),'sourceUrl','https://cr-shop.example.test/services','quote','Repairs')));
  perform pg_temp.cr_assert((staged->>'staged')::int = 3 and jsonb_array_length(staged->'found') = 3, format('owner read staged: %s', staged));
  perform pg_temp.cr_assert((select bool_and(found_by_kind = 'owner' and agency_workspace_id is null and found_by = sam) from public.business_found_facts where workspace_id = shop), 'owner-found facts name no agency');
  read := public.read_business_found_facts(kim, 'kim@cr-shop.example.test', shop);
  perform pg_temp.cr_assert(jsonb_array_length(read) = 3 and read->0->>'sourceKind' = 'website_crawl' and read->0->>'quote' is not null, 'members read what waits');
  select (f->>'id')::uuid into f_phone_site from jsonb_array_elements(read) f where f->>'key' = 'phone';
  select (f->>'id')::uuid into f_hours from jsonb_array_elements(read) f where f->>'key' = 'hours';
  select (f->>'id')::uuid into f_service from jsonb_array_elements(read) f where f->>'entity' = 'service';
  -- A member decides nothing.
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', kim, 'kim@cr-shop.example.test', shop,
    jsonb_build_array(jsonb_build_object('id', f_phone_site, 'decision', 'confirm')), gen_random_uuid(), repeat('a', 64)), 'found_fact_denied');
  -- Later keeps it waiting, marked as seen, out of the record.
  decided := public.decide_business_found_facts(sam, 'sam@cr-shop.example.test', shop, null,
    jsonb_build_array(jsonb_build_object('id', f_hours, 'decision', 'later'), jsonb_build_object('id', f_service, 'decision', 'remove')),
    gen_random_uuid(), repeat('c', 64));
  perform pg_temp.cr_assert((decided->>'later')::int = 1 and (decided->>'removed')::int = 1 and (decided->>'waiting')::int = 2, format('later and remove: %s', decided));
  perform pg_temp.cr_assert((select status from public.business_found_facts where id = f_hours) = 'later'
    and not exists (select 1 from public.business_record_facts where workspace_id = shop and fact_key = 'hours'), 'later waits outside the record');
  -- A removed item is not offered again; a re-read with a new phone replaces the waiting one.
  staged := public.stage_owner_found_facts(sam, 'sam@cr-shop.example.test', shop, 'website_crawl', null, jsonb_build_array(
    jsonb_build_object('entity','service','value',jsonb_build_object('name','Repairs'),'sourceUrl','https://cr-shop.example.test/services','quote','Repairs'),
    jsonb_build_object('entity','fact','key','phone','value','(716) 555-0102','sourceUrl','https://cr-shop.example.test/contact','quote','Call (716) 555-0102')));
  perform pg_temp.cr_assert((staged->>'staged')::int = 1 and (select value from public.business_found_facts where id = f_phone_site) = to_jsonb('(716) 555-0102'::text), format('re-read: %s', staged));
  -- Confirming hours needs the owner's time zone with the same weekly hours; a stale revision refuses.
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop,
    jsonb_build_array(jsonb_build_object('id', f_hours, 'decision', 'confirm')), gen_random_uuid(), repeat('d', 64)), 'found_fact_invalid');
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop,
    jsonb_build_array(jsonb_build_object('id', f_hours, 'decision', 'confirm', 'value', jsonb_build_object('timezone','America/New_York','weekly',jsonb_build_array(jsonb_build_object('day',3,'opens','09:00','closes','17:00'))))),
    gen_random_uuid(), repeat('d', 64)), 'found_fact_invalid');
  rev := coalesce((select revision from public.business_records where workspace_id = shop), 0);
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,%L,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop, rev + 5,
    jsonb_build_array(jsonb_build_object('id', f_phone_site, 'decision', 'confirm')), gen_random_uuid(), repeat('d', 64)), 'business_record_revision_conflict');
  decided := public.decide_business_found_facts(sam, 'sam@cr-shop.example.test', shop, rev, jsonb_build_array(
    jsonb_build_object('id', f_phone_site, 'decision', 'confirm'),
    jsonb_build_object('id', f_hours, 'decision', 'confirm', 'value', jsonb_build_object('timezone','America/New_York','weekly',jsonb_build_array(jsonb_build_object('day',2,'opens','09:00','closes','17:00'))))),
    gen_random_uuid(), repeat('e', 64));
  perform pg_temp.cr_assert((decided->>'confirmed')::int = 2 and (decided->>'waiting')::int = 0, format('owner confirmed: %s', decided));
  perform pg_temp.cr_assert((select verified and source = 'owner' and value = to_jsonb('(716) 555-0102'::text) from public.business_record_facts where workspace_id = shop and fact_key = 'phone')
    and (select verified and value->>'timezone' = 'America/New_York' from public.business_record_facts where workspace_id = shop and fact_key = 'hours'), 'owner''s confirmed facts are verified owner facts');
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop,
    jsonb_build_array(jsonb_build_object('id', f_phone_site, 'decision', 'remove')), gen_random_uuid(), repeat('f', 64)), 'found_fact_not_open');

  -- Google listing: only a listing this business's connected grant holds.
  perform pg_temp.cr_expect(format('select public.stage_owner_found_facts(%L,%L,%L,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop, 'google_listing', 'accounts/9/locations/9',
    '[{"key":"phone","value":"(716) 555-0177"}]'), 'found_fact_listing_not_connected');
  insert into public.workspace_account_bindings(id, workspace_id, provider, subject, status, migrated_from)
    values ('c7000000-0000-4000-8000-0000000000f9', shop, 'google', 'google-sub-sam', 'connected', 'oauth');
  insert into public.workspace_google_locations(workspace_id, binding_id, account_id, location_id)
    values (shop, 'c7000000-0000-4000-8000-0000000000f9', 'accounts/77', 'loc77');
  perform pg_temp.cr_expect(format('select public.stage_owner_found_facts(%L,%L,%L,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop, 'google_listing', 'accounts/77/locations/loc77',
    '[{"entity":"service","value":{"name":"Repairs"}}]'), 'found_fact_invalid');
  staged := public.stage_owner_found_facts(sam, 'sam@cr-shop.example.test', shop, 'google_listing', 'accounts/77/locations/loc77', jsonb_build_array(
    jsonb_build_object('key','phone','value','(716) 555-0177'),
    jsonb_build_object('key','description','value','Repairs on Elmwood.'),
    jsonb_build_object('key','categories','value',jsonb_build_array('Repair shop'))));
  perform pg_temp.cr_assert((staged->>'staged')::int = 3, format('google staged: %s', staged));
  perform pg_temp.cr_assert((select bool_and(source_kind = 'google_listing' and source_ref = 'accounts/77/locations/loc77' and quote is null and found_by_kind = 'owner')
    from public.business_found_facts where workspace_id = shop and source_kind = 'google_listing'), 'google facts carry the listing ref');
  select id into f_cat from public.business_found_facts where workspace_id = shop and fact_key = 'categories' and status = 'unconfirmed';
  select id into f_desc_google from public.business_found_facts where workspace_id = shop and fact_key = 'description' and status = 'unconfirmed';
  perform pg_temp.cr_expect(format('select public.decide_business_found_facts(%L,%L,%L,null,%L,%L,%L)', sam, 'sam@cr-shop.example.test', shop,
    jsonb_build_array(jsonb_build_object('id', f_cat, 'decision', 'confirm')), gen_random_uuid(), repeat('1', 64)), 'found_fact_no_record_fact');
  decided := public.decide_business_found_facts(sam, 'sam@cr-shop.example.test', shop, null, jsonb_build_array(
    jsonb_build_object('id', f_cat, 'decision', 'remove'), jsonb_build_object('id', f_desc_google, 'decision', 'change', 'value', 'Bike repairs on Elmwood.')),
    gen_random_uuid(), repeat('2', 64));
  perform pg_temp.cr_assert((decided->>'changed')::int = 1 and (select value from public.business_record_facts where workspace_id = shop and fact_key = 'description') = to_jsonb('Bike repairs on Elmwood.'::text), 'owner changed a google fact');
  -- A dismissed value is not reopened by the next read; a new value is.
  staged := public.stage_owner_found_facts(sam, 'sam@cr-shop.example.test', shop, 'google_listing', 'accounts/77/locations/loc77', jsonb_build_array(
    jsonb_build_object('key','categories','value',jsonb_build_array('Repair shop'))));
  perform pg_temp.cr_assert((staged->>'staged')::int = 0, 'removed categories stay removed');
  -- Nobody writes the store directly.
  perform pg_temp.cr_expect($q$set local role authenticated; select count(*) from public.business_found_facts$q$, '%permission denied%');
  reset role;
end $$;
rollback;
