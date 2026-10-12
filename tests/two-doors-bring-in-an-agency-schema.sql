-- ADR 0015 (20261023142000): Bring in an agency. Directory listing, owner
-- proposal with scoped levels, agency acceptance, one full_control agency per
-- scope, agency decisions inside full_control only, and ending one agency.
\set ON_ERROR_STOP 1
begin;
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm <> expected then raise exception 'expected %, got %', expected, sqlerrm; end if; return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end $$;
insert into public.users(id,email,verified_at) values
  ('7f000000-0000-4000-8000-000000000001','owner@bakery.example.test',now()),
  ('7f000000-0000-4000-8000-000000000002','lead@north.example.test',now()),
  ('7f000000-0000-4000-8000-000000000003','lead@strelva-agency.example.test',now()),
  ('7f000000-0000-4000-8000-000000000004','staff@north.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('7f000000-0000-4000-8000-0000000000b1','customer','Bakery','7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-0000000000a1','agency','North Studio','7f000000-0000-4000-8000-000000000002'),
  ('7f000000-0000-4000-8000-0000000000a2','agency','Strelva Agency','7f000000-0000-4000-8000-000000000003'),
  ('7f000000-0000-4000-8000-0000000000a3','agency','Unlisted Shop','7f000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('7f000000-0000-4000-8000-0000000000b1','7f000000-0000-4000-8000-000000000001','owner','7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-0000000000a1','7f000000-0000-4000-8000-000000000002','owner','7f000000-0000-4000-8000-000000000002'),
  ('7f000000-0000-4000-8000-0000000000a1','7f000000-0000-4000-8000-000000000004','member','7f000000-0000-4000-8000-000000000002'),
  ('7f000000-0000-4000-8000-0000000000a2','7f000000-0000-4000-8000-000000000003','owner','7f000000-0000-4000-8000-000000000003'),
  ('7f000000-0000-4000-8000-0000000000a3','7f000000-0000-4000-8000-000000000002','owner','7f000000-0000-4000-8000-000000000002');

do $$
declare
  owner_id constant uuid := '7f000000-0000-4000-8000-000000000001';
  north constant uuid := '7f000000-0000-4000-8000-0000000000a1';
  strelva_agency constant uuid := '7f000000-0000-4000-8000-0000000000a2';
  bakery constant uuid := '7f000000-0000-4000-8000-0000000000b1';
  directory jsonb; agencies jsonb; item jsonb; result jsonb; h text := repeat('f',64);
begin
  -- Listing is opt-in by the agency's own managers; the directory has no ranking.
  perform pg_temp.expect_error(format('select public.set_agency_directory_listing(%L,%L,%L,%L,true)','7f000000-0000-4000-8000-000000000004','staff@north.example.test',north,'Websites for bakeries'),'agency_directory_denied');
  perform public.set_agency_directory_listing('7f000000-0000-4000-8000-000000000003','lead@strelva-agency.example.test',strelva_agency,'Managed websites, done for you.',true);
  perform public.set_agency_directory_listing('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,'Websites for bakeries',true);
  directory := public.read_agency_directory(owner_id,'owner@bakery.example.test');
  if jsonb_array_length(directory) <> 2 or directory->0->>'name' <> 'North Studio' or directory->1->>'name' <> 'Strelva Agency' then
    raise exception 'directory should list both agencies in name order: %', directory;
  end if;

  -- Only listed agencies (or ones already serving) can be brought in, and only by the owner.
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,'7f000000-0000-4000-8000-0000000000a3','[{"scope":"website","level":"prepare"}]','I agree'),'agency_not_listed');
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)','7f000000-0000-4000-8000-000000000002','lead@north.example.test',bakery,north,'[{"scope":"website","level":"prepare"}]','I agree'),'provider_seat_owner_required');

  -- Proposal grants nothing until the agency accepts.
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"full_control"},{"scope":"google","level":"prepare"}]','North Studio may run the website and prepare Google posts.');
  if exists (select 1 from public.provider_seats where customer_workspace_id=bakery) then raise exception 'a proposal opened a seat'; end if;
  -- One full_control agency per scope, even while proposed.
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,strelva_agency,'[{"scope":"website","level":"full_control"}]','I agree'),'agency_scope_taken');

  result := public.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery,true);
  if result->>'status' <> 'accepted' then raise exception 'acceptance failed: %', result; end if;
  if not exists (select 1 from public.provider_seats where customer_workspace_id=bakery and agency_workspace_id=north and status='active') then raise exception 'acceptance opened no seat'; end if;
  if not exists (select 1 from public.workspace_providers where customer_workspace_id=bakery and provider_workspace_id=north and status='active') then raise exception 'first agency should be of record'; end if;
  if public.business_scope_full_control(bakery,'website') is distinct from north then raise exception 'full control not resolved'; end if;

  -- A second agency for another scope: the business has several agencies.
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,strelva_agency,'[{"scope":"bookings","level":"full_control"}]','Strelva Agency may run bookings.');
  perform public.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000003','lead@strelva-agency.example.test',strelva_agency,bakery,true);
  agencies := public.read_business_agencies(owner_id,'owner@bakery.example.test',bakery);
  if jsonb_array_length(agencies) <> 2 then raise exception 'expected two agencies: %', agencies; end if;
  if public.business_single_agency(bakery) is not null then raise exception 'two agencies must not resolve to one'; end if;
  if not exists (select 1 from public.workspace_providers where customer_workspace_id=bakery and provider_workspace_id=north and status='active') then raise exception 'second agency replaced the agency of record'; end if;

  -- Full control: North's staffed member decides website items as the agency, not other scopes.
  insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,status,assigned_by)
    values (north,bakery,'7f000000-0000-4000-8000-000000000004','active','7f000000-0000-4000-8000-000000000002');
  item := public.open_owner_decision(bakery,jsonb_build_object('kind','copy.routine','route','owner_decides','title','Update the hours line',
    'approveEffect','The new hours go live.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId','hours:1','revisionHash',h,'adminMayDecide',false));
  result := public.claim_owner_decision(bakery,(item->>'id')::uuid,h,'approve','agency','7f000000-0000-4000-8000-000000000004','staff@north.example.test',null);
  if result->>'status' <> 'claimed' or result->'item'->>'decidedByKind' is distinct from 'agency_session' and (select decided_by_kind from public.owner_decisions where id=(item->>'id')::uuid) <> 'agency_session' then
    raise exception 'full-control agency could not decide: %', result;
  end if;
  item := public.open_owner_decision(bakery,jsonb_build_object('kind','google.post','route','owner_decides','title','Post this week''s tip',
    'approveEffect','The post goes up.','notYetEffect','Nothing is posted.','sourceLifecycle','google_post','sourceId','post:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.expect_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)',bakery,item->>'id',h,'approve','agency','7f000000-0000-4000-8000-000000000004','staff@north.example.test'),'owner_decision_owner_only');
  item := public.open_owner_decision(bakery,jsonb_build_object('kind','money','route','owner_decides','title','Change the plan',
    'approveEffect','The plan changes.','notYetEffect','Nothing changes.','sourceLifecycle','money','sourceId','plan:1','revisionHash',h,'adminMayDecide',false));
  perform pg_temp.expect_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)',bakery,item->>'id',h,'approve','agency','7f000000-0000-4000-8000-000000000004','staff@north.example.test'),'owner_decision_owner_only');
  -- The owner still decides as before.
  result := public.claim_owner_decision(bakery,(item->>'id')::uuid,h,'approve','session',owner_id,'owner@bakery.example.test',null);
  if result->>'status' <> 'claimed' then raise exception 'owner session claim broke: %', result; end if;

  -- Ending one agency leaves the other.
  perform public.end_agency_for_business(owner_id,'owner@bakery.example.test',bakery,north,null);
  if exists (select 1 from public.provider_seats where customer_workspace_id=bakery and agency_workspace_id=north and status='active') then raise exception 'ended agency kept its seat'; end if;
  if public.business_scope_full_control(bakery,'website') is not null then raise exception 'ended agency kept full control'; end if;
  if public.business_single_agency(bakery) is distinct from strelva_agency then raise exception 'the remaining agency should be the single agency'; end if;
end $$;
rollback;
