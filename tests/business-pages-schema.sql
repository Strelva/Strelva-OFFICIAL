\set ON_ERROR_STOP on
-- Public business pages (#309) and the confirmed facts behind them and the
-- static JSON-LD block (#502), read from the owner-confirmed copy
-- (20261013110000, #509). Fictional local fixture only. Rolled back.
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;

select pg_temp.assert_true(not has_table_privilege('service_role','public.business_pages','select'),'pages are reached through functions only');
select pg_temp.assert_true(not has_function_privilege('anon','public.read_published_business_page(text)','execute'),'the public read is service-role only');
select pg_temp.assert_true(has_function_privilege('service_role','public.read_published_business_page(text)','execute'),'the public read is service-role');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.set_business_page(uuid,uuid,text,text,boolean)','execute'),'publishing is service-role only');
select pg_temp.assert_true(not has_function_privilege('service_role','public.business_confirmed_public_facts(uuid)','execute'),'the facts read is internal');
select pg_temp.assert_true((select provolatile from pg_proc where oid='public.read_business_page(uuid,uuid,text)'::regprocedure)='v','the member read locks, so it is volatile');
select pg_temp.assert_true((select provolatile from pg_proc where oid='public.read_business_public_facts(uuid,uuid,text)'::regprocedure)='v','the member facts read locks, so it is volatile');

do $$
declare
  owner_id uuid := '64000000-0000-4000-8000-000000000101';
  admin_id uuid := '64000000-0000-4000-8000-000000000102';
  member_id uuid := '64000000-0000-4000-8000-000000000103';
  other_owner uuid := '64000000-0000-4000-8000-000000000104';
  ws uuid := '64000000-0000-4000-8000-000000000110';
  other_ws uuid := '64000000-0000-4000-8000-000000000111';
  personal_ws uuid := '64000000-0000-4000-8000-000000000112';
  page jsonb; facts jsonb; published jsonb; review jsonb; item jsonb;
begin
  insert into public.users(id,email,verified_at) values (owner_id,'bp-owner@example.test',now()),(admin_id,'bp-admin@example.test',now()),(member_id,'bp-member@example.test',now()),(other_owner,'bp-other@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values (ws,'customer','Fictional Barber',owner_id),(other_ws,'customer','Other Fictional Barber',other_owner),(personal_ws,'personal','Personal fictional',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (ws,owner_id,'owner',owner_id),(ws,admin_id,'admin',owner_id),(ws,member_id,'member',owner_id),(other_ws,other_owner,'owner',other_owner),(personal_ws,owner_id,'owner',owner_id);

  -- Confirmed = the owner decided it (#509): the owner's own write or an
  -- owner Needs you decision, held in business_record_confirmed. A working
  -- value nobody confirmed is never served, even an operator's "verified"
  -- one; neither is owner_recipient. Policies also keep #518's contract:
  -- verified owner/operator terms only.
  insert into public.business_records(workspace_id,created_by,updated_by) values (ws,owner_id,owner_id);
  insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by,updated_at) values
    (ws,'display_name','"Fictional Barber"','owner',false,owner_id,'2026-10-01T12:00:00Z'),
    (ws,'phone','"716-555-0100"','operator',true,owner_id,'2026-10-02T12:00:00Z'),
    (ws,'address','{"formatted":"1 Operator Guess St, Buffalo"}','operator',true,owner_id,'2026-10-02T12:00:00Z'),
    (ws,'email','"guess@example.test"','operator',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'description','"A guess the model made."','agent',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'service_area','["Buffalo"]','agency',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'cancellation','{"summary":"Give 24 hours notice.","noticeHours":24}','owner',true,owner_id,'2026-10-02T12:00:00Z'),
    (ws,'deposit','{"required":false}','operator',true,owner_id,'2026-10-02T12:00:00Z'),
    (ws,'payment_methods','["cash"]','owner',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'booking_rules','{"summary":"Guessed booking terms."}','agency',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'response_time','{"maximumHours":2}','operator',false,owner_id,'2026-10-05T12:00:00Z'),
    (ws,'owner_recipient','{"email":"bp-owner@example.test"}','owner',true,owner_id,'2026-10-05T12:00:00Z');
  insert into public.business_services(workspace_id,name,price_text,source,verified,active,position,created_by,updated_by) values
    (ws,'Haircut','$30','owner',false,true,1,owner_id,owner_id),
    (ws,'Beard trim','$15','operator',true,true,0,owner_id,owner_id),
    (ws,'Verified wax',null,'operator',true,true,0,owner_id,owner_id),
    (ws,'Guessed service',null,'agent',false,true,2,owner_id,owner_id),
    (ws,'Operator guess',null,'operator',false,true,3,owner_id,owner_id),
    (ws,'Agency guess',null,'agency',false,true,3,owner_id,owner_id),
    (ws,'Retired service',null,'owner',false,false,4,owner_id,owner_id);
  update public.business_services set updated_at = '2026-10-03T12:00:00Z' where workspace_id = ws;
  -- What the owner decided, and when (confirm_business_facts copies the
  -- working state). address and Verified wax were verified by an operator
  -- but never decided by the owner.
  insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind,confirmed_at)
    select ws,'fact',k,public.business_record_entity_state(ws,'fact',k),'owner_write',at::timestamptz from (values
      ('display_name','2026-10-01T12:00:00Z'),('phone','2026-10-02T12:00:00Z'),('cancellation','2026-10-02T12:00:00Z'),
      ('deposit','2026-10-02T12:00:00Z'),('payment_methods','2026-10-05T12:00:00Z'),('owner_recipient','2026-10-05T12:00:00Z')) v(k,at)
    union all
    select ws,'service',s.id::text,public.business_record_entity_state(ws,'service',s.id::text),'owner_write',
      case when s.active then '2026-10-03T12:00:00Z'::timestamptz else '2026-10-04T12:00:00Z'::timestamptz end
      from public.business_services s where s.workspace_id = ws and s.name in ('Haircut','Beard trim','Retired service');

  facts := public.read_business_public_facts(ws,member_id,'bp-member@example.test');
  perform pg_temp.assert_true(facts->'facts' = '{"display_name":"Fictional Barber","phone":"716-555-0100"}'::jsonb,'only owner-confirmed facts; an operator-verified address waits: '||(facts->'facts')::text);
  perform pg_temp.assert_true(facts->'policyFacts'->'cancellation'->'value'->>'summary'='Give 24 hours notice.'
    and facts->'policyFacts'->'deposit'->'value'->>'required'='false','owner-confirmed, verified policies are served');
  perform pg_temp.assert_true((facts->'policyFacts'->'cancellation'->>'updatedAt')::timestamptz = '2026-10-02T12:00:00Z'
    and facts->'policyFacts'->'deposit'->>'source'='operator' and facts->'policyFacts'->'deposit'->>'updatedBy'=owner_id::text,'policy provenance: when the owner confirmed it, from the confirmed state');
  perform pg_temp.assert_true(not (facts->'policyFacts' ?| array['payment_methods','booking_rules','response_time','service_area']),'unverified owner, operator and agency policies stay private');
  perform pg_temp.assert_true(facts->'services' = '[{"name":"Beard trim","description":null,"priceText":"$15"},{"name":"Haircut","description":null,"priceText":"$30"}]'::jsonb,
    'only owner-confirmed active services, in position order: '||(facts->'services')::text);
  perform pg_temp.assert_true((facts->>'confirmedAt')::timestamptz = '2026-10-03T12:00:00Z','confirmedAt is the latest confirmation among what is served');

  -- Unconfirmed operator edits after the owner's decision change nothing public.
  update public.business_record_facts set value='"716-555-0199"', updated_at='2026-10-06T12:00:00Z' where workspace_id=ws and fact_key='phone';
  update public.business_record_facts set value='{"required":true,"summary":"Operator deposit."}', updated_at='2026-10-06T12:00:00Z' where workspace_id=ws and fact_key='deposit';
  update public.business_services set price_text='$99', updated_at='2026-10-06T12:00:00Z' where workspace_id=ws and name='Beard trim';
  update public.business_services set active=false where workspace_id=ws and name='Haircut';
  perform pg_temp.assert_true(public.read_business_public_facts(ws,member_id,'bp-member@example.test') = facts,'unconfirmed operator edits are not served (#509)');
  perform pg_temp.expect_error(format('select public.read_business_public_facts(%L,%L,%L)',ws,other_owner,'bp-other@example.test'),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.read_business_public_facts(%L,%L,%L)',ws,owner_id,'wrong@example.test'),'workspace_access_denied');

  -- Settings: members read; owners and admins set; customer businesses only.
  perform pg_temp.assert_true(public.read_business_page(ws,member_id,'bp-member@example.test') is null,'no page until a handle is chosen');
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',ws,member_id,'bp-member@example.test','fictional-barber',true),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',personal_ws,owner_id,'bp-owner@example.test','fictional-barber',true),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',ws,owner_id,'bp-owner@example.test','-bad-',true),'business_page_invalid');
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',ws,owner_id,'bp-owner@example.test','a--b',true),'business_page_invalid');
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',ws,owner_id,'bp-owner@example.test','ab',true),'business_page_invalid');

  page := public.set_business_page(ws,admin_id,'bp-admin@example.test','fictional-barber',false);
  perform pg_temp.assert_true(page->>'handle'='fictional-barber' and (page->>'published')::boolean=false and page->>'publishedAt' is null,'an admin saves an unpublished page');
  perform pg_temp.assert_true(public.read_published_business_page('fictional-barber') is null,'an unpublished page is not served');

  page := public.set_business_page(ws,owner_id,'bp-owner@example.test','Fictional-Barber',true);
  perform pg_temp.assert_true(page->>'handle'='fictional-barber' and (page->>'published')::boolean and page->>'publishedAt' is not null,'publishing lowercases the handle and stamps the time');
  perform pg_temp.assert_true(public.read_business_page(ws,member_id,'bp-member@example.test')->>'handle'='fictional-barber','a member reads the settings');

  published := public.read_published_business_page('fictional-barber');
  perform pg_temp.assert_true(published->>'workspaceId'=ws::text and published->'facts'=facts->'facts' and published->'services'=facts->'services' and published->'policyFacts'=facts->'policyFacts','the public read serves the same confirmed facts');
  perform pg_temp.assert_true(not (published ? 'email') and not (published->'facts' ? 'owner_recipient'),'no recipient or guessed contact is public');
  perform pg_temp.assert_true(public.read_published_business_page('Fictional-Barber') is null and public.read_published_business_page('x') is null and public.read_published_business_page(null) is null,'only exact valid handles resolve');

  -- One business per handle; renaming frees the old one.
  perform pg_temp.expect_error(format('select public.set_business_page(%L,%L,%L,%L,%L)',other_ws,other_owner,'bp-other@example.test','fictional-barber',true),'business_page_handle_taken');
  perform public.set_business_page(ws,owner_id,'bp-owner@example.test','fictional-barber-shop',true);
  perform pg_temp.assert_true(public.read_published_business_page('fictional-barber') is null and public.read_published_business_page('fictional-barber-shop') is not null,'a rename moves the page');
  perform public.set_business_page(other_ws,other_owner,'bp-other@example.test','fictional-barber',true);
  perform pg_temp.assert_true(public.read_published_business_page('fictional-barber')->>'workspaceId'=other_ws::text,'the freed handle can be taken');
  perform pg_temp.assert_true(public.read_published_business_page('fictional-barber')->'facts'='{}'::jsonb,'a business with no confirmed facts serves none');

  -- Unpublishing hides the page.
  page := public.set_business_page(ws,owner_id,'bp-owner@example.test','fictional-barber-shop',false);
  perform pg_temp.assert_true(public.read_published_business_page('fictional-barber-shop') is null,'unpublished pages disappear');

  -- The owner approves the pending changes in Needs you: then, and only
  -- then, they are public, on the page and on connected sites alike.
  page := public.set_business_page(ws,owner_id,'bp-owner@example.test','fictional-barber-shop',true);
  review := public.read_business_fact_review(ws);
  item := public.open_owner_decision(ws, jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Confirm changes to your business details',
    'approveEffect','These details go live.','notYetEffect','Nothing changes.','sourceLifecycle','business_facts','sourceId',ws::text,
    'revisionHash',review->>'revisionHash','urgent',false,'adminMayDecide',false));
  perform public.claim_owner_decision(ws,(item->>'id')::uuid,review->>'revisionHash','approve','session',owner_id,'bp-owner@example.test',null);
  perform public.confirm_business_facts(ws,(item->>'id')::uuid,review->>'revisionHash');
  published := public.read_published_business_page('fictional-barber-shop');
  perform pg_temp.assert_true(published->'facts'->>'phone'='716-555-0199' and published->'facts' ? 'address' and published->'facts' ? 'description','owner-approved changes are served');
  perform pg_temp.assert_true(published->'policyFacts'->'deposit'->'value'->>'required'='true'
    and (published->'policyFacts'->'deposit'->>'updatedAt')::timestamptz > '2026-10-06T12:00:00Z','an approved policy change is served as of the decision');
  perform pg_temp.assert_true(not (published->'policyFacts' ?| array['booking_rules','response_time','service_area','payment_methods']),'approval does not make unverified terms published policy');
  perform pg_temp.assert_true(published->'services' @> '[{"name":"Beard trim","priceText":"$99"},{"name":"Verified wax"}]'::jsonb
    and not (published->'services' @> '[{"name":"Haircut"}]'::jsonb),'approved service changes, including a retirement, are served');
end $$;

rollback;
