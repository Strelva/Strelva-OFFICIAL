\set ON_ERROR_STOP on
begin;
create function pg_temp.idne_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry decision provider notice: %',message; end if; end $$;
select pg_temp.idne_assert(not has_function_privilege('authenticated','public.record_inquiry_decision_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text)','execute')
  and not has_table_privilege('service_role','public.inquiry_decision_notice_events','insert'),'only bounded provider RPC');
do $$
declare owner_id uuid := 'c1750000-0000-4000-8000-000000000001'; ws uuid := 'c1750000-0000-4000-8000-000000000002';
  item uuid := 'c1750000-0000-4000-8000-000000000003'; accepted timestamptz := clock_timestamp(); result jsonb;
begin
  insert into public.users(id,email,verified_at) values(owner_id,'idne-owner@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Notice fixture',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values(ws,owner_id,owner_id);
  -- The owner's real write confirms this address and establishes audited trust
  -- on the complete schema; the predecessor schema uses the same working fact.
  perform public.patch_business_record(ws,owner_id,'idne-owner@example.test','owner',0::bigint,
    '{"facts":{"owner_recipient":{"value":{"email":"idne-owner@example.test"},"verified":true}}}'::jsonb,
    'c1750000-0000-4000-8000-000000000005'::uuid,repeat('c',64));
  insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,urgent,sign_in_required,expires_at)
    values(item,ws,'customer.commitment','owner_decides','Reply','Reply sends','Nothing sends','tenant_event','fixture:evt',repeat('a',64),true,false,now()+interval '14 days');
  perform public.claim_inquiry_decision_notice_v2(ws,item,repeat('a',64),'idne-owner@example.test','Exact subject');
  perform public.finish_inquiry_decision_notice(ws,item,'unknown',null,null,'response lost');
  perform pg_temp.idne_assert(public.record_inquiry_decision_notice_event(item,gen_random_uuid(),'provider-one','wrong-workspace','accepted',accepted,accepted,array['idne-owner@example.test'],'Exact subject')->>'status'='unmatched','wrong workspace refused');
  perform pg_temp.idne_assert(public.record_inquiry_decision_notice_event(item,ws,'provider-one','wrong-to','accepted',accepted,accepted,array['other@example.test'],'Exact subject')->>'status'='unmatched','wrong recipient refused');
  perform pg_temp.idne_assert(public.record_inquiry_decision_notice_event(item,ws,'provider-one','wrong-subject','accepted',accepted,accepted,array['idne-owner@example.test'],'Different subject')->>'status'='unmatched','wrong subject refused');
  result := public.record_inquiry_decision_notice_event(item,ws,'provider-one','sent-event','accepted',accepted,accepted,array['idne-owner@example.test'],'Exact subject');
  perform pg_temp.idne_assert(result->>'status'='recorded','signed acceptance recovers ambiguous send');
  perform pg_temp.idne_assert((select status='accepted' and provider_message_id='provider-one' from public.inquiry_decision_notice_claims where decision_id=item),'exact provider acceptance retained');
  perform pg_temp.idne_assert(public.record_inquiry_decision_notice_event(item,ws,'provider-two','wrong-provider','bounced',accepted+interval '1 second',accepted,array['idne-owner@example.test'],'Exact subject')->>'status'='unmatched','provider identity cannot change');
  result := public.record_inquiry_decision_notice_event(item,ws,'provider-one','bounce-event','bounced',accepted+interval '1 second',accepted,array['idne-owner@example.test'],'Exact subject');
  perform pg_temp.idne_assert(result->>'status'='recorded','bounce recorded');
  perform pg_temp.idne_assert((select delivery_state='bounced' from public.owner_decisions where id=item),'bounce reaches Owner not told');
  perform pg_temp.idne_assert(public.record_inquiry_decision_notice_event(item,ws,'provider-one','bounce-event','bounced',accepted+interval '1 second',accepted,array['idne-owner@example.test'],'Exact subject')->>'status'='duplicate','provider event deduplicated');
  perform public.record_inquiry_decision_notice_event(item,ws,'provider-one','late-delivery','delivered',accepted+interval '2 seconds',accepted,array['idne-owner@example.test'],'Exact subject');
  perform pg_temp.idne_assert((select status='bounced' from public.inquiry_decision_notice_claims where decision_id=item),'terminal bounce cannot be reversed');
  -- Signed evidence can beat the local acceptance checkpoint. Finishing the
  -- original sending claim must never overwrite a callback's bounce.
  item := 'c1750000-0000-4000-8000-000000000004';
  insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,urgent,sign_in_required,expires_at)
    values(item,ws,'customer.commitment','owner_decides','Reply again','Reply sends','Nothing sends','tenant_event','fixture:evt2',repeat('b',64),true,false,now()+interval '14 days');
  perform public.claim_inquiry_decision_notice_v2(ws,item,repeat('b',64),'idne-owner@example.test','Second subject');
  perform public.record_inquiry_decision_notice_event(item,ws,'provider-second','fast-bounce','bounced',accepted+interval '3 seconds',accepted,array['idne-owner@example.test'],'Second subject');
  perform public.finish_inquiry_decision_notice(ws,item,'accepted','provider-second',accepted,null);
  perform pg_temp.idne_assert((select status='bounced' from public.inquiry_decision_notice_claims where decision_id=item),'callback racing local finish remains terminal');
  perform pg_temp.idne_assert((select delivery_state='bounced' from public.owner_decisions where id=item),'callback queue evidence survives local finish');
  item := 'c1750000-0000-4000-8000-000000000003';
  perform pg_temp.idne_assert(not (public.claim_inquiry_decision_notice_v2(ws,item,repeat('a',64),'idne-owner@example.test','Exact subject')->>'acquired')::boolean,'bounce never permits another send');
end $$;
rollback;
