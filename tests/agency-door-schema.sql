-- Disposable local database only, after all forward migrations. Never commits.
-- The agency door end to end in SQL: sign up as an agency, add a client, the
-- owner claim is NOT sent (email is held), the owner claims, a Needs you
-- decision lands, and the agency sees only the outcome. Fictional rows only.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.door_assert(ok boolean, note text) returns void language plpgsql as $$ begin
  if ok is not true then raise exception 'agency door: %', note; end if;
end $$;
create or replace function pg_temp.door_refuse(statement text, expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'agency door expected refusal: %', expected;
end $$;

insert into public.users(id, email, verified_at) values
  ('ad0d0000-0000-4000-8000-000000000001', 'ad-agency@a.example.test', now()),
  ('ad0d0000-0000-4000-8000-000000000002', 'ad-owner@client.example.test', now()),
  ('ad0d0000-0000-4000-8000-000000000003', 'ad-other@b.example.test', now());

set local role service_role;
do $door$
declare
  agency_user constant uuid := 'ad0d0000-0000-4000-8000-000000000001';
  owner_user constant uuid := 'ad0d0000-0000-4000-8000-000000000002';
  other_user constant uuid := 'ad0d0000-0000-4000-8000-000000000003';
  agency_email constant text := 'ad-agency@a.example.test';
  owner_email constant text := 'ad-owner@client.example.test';
  other_email constant text := 'ad-other@b.example.test';
  agency uuid; ws uuid; added jsonb; replay jsonb; claim jsonb; listing jsonb; accepted jsonb;
begin
  -- a) Signing up as an agency creates the workspace and turns Systems on.
  agency := (select id from public.create_agency_workspace(agency_user, agency_email, 'Door Agency', true));
  perform pg_temp.door_assert(agency is not null, 'agency created');
  reset role; -- the tables are service-only; direct reads below check the stored truth
  perform pg_temp.door_assert(exists(select 1 from public.workspace_release_flags where workspace_id = agency and flag = 'systems' and state = 'on'), 'systems on for the new agency');
  set local role service_role;
  perform pg_temp.door_assert(public.read_agency_provider_seats(agency_user, agency_email, agency) = '[]'::jsonb, 'a new agency serves no one yet');
  perform pg_temp.door_refuse(format('select public.read_agency_provider_seats(%L, %L, %L)', other_user, other_email, agency), 'access_denied');

  -- b) Adding a client is idempotent: a replay returns the same business.
  added := public.agency_add_client_enrolled(agency_user, agency_email, agency,
    '{"name":"Door Bakery","sourceUrl":"https://door-bakery.example.test","facts":{}}', 'ad0d0000-0000-4000-8000-0000000000c1', repeat('1', 64), true);
  ws := (added->>'customerWorkspaceId')::uuid;
  perform pg_temp.door_assert(ws is not null and added->'replayed' = 'false'::jsonb, 'client added');
  replay := public.agency_add_client_enrolled(agency_user, agency_email, agency,
    '{"name":"Door Bakery","sourceUrl":"https://door-bakery.example.test","facts":{}}', 'ad0d0000-0000-4000-8000-0000000000c1', repeat('1', 64), true);
  perform pg_temp.door_assert(replay->'replayed' = 'true'::jsonb and (replay->>'customerWorkspaceId')::uuid = ws, 'replay returns the same client');
  reset role;
  perform pg_temp.door_assert(not exists(select 1 from public.workspace_memberships where workspace_id = ws and user_id = agency_user), 'the agency works through a seat, never as a member');
  set local role service_role;

  -- c) The owner link is issued, and nothing is sent.
  claim := public.issue_agency_client_owner_claim(agency_user, agency_email, agency, ws, owner_email, repeat('d', 64), now() + interval '14 days');
  perform pg_temp.door_assert(claim->'delivery'->>'status' = 'not_sent', 'claim is not sent while email is held');
  perform pg_temp.door_refuse(format('select public.issue_agency_client_owner_claim(%L, %L, %L, %L, %L, %L, now() + interval ''14 days'')', other_user, other_email, agency, ws, owner_email, repeat('e', 64)), 'access_denied');

  -- d) The agency's list says not sent, owner not claimed, and never holds the token.
  listing := public.list_agency_client_additions(agency_user, agency_email, agency);
  perform pg_temp.door_assert(listing->0->>'ownerClaimed' = 'false' and listing->0->'pendingClaim'->'delivery'->>'status' = 'not_sent', 'list says claim not sent');
  perform pg_temp.door_assert(position(repeat('d', 64) in listing::text) = 0, 'the token hash never leaves the database');
  perform pg_temp.door_refuse(format('select public.list_agency_client_additions(%L, %L, %L)', other_user, other_email, agency), 'access_denied');

  -- e) Only the addressed owner can accept; a stranger is refused.
  perform pg_temp.door_assert(public.read_agency_client_owner_claim(repeat('d', 64))->>'status' = 'pending', 'claim is pending');
  perform pg_temp.door_refuse(format('select public.accept_agency_client_owner_claim(%L, %L, %L)', repeat('d', 64), other_user, other_email), 'agency_client_claim_recipient_mismatch');
  accepted := public.accept_agency_client_owner_claim(repeat('d', 64), owner_user, owner_email);
  perform pg_temp.door_assert(accepted->>'status' = 'accepted', 'owner accepted the claim');

  -- f) Accepting changed ownership, not delivery: still nothing was sent.
  perform pg_temp.door_assert(public.list_agency_client_additions(agency_user, agency_email, agency)->0->>'ownerClaimed' = 'true', 'owner claimed');
  reset role;
  perform pg_temp.door_assert((select delivery->>'status' from public.agency_client_owner_claims where customer_workspace_id = ws order by created_at desc limit 1) = 'not_sent', 'delivery stays not sent');
  set local role service_role;

  perform set_config('door.agency', agency::text, true);
  perform set_config('door.ws', ws::text, true);
