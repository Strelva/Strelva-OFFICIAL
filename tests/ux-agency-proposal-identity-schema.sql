-- AG4 exact proposal acceptance and current owner authority; fictional local data.
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
  lead_id constant uuid := '7f000000-0000-4000-8000-000000000002';
  north constant uuid := '7f000000-0000-4000-8000-0000000000a1';
  bakery constant uuid := '7f000000-0000-4000-8000-0000000000b1';
  old_pin text; current_pin text; result jsonb;
begin
  if has_function_privilege('service_role','public.respond_to_agency_proposal_before_ux_agency_identity(uuid,text,uuid,uuid,boolean)','EXECUTE')
    or has_function_privilege('authenticated','public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text)','EXECUTE')
    or has_function_privilege('anon','public.read_agency_proposals(uuid,text,uuid)','EXECUTE') then
    raise exception 'proposal authority bypass exposed';
  end if;
  perform public.set_agency_directory_listing(lead_id,'lead@north.example.test',north,'Websites for bakeries',true);
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"prepare"}]','Original prepare access');
  old_pin := public.agency_proposal_identity(bakery,north);
  result := public.read_agency_proposals(lead_id,'lead@north.example.test',north);
  if old_pin is null or length(old_pin) <> 64 or result->0->>'proposalId' is distinct from old_pin then
    raise exception 'read did not bind exact proposal identity';
  end if;
  perform public.respond_to_agency_proposal(lead_id,'lead@north.example.test',north,bakery,true,old_pin);
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"prepare"}]','First amendment');
  old_pin := public.agency_proposal_identity(bakery,north);
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"full_control"},{"scope":"bookings","level":"prepare"}]','Replacement amendment');
  current_pin := public.agency_proposal_identity(bakery,north);
  if current_pin is null or current_pin = old_pin then raise exception 'replacement reused immutable identity'; end if;
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)',lead_id,'lead@north.example.test',north,bakery,old_pin),'agency_proposal_stale');
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,false,%L)',lead_id,'lead@north.example.test',north,bakery,old_pin),'agency_proposal_stale');
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true)',lead_id,'lead@north.example.test',north,bakery),'agency_proposal_identity_required');
  perform pg_temp.expect_error(format('update public.agency_scope_grants set consent=%L where customer_workspace_id=%L and status=%L','Different terms',bakery,'proposed'),'agency_proposal_immutable');
  perform pg_temp.expect_error(format('update public.agency_scope_grants set level=%L where customer_workspace_id=%L and status=%L and scope=%L','prepare',bakery,'proposed','website'),'agency_proposal_immutable');
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)','7f000000-0000-4000-8000-000000000004','staff@north.example.test',north,bakery,current_pin),'agency_directory_denied');
  -- Former owners cannot leave transferable consent behind for a new owner.
  update public.workspace_memberships set role='admin' where workspace_id=bakery and user_id=owner_id;
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (bakery,lead_id,'owner',owner_id);
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)',lead_id,'lead@north.example.test',north,bakery,current_pin),'agency_proposal_owner_required');
  delete from public.workspace_memberships where workspace_id=bakery and user_id=lead_id;
  update public.workspace_memberships set role='owner' where workspace_id=bakery and user_id=owner_id;
  update public.users set verified_at=null where id=owner_id;
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)',lead_id,'lead@north.example.test',north,bakery,current_pin),'agency_proposal_owner_required');
  update public.users set verified_at=now() where id=owner_id;
  if public.business_scope_full_control(bakery,'website') is not null
    or (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and status='active') <> 1
    or public.agency_proposal_identity(bakery,north) is distinct from current_pin then
    raise exception 'failed acceptance changed pending or active grants';
  end if;
  result := public.respond_to_agency_proposal(lead_id,'lead@north.example.test',north,bakery,true,current_pin);
  if result->>'status' <> 'accepted' or public.business_scope_full_control(bakery,'website') is distinct from north
    or (select count(*) from public.agency_scope_grants where customer_workspace_id=bakery and status='active') <> 2 then
    raise exception 'exact current acceptance did not activate complete scope set';
  end if;
  perform pg_temp.expect_error(format('select public.respond_to_agency_proposal(%L,%L,%L,%L,true,%L)',lead_id,'lead@north.example.test',north,bakery,current_pin),'agency_proposal_not_found');
  perform public.bring_in_agency(owner_id,'owner@bakery.example.test',bakery,north,'[{"scope":"website","level":"prepare"}]','Decline current amendment');
  current_pin := public.agency_proposal_identity(bakery,north);
  result := public.respond_to_agency_proposal(lead_id,'lead@north.example.test',north,bakery,false,current_pin);
  if result->>'status' <> 'declined' or public.business_scope_full_control(bakery,'website') is distinct from north then
    raise exception 'decline lost original active grant';
  end if;
end $$;
rollback;
