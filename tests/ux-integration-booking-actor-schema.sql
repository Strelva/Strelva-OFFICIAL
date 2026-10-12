\set ON_ERROR_STOP 1
-- Prepared native selected-agency booking actor proof; every fictional row rolls back.
begin;
create function pg_temp.ux_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'booking actor proof: %',message; end if; end $$;
insert into public.users(id,email,verified_at) values
  ('b2000000-0000-4000-8000-000000000001','ux-owner@bakery.example.test',now()),
  ('b2000000-0000-4000-8000-000000000002','ux-lead@agency.example.test',now()),
  ('b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('b2000000-0000-4000-8000-0000000000b1','customer','Decision Bakery','b2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-0000000000a1','agency','Outside Agency','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','agency','Second Agency','b2000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-000000000001','owner','b2000000-0000-4000-8000-000000000001'),
  ('b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-000000000002','owner','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','b2000000-0000-4000-8000-000000000002','owner','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-000000000003','member','b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-0000000000a2','b2000000-0000-4000-8000-000000000003','member','b2000000-0000-4000-8000-000000000002');
update public.workspaces set agency_brand = '{"displayName":"Outside Brand","accentColor":"#325c42","replyTo":null,"logo":null,"credit":"runs_on_strelva"}'
  where id = 'b2000000-0000-4000-8000-0000000000a1';
update public.workspaces set agency_brand = '{"displayName":"Strelva","accentColor":"#325c42","replyTo":null,"logo":null,"credit":"runs_on_strelva"}'
  where id = 'b2000000-0000-4000-8000-0000000000a2';
insert into public.systems(id,business_workspace_id,name,kind,origin_kind,origin_ref,command_id,command_digest,created_by,updated_by)
  values(public.system_origin_id('b2000000-0000-4000-8000-0000000000b1','saved_work','b2000000-0000-4000-8000-0000000000c1'),
    'b2000000-0000-4000-8000-0000000000b1','Client app','internal_app','saved_work','b2000000-0000-4000-8000-0000000000c1',
    gen_random_uuid(),repeat('1',64),'b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001');


insert into public.business_bookings(id,calendar_key,workspace_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via,created_at)
values('b2000000-0000-4000-8000-0000000000d1','b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000b1','requested','owner','Consultation','2030-10-12T12:00:00Z','2030-10-12T13:00:00Z','2030-10-12T13:00:00Z','America/New_York','Fictional Customer','customer@example.test','native',now());
select pg_temp.ux_assert(not has_function_privilege('authenticated','public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid)','EXECUTE'),'native authenticated cannot execute');
select pg_temp.ux_assert(has_function_privilege('service_role','public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid)','EXECUTE'),'service can execute');
do $$
declare owner_id uuid := 'b2000000-0000-4000-8000-000000000001'; lead_id uuid := 'b2000000-0000-4000-8000-000000000002';
  staff_id uuid := 'b2000000-0000-4000-8000-000000000003'; business uuid := 'b2000000-0000-4000-8000-0000000000b1';
  agency uuid := 'b2000000-0000-4000-8000-0000000000a1'; booking uuid := 'b2000000-0000-4000-8000-0000000000d1';
  item jsonb; claim jsonb; result jsonb; recorded jsonb; caught boolean := false;
begin
  perform public.set_agency_directory_listing(lead_id,'ux-lead@agency.example.test',agency,'Booking help',true);
  perform public.bring_in_agency(owner_id,'ux-owner@bakery.example.test',business,agency,'[{"scope":"bookings","level":"full_control"}]','I agree');
  perform public.respond_to_agency_proposal(lead_id,'ux-lead@agency.example.test',agency,business,true);
  perform public.set_agency_client_staff(lead_id,'ux-lead@agency.example.test',agency,business,staff_id,true);
  item := public.open_owner_decision(business,jsonb_build_object('kind','customer.commitment','route','owner_decides','title','Booking request: Fictional Customer','approveEffect','The booking is confirmed.','notYetEffect','The time is released.','sourceLifecycle','booking_request','sourceId',booking::text,'revisionHash',repeat('a',64)));
  claim := public.claim_scoped_agency_owner_decision(business,(item->>'id')::uuid,repeat('a',64),'approve',staff_id,'ux-staff@agency.example.test',agency);
  perform pg_temp.ux_assert(claim->>'status'='claimed','exact agency claim');
  perform pg_temp.ux_assert(claim->'item'->'actor'='null'::jsonb,'historical proposing actor stays absent');
  -- Claimed name survives later brand changes.
  update public.workspaces set agency_brand=jsonb_set(agency_brand,'{displayName}','"New Name"'::jsonb) where id=agency;
  begin perform public.decide_scoped_agency_booking_request(business,booking,'not_yet',(item->>'id')::uuid);
    exception when others then if sqlerrm <> 'booking_agency_decision_required' then raise; end if; caught := true; end;
  perform pg_temp.ux_assert(caught,'opposite decision rejected');
  -- Each refusal runs in a subtransaction, retaining the unchanged booking
  -- and restoring the simulated authority change after the expected error.
  caught := false;
  begin
    insert into public.super_admins(user_id,email) values(staff_id,'ux-staff@agency.example.test');
    perform public.decide_scoped_agency_booking_request(business,booking,'approve',(item->>'id')::uuid);
  exception when others then if sqlerrm <> 'booking_agency_access_denied' then raise; end if; caught := true; end;
  perform pg_temp.ux_assert(caught,'support cannot execute client booking after claim');
  caught := false;
  begin
    update public.agency_scope_grants set status='ended', ended_at=clock_timestamp(), ended_by=owner_id where customer_workspace_id=business and agency_workspace_id=agency and scope='bookings';
    perform public.decide_scoped_agency_booking_request(business,booking,'approve',(item->>'id')::uuid);
  exception when others then if sqlerrm <> 'booking_agency_access_denied' then raise; end if; caught := true; end;
  perform pg_temp.ux_assert(caught,'revoked grant cannot execute after claim');
  caught := false;
  begin
    delete from public.workspace_memberships where workspace_id=agency and user_id=staff_id;
    perform public.decide_scoped_agency_booking_request(business,booking,'approve',(item->>'id')::uuid);
  exception when others then if sqlerrm <> 'booking_agency_access_denied' then raise; end if; caught := true; end;
  perform pg_temp.ux_assert(caught,'revoked membership cannot execute after claim');
  result := public.decide_scoped_agency_booking_request(business,booking,'approve',(item->>'id')::uuid);
  perform pg_temp.ux_assert(result->>'status'='decided','booking confirmed');
  select actor_snapshot into recorded from public.business_booking_history where booking_id=booking order by at desc,id desc limit 1;
  perform pg_temp.ux_assert(recorded->>'displayName'='Outside Brand' and recorded->>'agencyId'=agency::text and recorded->>'userId'=staff_id::text,'exact action-time agency identity retained');
  perform pg_temp.ux_assert(public.read_workspace_booking(business,booking)->'lastChange'->'actorSnapshot'=recorded,'source last-change read retains snapshot');
  perform public.finish_owner_decision(business,(item->>'id')::uuid,'done',null,'booking:'||booking::text);
  perform pg_temp.ux_assert(exists(select 1 from jsonb_array_elements(public.read_strelva_handled(business,owner_id,'ux-owner@bakery.example.test',now()-interval '1 hour')) row where row->>'id'=item->>'id' and row->'decidedActor'=recorded),'handled feed retains deciding snapshot');
end $$;
-- Immutable history and populated rollback refusal are kept for coordinator review.
select pg_temp.ux_assert(exists(select 1 from public.business_booking_history where actor_snapshot is not null),'inverse must refuse this populated state');
rollback;
