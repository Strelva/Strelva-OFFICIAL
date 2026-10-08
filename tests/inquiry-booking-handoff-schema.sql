\set ON_ERROR_STOP on
begin;
create function pg_temp.ibh_assert(ok boolean,message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'inquiry booking assertion: %',message; end if; end $$;
create function pg_temp.ibh_expect(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end; raise exception 'expected refusal: %',statement; end $$;
insert into public.users(id,email,verified_at) values('e0000000-0000-4000-8000-000000000001','handoff-owner@example.test',now()),('e0000000-0000-4000-8000-000000000002','handoff-member@example.test',now());
insert into public.super_admins(user_id,email) values('e0000000-0000-4000-8000-000000000001','handoff-owner@example.test');
insert into public.tenants(id,stable_id,site_name,active) values('handoff-site','e0000000-0000-4000-8000-000000000010','Mooney Fixture',true);
create temporary table handoff_ws as select (public.convert_tenant_to_business('handoff-owner@example.test','handoff-site',
 '{"tenantId":"handoff-site","tenantStableId":"e0000000-0000-4000-8000-000000000010","workspaceName":"Mooney Fixture","billing":null,"account":null,"patch":{"facts":{"hours":{"value":{"timezone":"UTC","weekly":[{"day":5,"opens":"09:00","closes":"17:00"}]},"verified":false}},"services":[{"op":"upsert","name":"Consultation","durationMinutes":30,"active":true,"position":0,"externalRef":"consult"}]},"contacts":[]}',
 'e0000000-0000-4000-8000-000000000020',repeat('a',64))->>'workspaceId')::uuid id;
-- The owner has confirmed the imported details (#509).
\ir support/confirm-working-record.sql
select pg_temp.confirm_working_record(id) from handoff_ws;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,'e0000000-0000-4000-8000-000000000001','owner','e0000000-0000-4000-8000-000000000001' from handoff_ws on conflict(workspace_id,user_id) do update set role='owner';
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,'e0000000-0000-4000-8000-000000000002','member','e0000000-0000-4000-8000-000000000001' from handoff_ws;
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('e0000000-0000-4000-8000-000000000001','handoff-site','e0000000-0000-4000-8000-000000000010','owner');
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
 select id,'e0000000-0000-4000-8000-000000000010','handoff-site','Mooney Fixture','handoff',repeat('a',64),'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001' from handoff_ws on conflict do nothing;
insert into public.systems(business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
 select id,'Bookings','booking',gen_random_uuid(),repeat('b',64),'e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001' from handoff_ws;
insert into public.system_revisions(system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
 select s.id,s.business_workspace_id,1,'{"kind":"schedule","ref":"work:handoff"}',gen_random_uuid(),repeat('c',64),'e0000000-0000-4000-8000-000000000001' from public.systems s where s.business_workspace_id=(select id from handoff_ws) and kind='booking';
update public.systems s set lifecycle='live',current_revision_id=r.id,current_revision_number=1 from public.system_revisions r where r.system_id=s.id and s.business_workspace_id=(select id from handoff_ws);
select public.upsert_tenant_booking_settings('handoff-site','{"mode":"request","minNoticeMinutes":0,"bufferMinutes":0}','native');
select public.record_tenant_lead('handoff-site',jsonb_build_object('leadId','lead_handoff','submissionHash','handoff','name','Dana','email','dana@example.test','message','Could we talk?','capturedAt',now()),'dual_write');
select public.after_tenant_lead_capture('handoff-site','lead_handoff');
create temporary table handoff_lead as select id from public.tenant_leads where lead_id='lead_handoff';
select pg_temp.ibh_expect(format($q$select public.resolve_workspace_inquiry_booking_lead(%L,%L,'e0000000-0000-4000-8000-000000000002','handoff-member@example.test')$q$,(select id from handoff_ws),(select id from handoff_lead)),'inquiry_access_denied');
create temporary table handoff_state as select public.read_inquiry_booking_handoff('handoff-site','lead_handoff',null,null,null,null) state;
create temporary table handoff_slots as select jsonb_build_array(jsonb_build_object('start',now()+interval '2 days','end',now()+interval '2 days 30 minutes'),jsonb_build_object('start',now()+interval '2 days 1 hour','end',now()+interval '2 days 90 minutes')) slots;
create temporary table handoff_offer as select public.prepare_inquiry_booking_offer('handoff-site','lead_handoff',(select state->'witness' from handoff_state),(select id from public.business_services where workspace_id=(select id from handoff_ws)),(select slots from handoff_slots),null,null) offer;
select pg_temp.ibh_assert((select jsonb_array_length(offer->'slots')=2 from handoff_offer),'durable slots');
select pg_temp.ibh_assert((select public.prepare_inquiry_booking_offer('handoff-site','lead_handoff',(select state->'witness' from handoff_state),(select id from public.business_services where workspace_id=(select id from handoff_ws)),(select slots from handoff_slots),null,null)->>'id'=offer->>'id' from handoff_offer),'stable approval links');
select pg_temp.ibh_assert((select public.read_inquiry_booking_offer((offer->>'id')::uuid)->'booking'='null'::jsonb from handoff_offer),'GET creates no booking');
select pg_temp.ibh_assert((select count(*)=0 from public.business_bookings where origin='inquiry'),'no booking on read');
-- Changed settings invalidate the signed proposal; no stale request can land.
select public.upsert_tenant_booking_settings('handoff-site','{"mode":"request","minNoticeMinutes":0,"bufferMinutes":15}','native');
select pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',(select offer->>'id' from handoff_offer)),'inquiry_booking_changed');
update public.booking_settings set revision=revision-1,buffer_minutes=0 where tenant_stable_id='e0000000-0000-4000-8000-000000000010';
-- Paused bookings refuse handoff without losing the retained inquiry.
update public.systems set lifecycle='paused' where business_workspace_id=(select id from handoff_ws) and kind='booking';
select pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',(select offer->>'id' from handoff_offer)),'inquiry_booking_unavailable');
update public.systems set lifecycle='live' where business_workspace_id=(select id from handoff_ws) and kind='booking';
-- A revoked website grant refuses the same link.
savepoint handoff_revoke;
update public.offering_website_bindings set revision=revision+1,status='revoked',revoked_by='e0000000-0000-4000-8000-000000000001',revoked_at=now(),revocation_reason='Fixture revocation' where tenant_stable_id='e0000000-0000-4000-8000-000000000010';
select pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',(select offer->>'id' from handoff_offer)),'inquiry_booking_unavailable');
rollback to savepoint handoff_revoke;
-- Held/spam review closes all new handoffs while retaining the inquiry.
savepoint handoff_spam;
update public.tenant_leads set intake_state='confirmed_spam' where id=(select id from handoff_lead);
select pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',(select offer->>'id' from handoff_offer)),'inquiry_booking_unavailable');
rollback to savepoint handoff_spam;
-- Exit refuses new commitments.
savepoint handoff_exit;
insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at)
 select id,'e0000000-0000-4000-8000-000000000001','handoff-exit',repeat('f',64),'pause','keep','stop','{"status":"completed"}',now() from handoff_ws;
select pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',(select offer->>'id' from handoff_offer)),'inquiry_booking_unavailable');
rollback to savepoint handoff_exit;
create temporary table handoff_booking as select public.choose_inquiry_booking_slot((select offer->>'id' from handoff_offer)::uuid,0) booking;
-- Before #529 the choice is a request; after it, an expiring hold awaiting the customer's email confirmation.
select pg_temp.ibh_assert((select booking->>'status'=case when to_regclass('public.public_booking_requests') is null then 'requested' else 'held' end and booking->>'origin'='inquiry' and booking->>'inquiryId'='lead_handoff' and booking->>'contactId' is not null from handoff_booking),'same store request with contact and inquiry');
select pg_temp.ibh_assert((select booking->>'contactId'=(select id::text from public.business_contacts where workspace_id=(select id from handoff_ws) and email='dana@example.test') and booking->>'businessServiceId'=(select id::text from public.business_services where workspace_id=(select id from handoff_ws)) from handoff_booking),'one shared contact and service');
select pg_temp.ibh_assert((select count(*)=1 from public.business_booking_history where booking_id=(select (booking->>'id')::uuid from handoff_booking)),'one booking history');
select pg_temp.ibh_assert((select public.choose_inquiry_booking_slot((offer->>'id')::uuid,1)->>'id'=(select booking->>'id' from handoff_booking) from handoff_offer),'second selection cannot create another booking');
do $$ begin
  if to_regclass('public.public_booking_requests') is null then
    perform public.set_tenant_booking_status('handoff-site',(select booking->>'id' from handoff_booking),'confirmed','owner',null);
    perform pg_temp.ibh_assert((select public.choose_inquiry_booking_slot((offer->>'id')::uuid,0)->>'status'='confirmed' from handoff_offer),'retry cannot reset confirmation');
  else
    -- #529: the owner cannot confirm an inquiry hold the customer never confirmed by email.
    perform pg_temp.ibh_expect(format('select public.set_tenant_booking_status(%L,%L,%L,%L,null)','handoff-site',(select booking->>'id' from handoff_booking),'confirmed','owner'),'booking_email_confirmation_required');
    perform pg_temp.ibh_assert((select public.choose_inquiry_booking_slot((offer->>'id')::uuid,0)->>'status'='held' from handoff_offer),'retry keeps the unconfirmed hold');
  end if;
end $$;
select pg_temp.ibh_assert(not has_table_privilege('service_role','public.inquiry_booking_offers','select') and not has_function_privilege('authenticated','public.choose_inquiry_booking_slot(uuid,integer)','execute'),'RPC boundary');
-- A business without any managed website can hand an inquiry to its own booking System.
do $$
declare ws uuid:='e0000000-0000-4000-8000-000000000040'; own uuid:='e0000000-0000-4000-8000-000000000001'; site uuid; sys uuid; rev uuid; svc uuid; lead uuid; w jsonb; o jsonb; b jsonb; key text:='sk_pub_'||repeat('n',24); slots jsonb;
begin
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Standalone native fixture',own);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,own,'owner',own);
  insert into public.business_records(workspace_id,created_by,updated_by) values(ws,own,own);
  insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by)
    values(ws,'hours','{"timezone":"UTC","weekly":[{"day":5,"opens":"09:00","closes":"17:00"}]}','owner',true,own);
  insert into public.business_services(workspace_id,name,duration_minutes,source,verified,created_by,updated_by)
    values(ws,'Consultation',30,'owner',true,own,own) returning id into svc;
  perform pg_temp.confirm_working_record(ws);
  insert into public.systems(business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
    values(ws,'Native appointments','booking',gen_random_uuid(),repeat('a',64),own,own) returning id into sys;
  insert into public.system_revisions(system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
    values(sys,ws,1,'{"kind":"schedule","ref":"work:native-fixture"}',gen_random_uuid(),repeat('b',64),own) returning id into rev;
  update public.systems set lifecycle='live',current_revision_id=rev,current_revision_number=1 where id=sys;
  insert into public.booking_settings(calendar_key,workspace_id,mode,min_notice_minutes,buffer_minutes,recorded_via) values(ws,ws,'request',0,0,'native');
  site:=(public.create_connected_site(ws,own,'handoff-owner@example.test',jsonb_build_object('publicKey',key,'verificationToken',repeat('n',32),'label','Outside website','siteUrl','https://native-handoff.example/','siteHost','native-handoff.example','allowedOrigins',jsonb_build_array('https://native-handoff.example')))->>'id')::uuid;
  perform public.confirm_connected_site_verification(ws,own,'handoff-owner@example.test',site,array[repeat('n',32)]);
  lead:=(public.record_connected_site_inquiry_v2(key,'https://native-handoff.example',jsonb_build_object('leadId','lead_native','submissionHash','native','name','Alex','email','alex@example.test','capturedAt',now()))->>'id')::uuid;
  perform pg_temp.ibh_assert(public.resolve_workspace_inquiry_booking_lead(ws,lead,own,'handoff-owner@example.test')->>'tenantId' is null,'no website purchase required');
  w:=public.read_inquiry_booking_handoff(null,lead::text,ws,lead,own,'handoff-owner@example.test');
  slots:=jsonb_build_array(jsonb_build_object('start',now()+interval '3 days','end',now()+interval '3 days 30 minutes'));
  -- #509: a pending rename and new length never reach the customer's offer.
  if to_regprocedure('public.business_confirmed_services(uuid)') is not null then
    update public.business_services set name='Operator rename',duration_minutes=120 where id=svc;
  end if;
  o:=public.prepare_inquiry_booking_offer(null,lead::text,w->'witness',svc,slots,own,'handoff-owner@example.test');
  perform pg_temp.ibh_assert(o->>'serviceName'='Consultation' and o->'services'->0->>'name'='Consultation' and o->'services'->0->>'durationMinutes'='30','offer names the confirmed service');
  update public.business_services set name='Consultation',duration_minutes=30 where id=svc;
  perform pg_temp.ibh_assert(public.read_inquiry_booking_offer((o->>'id')::uuid)->>'workspaceId'=ws::text,'native public choice bound to business');
  b:=public.choose_inquiry_booking_slot((o->>'id')::uuid,0);
  perform pg_temp.ibh_assert(b->>'status'=case when to_regclass('public.public_booking_requests') is null then 'requested' else 'held' end and b->>'tenantStableId' is null and b->>'calendarKey'=ws::text and b->>'inquiryId'=lead::text,'one native booking store request');
  perform pg_temp.ibh_assert(b->>'contactId'=(select contact_id::text from public.tenant_leads where id=lead),'native inquiry and booking share original contact');
  -- #529: an unconfirmed hold reaches the owner only after the customer's email confirmation.
  perform pg_temp.ibh_assert(jsonb_array_length(public.read_workspace_booking_requests(ws))=case when to_regclass('public.public_booking_requests') is null then 1 else 0 end,'native request reaches existing Needs you seam only once requested');
  perform pg_temp.ibh_assert(jsonb_array_length(public.read_inquiry_workspace_bookings(ws,null,null))=1,'native request holds time');
  perform pg_temp.ibh_assert(public.choose_inquiry_booking_slot((o->>'id')::uuid,0)->>'id'=b->>'id','native retry stable');
  -- Same exclusion covers every native inquiry; held appointment refuses the other source.
  lead:=(public.record_connected_site_inquiry_v2(key,'https://native-handoff.example',jsonb_build_object('leadId','lead_native_conflict','submissionHash','native2','name','Jordan','email','jordan@example.test','capturedAt',now()))->>'id')::uuid;
  w:=public.read_inquiry_booking_handoff(null,lead::text,ws,lead,own,'handoff-owner@example.test');
  o:=public.prepare_inquiry_booking_offer(null,lead::text,w->'witness',svc,slots,own,'handoff-owner@example.test');
  perform pg_temp.ibh_assert(public.choose_inquiry_booking_slot((o->>'id')::uuid,0) is null,'native exclusion refuses overlap');
  update public.connected_sites set status='revoked',revoked_at=now() where id=site;
  perform pg_temp.ibh_expect(format('select public.choose_inquiry_booking_slot(%L,0)',o->>'id'),'inquiry_booking_unavailable');
end $$;

rollback;
