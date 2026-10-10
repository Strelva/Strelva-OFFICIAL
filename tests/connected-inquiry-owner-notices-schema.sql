\set ON_ERROR_STOP on
begin;
create function pg_temp.cno_assert(value boolean,message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'connected owner notice assertion: %',message; end if; end $$;
do $$
declare
  owner_id uuid := 'c1800000-0000-4000-8000-000000000001';
  ws uuid := 'c1800000-0000-4000-8000-000000000010';
  other_ws uuid := 'c1800000-0000-4000-8000-000000000011';
  site_id uuid; kept uuid; suppressed uuid; unknown_id uuid; result jsonb; payload jsonb;
  key text := 'sk_pub_'||repeat('n',24); origin text := 'https://owner-notice-fixture.example';
  accepted timestamptz := clock_timestamp();
begin
  insert into public.users(id,email,verified_at) values(owner_id,'cno-owner@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Connected owner notice',owner_id),(other_ws,'customer','Other notice business',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values(ws,owner_id,owner_id);
  -- This verified-owner write serves both the pre-trust working-fact contract
  -- and the complete schema's confirmed recipient audit.
  perform public.patch_business_record(ws,owner_id,'cno-owner@example.test','owner',0,
    '{"facts":{"owner_recipient":{"value":{"email":"cno-owner@example.test","name":"Owner"}}}}',gen_random_uuid(),repeat('a',64));
  site_id := (public.create_connected_site(ws,owner_id,'cno-owner@example.test',jsonb_build_object('publicKey',key,'verificationToken',repeat('n',32),
    'label','Fixture','siteUrl',origin||'/','siteHost','owner-notice-fixture.example','allowedOrigins',jsonb_build_array(origin),'platform','custom'))->>'id')::uuid;
  perform public.confirm_connected_site_verification(ws,owner_id,'cno-owner@example.test',site_id,array[repeat('n',32)]);
  payload := jsonb_build_object('leadId','lead_connected_notice','submissionHash','notice1','name','Dana','email','dana@example.test','capturedAt','2026-10-06T12:00:00Z');
  kept := (public.record_connected_site_inquiry_v2(key,origin,payload)->>'id')::uuid;
  result := public.claim_connected_inquiry_owner_notice(kept,site_id,ws,'New inquiry');
  perform pg_temp.cno_assert((result->>'acquired')::boolean and result->>'recipient'='cno-owner@example.test' and result->>'tenantId' is null,'standalone owner record recipient');
  perform pg_temp.cno_assert(not (public.claim_connected_inquiry_owner_notice(kept,site_id,ws,'New inquiry')->>'acquired')::boolean,'in-flight notice cannot resend');
  begin
    perform public.claim_connected_inquiry_owner_notice(kept,site_id,other_ws,'New inquiry');
    raise exception 'wrong business accepted';
  exception when others then if sqlerrm<>'inquiry_not_found' then raise; end if; end;
  perform public.finish_connected_inquiry_owner_notice(kept,'accepted','connected-provider-one',accepted);
  perform pg_temp.cno_assert(not exists(select 1 from jsonb_array_elements(public.list_connected_inquiry_owner_notices_not_told()) row where row->>'inquiryId'=kept::text),'provider acceptance closes owner-not-told issue');
  result := public.record_connected_inquiry_owner_notice_event(kept,ws,'connected-provider-one','wrong-to','bounced',accepted+interval '1 minute',accepted,array['wrong@example.test'],'New inquiry');
  perform pg_temp.cno_assert(result->>'status'='unmatched','wrong destination rejected');
  result := public.record_connected_inquiry_owner_notice_event(kept,other_ws,'connected-provider-one','wrong-ws','bounced',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry');
  perform pg_temp.cno_assert(result->>'status'='unmatched','wrong workspace rejected');
  result := public.record_connected_inquiry_owner_notice_event(kept,ws,'other-provider','wrong-provider','bounced',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry');
  perform pg_temp.cno_assert(result->>'status'='unmatched','provider id immutable');
  result := public.record_connected_inquiry_owner_notice_event(kept,ws,'connected-provider-one','wrong-subject','bounced',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'Other inquiry');
  perform pg_temp.cno_assert(result->>'status'='unmatched','exact subject required');
  result := public.record_connected_inquiry_owner_notice_event(kept,ws,'connected-provider-one','bounce-one','bounced',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry');
  perform pg_temp.cno_assert(result->>'status'='recorded','provider bounce recorded');
  perform pg_temp.cno_assert(public.record_connected_inquiry_owner_notice_event(kept,ws,'connected-provider-one','bounce-one','bounced',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry')->>'status'='duplicate','provider event dedupe');
  perform public.record_connected_inquiry_owner_notice_event(kept,ws,'connected-provider-one','late-delivery','delivered',accepted+interval '2 minutes',accepted,array['cno-owner@example.test'],'New inquiry');
  perform pg_temp.cno_assert((select status='bounced' from public.connected_inquiry_owner_notices where lead_row_id=kept),'terminal bounce cannot be reversed');
  perform pg_temp.cno_assert(exists(select 1 from jsonb_array_elements(public.list_connected_inquiry_owner_notices_not_told()) row where row->>'inquiryId'=kept::text and row->>'tenantId' is null and row->>'status'='bounced'),'standalone connected bounce visible to operator');
  perform pg_temp.cno_assert(exists(select 1 from public.inquiry_events where connected_site_id=site_id and lead_id='lead_connected_notice' and detail->>'status'='bounced' and tenant_stable_id is null),'source-aware delivery history');
  perform pg_temp.cno_assert(not (public.claim_connected_inquiry_owner_notice(kept,site_id,ws,'New inquiry')->>'acquired')::boolean,'bounce never permits resend');

  payload := payload || '{"leadId":"lead_connected_suppressed","submissionHash":"notice2"}';
  suppressed := (public.record_connected_site_inquiry_v2(key,origin,payload)->>'id')::uuid;
  perform public.claim_connected_inquiry_owner_notice(suppressed,site_id,ws,'New inquiry');
  perform public.finish_connected_inquiry_owner_notice(suppressed,'suppressed',null,null);
  perform pg_temp.cno_assert(exists(select 1 from jsonb_array_elements(public.list_connected_inquiry_owner_notices_not_told()) row where row->>'inquiryId'=suppressed::text and row->>'status'='suppressed'),'suppressed notice visible');
  perform pg_temp.cno_assert(public.record_connected_inquiry_owner_notice_event(suppressed,ws,'invented','suppressed-recovery','accepted',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry')->>'status'='unmatched','unsent suppressed notice cannot earn provider acceptance');

  payload := payload || '{"leadId":"lead_connected_unknown","submissionHash":"notice3"}';
  unknown_id := (public.record_connected_site_inquiry_v2(key,origin,payload)->>'id')::uuid;
  perform public.claim_connected_inquiry_owner_notice(unknown_id,site_id,ws,'New inquiry');
  perform public.finish_connected_inquiry_owner_notice(unknown_id,'unknown',null,null);
  perform pg_temp.cno_assert(public.record_connected_inquiry_owner_notice_event(unknown_id,ws,'recovered-provider','recovered','accepted',accepted+interval '1 minute',accepted,array['cno-owner@example.test'],'New inquiry')->>'status'='recorded','ambiguous acceptance repaired without transport retry');
  perform pg_temp.cno_assert(not (public.claim_connected_inquiry_owner_notice(unknown_id,site_id,ws,'New inquiry')->>'acquired')::boolean,'recovery never reopens sending');
  perform public.record_connected_inquiry_owner_notice_event(unknown_id,ws,'recovered-provider','provider-suppressed','suppressed',accepted+interval '2 minutes',accepted,array['cno-owner@example.test'],'New inquiry');
  perform pg_temp.cno_assert((select status='suppressed' and accepted_at is not null from public.connected_inquiry_owner_notices where lead_row_id=unknown_id),'provider suppression retains acceptance evidence');
end $$;
select pg_temp.cno_assert(not has_table_privilege('service_role','public.connected_inquiry_owner_notices','select')
  and not has_function_privilege('authenticated','public.claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','public.record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text)','execute')
  and not has_function_privilege('authenticated','public.list_connected_inquiry_owner_notices_not_told()','execute'),'RPC service boundary');
rollback;