end $door$;

-- g) Fixture: a Release's Make it live decision on the client's website. The
-- fixture stands in for the real producer, which is outside this proof.
reset role;
insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by) values
  ('ad0d0000-0000-4000-8000-0000000000a1', current_setting('door.ws')::uuid, 'Door Bakery website', 'website',
   'ad0d0000-0000-4000-8000-0000000000a1', repeat('a', 64), 'ad0d0000-0000-4000-8000-000000000001', 'ad0d0000-0000-4000-8000-000000000001');
insert into public.owner_decisions(id, workspace_id, system_id, change_kind, route, title, approve_effect, not_yet_effect, source_lifecycle, source_id, revision_hash, sign_in_required, expires_at) values
  ('ad0d0000-0000-4000-8000-0000000000d1', current_setting('door.ws')::uuid, 'ad0d0000-0000-4000-8000-0000000000a1', 'system.go_live', 'owner_decides',
   'Make the Door Bakery website live', 'The website goes live.', 'The website stays private.', 'system_release', 'door-fixture', repeat('c', 64), false, now() + interval '1 day');

set local role service_role;
do $door$
declare
  agency constant uuid := current_setting('door.agency')::uuid;
  ws constant uuid := current_setting('door.ws')::uuid;
  agency_user constant uuid := 'ad0d0000-0000-4000-8000-000000000001';
  owner_user constant uuid := 'ad0d0000-0000-4000-8000-000000000002';
  other_user constant uuid := 'ad0d0000-0000-4000-8000-000000000003';
  decision constant uuid := 'ad0d0000-0000-4000-8000-0000000000d1';
  home jsonb; queue jsonb; claimed jsonb;
begin
  -- h) The agency sees the decision open, as shared status only.
  home := public.read_agency_client_home(ws, agency_user, 'ad-agency@a.example.test');
  perform pg_temp.door_assert(jsonb_array_length(home->'decisions') = 1 and home->'decisions'->0->>'state' = 'open', 'agency sees one open decision');
  queue := public.agency_client_overview_v3(agency, agency_user, 'ad-agency@a.example.test', null, 10)->'queue';
  perform pg_temp.door_assert(exists(select 1 from jsonb_array_elements(queue) q where q->>'kind' = 'needs_you'), 'agency Queue shows the decision');

  -- i) The agency cannot decide for the business; the owner can.
  perform pg_temp.door_refuse(format('select public.claim_owner_decision(%L, %L, %L, ''approve'', ''session'', %L, %L, null)', ws, decision, repeat('c', 64), agency_user, 'ad-agency@a.example.test'), 'owner_decision_permission_denied');
  claimed := public.claim_owner_decision(ws, decision, repeat('c', 64), 'approve', 'session', owner_user, 'ad-owner@client.example.test', null);
  perform pg_temp.door_assert(claimed->>'status' = 'claimed', 'owner claimed the decision');
  perform public.finish_owner_decision(ws, decision, 'done', null, 'fixture:door');

  -- j) The agency sees the outcome, no longer waiting, and strangers see nothing.
  home := public.read_agency_client_home(ws, agency_user, 'ad-agency@a.example.test');
  perform pg_temp.door_assert(home->'decisions'->0->>'state' = 'approved', 'agency sees Approved by the business');
  queue := public.agency_client_overview_v3(agency, agency_user, 'ad-agency@a.example.test', null, 10)->'queue';
  perform pg_temp.door_assert(not exists(select 1 from jsonb_array_elements(queue) q where q->>'kind' = 'needs_you'), 'decided work leaves the Queue');
  perform pg_temp.door_refuse(format('select public.read_agency_client_home(%L, %L, %L)', ws, other_user, 'ad-other@b.example.test'), 'access_denied');
end $door$;
rollback;
