\set ON_ERROR_STOP on
-- Connected inquiry records: local fictional businesses; every change rolls back.
begin;
create or replace function pg_temp.cir_assert(value boolean, message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'connected inquiry assertion: %', message; end if; end $$;
create or replace function pg_temp.cir_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%' || expected || '%' then return; end if; raise; end;
  raise exception 'expected %', expected;
end $$;
select pg_temp.cir_assert(not has_function_privilege('anon','public.record_connected_site_inquiry_v2(text,text,jsonb)','execute')
  and not has_function_privilege('authenticated','public.record_connected_site_spam_v2(text,text,text,jsonb,text,timestamptz)','execute')
  and has_function_privilege('service_role','public.read_connected_site_inquiries_v2(uuid,uuid,text,integer)','execute')
  and not has_function_privilege('service_role','public.after_connected_lead_capture(uuid)','execute')
  and not has_function_privilege('service_role','public.inquiry_lead_event_write(public.tenant_leads,text,text,text,jsonb,text)','execute'), 'RPC grants');
do $$
declare
  owner_id uuid := 'c1400000-0000-4000-8000-000000000001';
  member_id uuid := 'c1400000-0000-4000-8000-000000000002';
  other_id uuid := 'c1400000-0000-4000-8000-000000000003';
  ws uuid := 'c1400000-0000-4000-8000-000000000010';
  other_ws uuid := 'c1400000-0000-4000-8000-000000000011';
  key text := 'sk_pub_' || repeat('q',24);
  origin text := 'https://connected-inquiry.example';
  site_id uuid; kept uuid; held uuid; contact uuid; result jsonb; payload jsonb;
begin
  insert into public.users(id,email,verified_at) values
    (owner_id,'cir-owner@example.test',now()),(member_id,'cir-member@example.test',now()),(other_id,'cir-other@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values (ws,'customer','Connected inquiry fixture',owner_id),(other_ws,'customer','Other fixture',other_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
    (ws,owner_id,'owner',owner_id),(ws,member_id,'member',owner_id),(other_ws,other_id,'owner',other_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values (ws,owner_id,owner_id);
  site_id := (public.create_connected_site(ws,owner_id,'cir-owner@example.test',jsonb_build_object('publicKey',key,
    'verificationToken',repeat('d',32),'label','Fixture','siteUrl',origin||'/','siteHost','connected-inquiry.example','allowedOrigins',jsonb_build_array(origin),'platform','custom'))->>'id')::uuid;
  perform public.confirm_connected_site_verification(ws,owner_id,'cir-owner@example.test',site_id,array[repeat('d',32)]);
  payload := jsonb_build_object('leadId','lead_connected_kept','submissionHash','12345','name','Alex Fixture','email','Alex@example.test',
    'fields',jsonb_build_object('phone','716-555-0199'),'capturedAt','2026-10-06T12:00:00Z');
  perform pg_temp.cir_error(format('select public.record_connected_site_inquiry_v2(%L,%L,%L)',key,'https://wrong.example',payload),'connected_site_origin_denied');
  result := public.record_connected_site_inquiry_v2(key,origin,payload); kept := (result->>'id')::uuid;
  perform pg_temp.cir_assert(result->>'status'='recorded','kept capture');
  select contact_id into contact from public.tenant_leads where id=kept;
  perform pg_temp.cir_assert(contact is not null and exists(select 1 from public.business_contacts where id=contact and email='alex@example.test' and 'inquiry'=any(sources)), 'contact attached by email');
  perform pg_temp.cir_assert(public.record_connected_site_inquiry_v2(key,origin,payload)->>'status'='exists','capture replay');
  perform pg_temp.cir_assert((select count(*) from public.inquiry_events where connected_site_id=site_id and lead_id='lead_connected_kept')=2,'capture/event dedupe');
  payload := payload || '{"leadId":"lead_connected_phone","submissionHash":"67890","email":"new@example.test","capturedAt":"2026-10-06T13:00:00Z"}';
  result := public.record_connected_site_inquiry_v2(key,origin,payload);
  perform pg_temp.cir_assert((select contact_id=contact from public.tenant_leads where id=(result->>'id')::uuid),'phone matches existing contact');
  perform pg_temp.cir_assert((select email='alex@example.test' from public.business_contacts where id=contact),'existing email preserved');
  -- Flag-off RPC writes remain unchanged: no event/contact follow-up or durable spam.
  payload := payload || '{"leadId":"lead_connected_legacy","submissionHash":"abcdef","capturedAt":"2026-10-06T14:00:00Z"}';
  result := public.record_connected_site_inquiry(key,origin,payload);
  perform pg_temp.cir_assert((select contact_id is null from public.tenant_leads where id=(result->>'id')::uuid),'legacy capture unchanged');
  perform public.record_connected_site_spam(key,origin,'legacy-spam','{}',repeat('e',64),'2026-10-06T15:00:00Z');
  perform pg_temp.cir_assert(not exists(select 1 from public.tenant_leads where lead_id='lead_spam_'||md5('legacy-spam')),'legacy pit unchanged');
  payload := '{"name":"Possible customer","email":"review@example.test","phone":"716-555-0188","message":"Request","score":90}';
  result := public.record_connected_site_spam_v2(key,origin,'inq_spam',payload,repeat('f',64),'2026-10-06T16:00:00Z');
  perform pg_temp.cir_assert(result->>'status'='recorded','spam retained');
  select id into held from public.tenant_leads where connected_site_id=site_id and lead_id='lead_spam_'||md5('inq_spam');
  perform pg_temp.cir_assert(held is not null and (select intake_state='held_as_spam' and contact_id is null from public.tenant_leads where id=held),'reviewable spam does not create contact');
  perform pg_temp.cir_assert(public.record_connected_site_spam_v2(key,origin,'inq_spam',payload,repeat('f',64),'2026-10-06T16:00:00Z')->>'status'='exists','spam replay');
  perform pg_temp.cir_assert(jsonb_array_length(public.read_connected_site_inquiries_v2(ws,owner_id,'cir-owner@example.test',50))=3,'held spam absent from connected inbox');
  perform pg_temp.cir_assert(jsonb_array_length(public.read_workspace_leads(ws,owner_id,'cir-owner@example.test',array['held_as_spam'],50,null))=1,'held appears in workspace review');
  perform pg_temp.cir_error(format('select public.decide_held_workspace_lead(%L,%L,%L,%L,''release'')',ws,member_id,'cir-member@example.test',held),'inquiry_access_denied');
  perform pg_temp.cir_error(format('select public.decide_held_workspace_lead(%L,%L,%L,%L,''release'')',other_ws,other_id,'cir-other@example.test',held),'inquiry_not_found');
  perform pg_temp.cir_error(format('select public.read_workspace_inquiry_events(%L,%L,%L,%L)',ws,other_id,'cir-other@example.test',held),'inquiry_access_denied');
  result := public.decide_held_workspace_lead(ws,owner_id,'cir-owner@example.test',held,'release');
  perform pg_temp.cir_assert(result->'lead'->>'intakeState'='released' and result->'lead'->>'contactId' is not null,'release links contact');
  perform pg_temp.cir_assert(jsonb_array_length(public.read_connected_site_inquiries_v2(ws,owner_id,'cir-owner@example.test',50))=4,'released lead enters connected inbox');
  perform public.decide_held_workspace_lead(ws,owner_id,'cir-owner@example.test',held,'confirm_spam');
  perform pg_temp.cir_assert(jsonb_array_length(public.read_connected_site_inquiries_v2(ws,owner_id,'cir-owner@example.test',50))=3,'confirmed spam absent');
  perform public.decide_held_workspace_lead(ws,owner_id,'cir-owner@example.test',held,'hold');
  result := public.read_workspace_inquiry_events(ws,owner_id,'cir-owner@example.test',held);
  perform pg_temp.cir_assert(jsonb_array_length(result)=6 and result->5->>'kind'='reheld','connected review history');
  perform pg_temp.cir_assert(not exists(select 1 from public.inquiry_events where connected_site_id=site_id and tenant_stable_id is not null),'connected history has no fabricated tenant');
  perform pg_temp.cir_error(format('select public.record_connected_site_spam_v2(%L,%L,''invalid'',%L,%L,now())',key,origin,'{"email":9}',repeat('a',64)),'connected_site_invalid');
  perform pg_temp.cir_assert(not exists(select 1 from public.tenant_client_records where connected_site_id=site_id and record_id='invalid'),'invalid capture rolls back pit and lead');
end $$;
rollback;
