\set ON_ERROR_STOP on
begin;
create function pg_temp.or_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'inquiry operator assertion: %',p_message; end if; end $$;
do $$
declare
  op uuid := 'ca500000-0000-4000-8000-000000000001'; owner_id uuid := 'ca500000-0000-4000-8000-000000000002';
  ws uuid := 'ca500000-0000-4000-8000-000000000010'; rev bigint := 1; site_id uuid; held uuid; kept uuid; repair uuid; result jsonb; first_page jsonb; cursor_page jsonb;
  key text := 'sk_pub_'||repeat('r',24); origin text := 'https://operator-fixture.example'; at_time timestamptz := clock_timestamp();
begin
  insert into public.users(id,email,verified_at) values(op,'review-op@example.test',now()),(owner_id,'review-owner@example.test',now());
  insert into public.super_admins(user_id,email) values(op,'review-op@example.test');
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Review business',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values(ws,owner_id,owner_id);
  -- Establish the notice recipient through the verified owner's confirmed write.
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',0,
    '{"facts":{"owner_recipient":{"value":{"email":"review-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('a',64));
  insert into public.tenants(id,site_name) values('operator-unlinked-fixture','Unlinked client');
  held := (public.hold_tenant_lead_as_spam('operator-unlinked-fixture','{"id":"spam_operator","reason":"spam signal","name":"Dana","message":"Please review","createdAt":"2026-10-06T12:00:00Z"}')->>'id')::uuid;
  result := public.read_operator_held_inquiries(op,'review-op@example.test','held_as_spam',50,null,null);
  perform pg_temp.or_assert(exists(select 1 from jsonb_array_elements(result) r where r->>'id'=held::text and r->>'workspaceId' is null),'operator reads unconverted tenant spam without membership');
  perform pg_temp.or_assert(jsonb_array_length(public.read_operator_held_inquiries(op,'review-op@example.test','held_as_spam',1,null,null))<=1,'bounded read');
  update public.tenant_leads set captured_at='2100-10-06T12:00:00.123456Z' where id=held;
  perform public.hold_tenant_lead_as_spam('operator-unlinked-fixture','{"id":"spam_operator_cursor","reason":"spam signal","name":"Dana","message":"Older review","createdAt":"2100-10-06T12:00:00.123455Z"}');
  first_page := public.read_operator_held_inquiries(op,'review-op@example.test','held_as_spam',1,null,null);
  cursor_page := public.read_operator_held_inquiries(op,'review-op@example.test','held_as_spam',1,(first_page->0->>'capturedAt')::timestamptz,(first_page->0->>'id')::uuid);
  perform pg_temp.or_assert(first_page->0->>'id'=held::text and cursor_page->0->>'leadId'='lead_spam_operator_cursor','microsecond cursor preserves adjacent review records');
  begin perform public.read_operator_held_inquiries(owner_id,'review-owner@example.test','held_as_spam',50,null,null); raise exception 'owner read accepted';
  exception when others then if sqlerrm<>'inquiry_access_denied' then raise; end if; end;
  begin perform public.read_operator_held_inquiries(op,'wrong@example.test','held_as_spam',50,null,null); raise exception 'wrong email read accepted';
  exception when others then if sqlerrm<>'inquiry_access_denied' then raise; end if; end;
  perform pg_temp.or_assert(public.decide_operator_held_inquiry(op,'review-op@example.test',held,'release')->>'state'='released','operator releases unconverted spam');
  perform pg_temp.or_assert(public.decide_operator_held_inquiry(op,'review-op@example.test',held,'hold')->>'state'='held_as_spam','operator reholds');
  perform pg_temp.or_assert(public.decide_operator_held_inquiry(op,'review-op@example.test',held,'confirm_spam')->>'state'='confirmed_spam','operator confirms spam');
  perform pg_temp.or_assert(exists(select 1 from public.inquiry_events where lead_id='lead_spam_operator' and actor='operator' and actor_id=op::text),'operator decision receipt');

  site_id := (public.create_connected_site(ws,owner_id,'review-owner@example.test',jsonb_build_object('publicKey',key,'verificationToken',repeat('r',32),
    'label','Review fixture','siteUrl',origin||'/','siteHost','operator-fixture.example','allowedOrigins',jsonb_build_array(origin),'platform','custom'))->>'id')::uuid;
  perform public.confirm_connected_site_verification(ws,owner_id,'review-owner@example.test',site_id,array[repeat('r',32)]);
  perform public.record_connected_site_spam_v2(key,origin,'spam_connected_operator','{"reason":"spam signal","name":"Lee","email":"lee@example.test","message":"Please review"}',repeat('a',64),clock_timestamp());
  select id into held from public.tenant_leads where connected_site_id=site_id and intake_state='held_as_spam';
  perform pg_temp.or_assert(public.decide_operator_held_inquiry(op,'review-op@example.test',held,'release')->>'state'='released','operator with no membership releases connected inquiry');
  perform pg_temp.or_assert((select contact_id is not null from public.tenant_leads where id=held),'explicit connected release attaches existing contact path');
  kept := (public.record_connected_site_inquiry_v2(key,origin,'{"leadId":"lead_operator_notice","submissionHash":"opnotice","name":"Dana","email":"dana@example.test","message":"Private party?","capturedAt":"2026-10-06T12:00:00Z"}')->>'id')::uuid;
  perform public.claim_connected_inquiry_owner_notice(kept,site_id,ws,'New inquiry');
  perform public.finish_connected_inquiry_owner_notice(kept,'accepted','original-owner-provider',at_time);
  perform public.record_connected_inquiry_owner_notice_event(kept,ws,'original-owner-provider','original-bounce','bounced',at_time+interval '1 second',at_time,array['review-owner@example.test'],'New inquiry');
  perform pg_temp.or_assert(not (public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept)->>'acquired')::boolean,'unchanged owner refused');
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"corrected-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('b',64));
  rev := rev + 1;
  result := public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept); repair := (result->>'repairId')::uuid;
  perform pg_temp.or_assert((result->>'acquired')::boolean and result->>'recipient'='corrected-owner@example.test','exact corrected recipient gets one purpose');
  perform pg_temp.or_assert(public.verify_connected_inquiry_owner_notice_repair(repair),'recipient rechecked before send');
  perform pg_temp.or_assert(not (public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept)->>'acquired')::boolean,'concurrent repair cannot acquire same purpose');
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"changed-before-send@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('b',64));
  rev := rev + 1;
  perform pg_temp.or_assert(not public.verify_connected_inquiry_owner_notice_repair(repair),'changed current owner blocks the exact pending recipient');
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"corrected-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('b',64));
  rev := rev + 1;
  perform public.finish_connected_inquiry_owner_notice_repair(repair,'suppressed',null,null);
  result := public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept);
  perform pg_temp.or_assert((result->>'acquired')::boolean and (result->>'repairId')::uuid=repair,'explicit known-unsent retry retains the same corrected purpose');
  perform public.finish_connected_inquiry_owner_notice_repair(repair,'accepted','corrected-owner-provider',clock_timestamp());
  perform pg_temp.or_assert((select count(*)=2 from public.inquiry_events where detail->>'repairId'=repair::text and detail->>'status' in ('suppressed','accepted')),'known-unsent suppression and subsequent acceptance both retain receipts');
  perform pg_temp.or_assert((select status='bounced' and provider_message_id='original-owner-provider' and accepted_at=at_time from public.connected_inquiry_owner_notices where lead_row_id=kept),'original receipt unchanged');
  perform pg_temp.or_assert(not exists(select 1 from jsonb_array_elements(public.list_connected_inquiry_owner_notices_not_told()) r where r->>'inquiryId'=kept::text),'accepted repair closes queue issue');
  perform pg_temp.or_assert(not exists(select 1 from jsonb_array_elements(public.read_operator_inquiry_notice_issues(op,'review-op@example.test',50,null,null)) r where r->>'inquiryId'=kept::text),'accepted repair closes screen issue');
  perform pg_temp.or_assert(public.record_connected_inquiry_owner_notice_repair_event(repair,kept,ws,'other-provider','wrong-provider','bounced',clock_timestamp(),null,array['corrected-owner@example.test'],'New inquiry')->>'status'='unmatched','repair provider immutable');
  perform pg_temp.or_assert(public.record_connected_inquiry_owner_notice_repair_event(repair,kept,ws,'corrected-owner-provider','wrong-recipient','bounced',clock_timestamp(),null,array['review-owner@example.test'],'New inquiry')->>'status'='unmatched','repair exact recipient required');
  result := public.record_connected_inquiry_owner_notice_repair_event(repair,kept,ws,'corrected-owner-provider','repair-bounce','bounced',clock_timestamp(),null,array['corrected-owner@example.test'],'New inquiry');
  perform pg_temp.or_assert(result->>'status'='recorded','repair bounce recorded');
  perform pg_temp.or_assert(public.record_connected_inquiry_owner_notice_repair_event(repair,kept,ws,'corrected-owner-provider','repair-bounce','bounced',clock_timestamp(),null,array['corrected-owner@example.test'],'New inquiry')->>'status'='duplicate','repair webhook dedupe');
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"third-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('b',64));
  rev := rev + 1;
  result := public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept); repair := (result->>'repairId')::uuid;
  perform public.finish_connected_inquiry_owner_notice_repair(repair,'unknown',null,null);
  perform public.patch_business_record(ws,owner_id,'review-owner@example.test','owner',rev,
    '{"facts":{"owner_recipient":{"value":{"email":"fourth-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('b',64));
  rev := rev + 1;
  perform pg_temp.or_assert(not (public.claim_connected_inquiry_owner_notice_repair(op,'review-op@example.test',kept)->>'acquired')::boolean,'unknown acceptance cannot send again');
  update public.super_admins set revoked_at=clock_timestamp() where user_id=op;
  begin perform public.decide_operator_held_inquiry(op,'review-op@example.test',held,'release'); raise exception 'revoked operator accepted';
  exception when others then if sqlerrm<>'inquiry_access_denied' then raise; end if; end;
end $$;
select pg_temp.or_assert(not has_table_privilege('service_role','public.connected_inquiry_owner_notice_repairs','select')
  and not has_function_privilege('authenticated','public.read_operator_held_inquiries(uuid,text,text,integer,timestamptz,uuid)','execute')
  and not has_function_privilege('authenticated','public.claim_connected_inquiry_owner_notice_repair(uuid,text,uuid)','execute'),'RPC-only operator boundary');
rollback;
