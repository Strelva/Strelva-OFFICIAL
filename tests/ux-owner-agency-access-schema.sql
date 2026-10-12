-- A7 complete access replacement; local fictional fixtures only.
\set ON_ERROR_STOP 1
begin;
\ir support/agency-proposal-response.sql
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
  other_agency constant uuid := '7f000000-0000-4000-8000-0000000000a2';
  bakery constant uuid := '7f000000-0000-4000-8000-0000000000b1';
  result jsonb;
begin
  if has_function_privilege('service_role','public.bring_in_agency_before_ux_owner_access(uuid,text,uuid,uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('authenticated','public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean)','EXECUTE') then
    raise exception 'access mutation bypass exposed';
  end if;
  perform public.set_agency_directory_listing('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,'Websites for bakeries',true);
  perform public.set_agency_directory_listing('7f000000-0000-4000-8000-000000000003','lead@strelva-agency.example.test',other_agency,'Bookings',true);
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"full_control"},{"scope":"google","level":"prepare"}]','Original access');
  perform pg_temp.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery,true);
  -- Current, unlisted agencies can still be amended by their business owner.
  perform public.set_agency_directory_listing('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,null,false);
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"prepare"},{"scope":"bookings","level":"full_control"}]','Reduce website; remove Google; add bookings');
  if public.business_scope_full_control(bakery,'website') is distinct from north
    or public.business_scope_full_control(bakery,'bookings') is not null
    or (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and agency_workspace_id=north and status='active') <> 2 then
    raise exception 'pending amendment changed active access';
  end if;
  -- Active and proposed Full control both reserve the area against other agencies.
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,other_agency,'[{"scope":"website","level":"full_control"}]','Conflict'),'agency_scope_taken');
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,other_agency,'[{"scope":"bookings","level":"full_control"}]','Conflict'),'agency_scope_taken');
  -- Agency decline leaves every original area and level intact.
  perform pg_temp.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery,false);
  if public.business_scope_full_control(bakery,'website') is distinct from north
    or (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and agency_workspace_id=north and status='active') <> 2 then
    raise exception 'decline removed current access';
  end if;
  -- Replacing an open amendment preserves active grants and records the old proposal as ended.
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"full_control"}]','Keep website only');
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"prepare"},{"scope":"bookings","level":"full_control"}]','Replacement');
  if (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and agency_workspace_id=north and status='active') <> 2
    or (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and agency_workspace_id=north and status='proposed') <> 2 then
    raise exception 'replacement changed current access or left old proposal';
  end if;
  perform pg_temp.expect_error(format('select pg_temp.respond_to_agency_proposal(%L,%L,%L,%L,true)','7f000000-0000-4000-8000-000000000004','staff@north.example.test',north,bakery),'agency_directory_denied');
  result := pg_temp.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery,true);
  if result->>'status' <> 'accepted' or public.business_scope_full_control(bakery,'website') is not null
    or public.business_scope_full_control(bakery,'bookings') is distinct from north
    or exists (select 1 from public.agency_scope_grants where customer_workspace_id=bakery and agency_workspace_id=north and scope='google' and status='active') then
    raise exception 'accepted replacement did not lower, add and remove areas';
  end if;
  if not exists (select 1 from public.provider_seats where customer_workspace_id=bakery and agency_workspace_id=north and status='active') then
    raise exception 'changing access ended provider seat';
  end if;
  perform pg_temp.expect_error(format('select pg_temp.respond_to_agency_proposal(%L,%L,%L,%L,true)','7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery),'agency_proposal_not_found');
  -- Raising own control level is equally provisional until acceptance.
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"full_control"}]','Raise website; remove bookings');
  if public.business_scope_full_control(bakery,'website') is not null then raise exception 'raise granted early'; end if;
  perform pg_temp.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test',north,bakery,true);
  if public.business_scope_full_control(bakery,'website') is distinct from north or public.business_scope_full_control(bakery,'bookings') is not null then
    raise exception 'raise failed to replace complete scope set';
  end if;
  -- Invalid amendments are atomic and cannot drop current or proposed grants.
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"wrong"}]','Invalid'),'agency_scopes_invalid');
  perform pg_temp.expect_error(format('select public.bring_in_agency(%L,%L,%L,%L,%L,%L)',owner_id,'owner@bakery.example.test',bakery,north,'[]','Invalid'),'agency_scopes_invalid');
  if public.business_scope_full_control(bakery,'website') is distinct from north then raise exception 'invalid amendment changed authority'; end if;
end $$;
rollback;
