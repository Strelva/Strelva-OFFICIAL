\set ON_ERROR_STOP on
begin;
create function pg_temp.ma_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'money admission fixture: %',m;end if;end$$;
create function pg_temp.ma_denied(q text,e text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm=e then return;end if;raise;end;raise exception 'expected refusal %',e;end$$;
do $$declare owner_id uuid:=gen_random_uuid();manager_id uuid:=gen_random_uuid();ws uuid:=gen_random_uuid();agency uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();intent_id uuid:=gen_random_uuid();p uuid;generation bigint;booking_id uuid:=gen_random_uuid();begin
 insert into public.users(id,email,verified_at) values(owner_id,'admission-owner@example.test',now()),(manager_id,'admission-manager@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Native admission business',owner_id),(agency,'agency','Native admission agency',manager_id);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id),(agency,manager_id,'admin',manager_id);
 perform public.manage_connected_account(ws,owner_id,'admission-owner@example.test','reserve');
 perform public.record_connected_account(ws,'acct_AdmissionBusiness',array['merchant'],'fixture','{}','{}',true);
 select c.generation into generation from public.connected_accounts c where workspace_id=ws;
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(request_id,ws,'quote',gen_random_uuid(),'[{"name":"Quoted work","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()+interval '1 hour',repeat('c',64),owner_id,'native-admission-request');
 p:=(public.reserve_business_payment(ws,'native-admission-payment','quote',1000,'usd',request_id::text)->>'id')::uuid;
 perform public.claim_business_payment_channel(p,'agent');
 insert into public.agent_payment_reservations(payment_id,workspace_id,amount_cents,currency) values(p,ws,1000,'usd');
 perform pg_temp.ma_assert(public.assert_agent_payment_admission(p,'acct_AdmissionBusiness',generation),'initial exact request admitted');
 perform public.manage_connected_account(ws,owner_id,'admission-owner@example.test','disconnect');
 perform pg_temp.ma_denied(format('select public.assert_agent_payment_admission(%L,%L,%s)',p,'acct_AdmissionBusiness',generation),'agent_payment_admission_denied');
 update public.connected_accounts set state='ready' where workspace_id=ws;
 perform pg_temp.ma_denied(format('select public.assert_agent_payment_admission(%L,%L,%s)',p,'acct_AdmissionBusiness',generation),'agent_payment_admission_denied');
 select c.generation into generation from public.connected_accounts c where workspace_id=ws;
 perform pg_temp.ma_assert(public.assert_agent_payment_admission(p,'acct_AdmissionBusiness',generation),'new generation only admits its exact request');
 insert into public.payment_request_actions(request_id,action) values(request_id,'cancelled');
 perform pg_temp.ma_denied(format('select public.assert_agent_payment_admission(%L,%L,%s)',p,'acct_AdmissionBusiness',generation),'agent_payment_admission_denied');
 -- Provider binding recovery remains available for an already-sent effect.
 perform public.prepare_agent_payment_attempt(p,'acct_AdmissionBusiness');
 perform pg_temp.ma_assert(public.recover_agent_payment_provider(p,'acct_AdmissionBusiness','pi_AlreadySent',1000,'usd'),'cancelled request still retains actual provider observation');
 request_id:=gen_random_uuid();
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(request_id,ws,'quote',gen_random_uuid(),'[{"name":"Quoted work","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()-interval '1 second',repeat('e',64),owner_id,'native-expired-request');
 p:=(public.reserve_business_payment(ws,'native-expired-payment','quote',1000,'usd',request_id::text)->>'id')::uuid;
 perform public.claim_business_payment_channel(p,'agent');
 insert into public.agent_payment_reservations(payment_id,workspace_id,amount_cents,currency) values(p,ws,1000,'usd');
 perform pg_temp.ma_denied(format('select public.assert_agent_payment_admission(%L,%L,%s)',p,'acct_AdmissionBusiness',generation),'agent_payment_admission_denied');
 insert into public.business_bookings(id,calendar_key,workspace_id,legacy_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via)
 values(booking_id,ws,ws,'native-deposit-fixture','held','agent','Consultation',clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 30 minutes',clock_timestamp()+interval '4 days 30 minutes','UTC','Fixture customer','customer@example.test','native');
 request_id:=gen_random_uuid();
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(request_id,ws,'deposit',booking_id,'[{"name":"Booking deposit","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()+interval '1 hour',repeat('f',64),owner_id,'native-deposit-request');
 p:=(public.reserve_business_payment(ws,'native-deposit-payment','deposit',1000,'usd',request_id::text)->>'id')::uuid;
 perform public.claim_business_payment_channel(p,'agent');
 insert into public.agent_payment_reservations(payment_id,workspace_id,amount_cents,currency) values(p,ws,1000,'usd');
 perform pg_temp.ma_assert(public.assert_agent_payment_admission(p,'acct_AdmissionBusiness',generation),'held deposit is initially admitted');
 update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp() where id=booking_id;
 perform pg_temp.ma_denied(format('select public.assert_agent_payment_admission(%L,%L,%s)',p,'acct_AdmissionBusiness',generation),'agent_payment_admission_denied');
 perform public.manage_connected_account(agency,manager_id,'admission-manager@example.test','reserve');
 perform public.record_connected_account(agency,'acct_AdmissionAgency',array['merchant'],'fixture','{}','{}',true);
 select c.generation into generation from public.connected_accounts c where workspace_id=agency;
 update public.accounts set payer_kind='agency',payer_workspace_id=agency where workspace_id=ws;
 insert into public.agency_billing_intents(id,agency_workspace_id,business_workspace_id,kind,amount_cents,currency,description,idempotency_key,terms_digest,payer_kind,payer_workspace_id,proposed_by,accepted_by,accepted_at,status)
 values(intent_id,agency,ws,'rebill',1000,'usd','Accepted fixture terms','native-admission-retail',repeat('d',32),'business',ws,manager_id,owner_id,clock_timestamp(),'accepted');
 perform public.assert_agency_billing_mutation(intent_id,manager_id,'admission-manager@example.test','admission-owner@example.test','acct_AdmissionAgency',generation);
 update public.users set verified_at=null where id=owner_id;
 perform pg_temp.ma_denied(format('select public.assert_agency_billing_mutation(%L,%L,%L,%L,%L,%s)',intent_id,manager_id,'admission-manager@example.test','admission-owner@example.test','acct_AdmissionAgency',generation),'agency_invoice_denied');
 update public.users set verified_at=now() where id=owner_id;
 update public.accounts set payer_kind='business',payer_workspace_id=ws where workspace_id=ws;
 perform pg_temp.ma_denied(format('select public.assert_agency_billing_mutation(%L,%L,%L,%L,%L,%s)',intent_id,manager_id,'admission-manager@example.test','admission-owner@example.test','acct_AdmissionAgency',generation),'agency_invoice_conflict');
 update public.accounts set payer_kind='agency',payer_workspace_id=agency where workspace_id=ws;
 delete from public.workspace_memberships where workspace_id=agency and user_id=manager_id;
 perform pg_temp.ma_denied(format('select public.record_agency_billing_terms_authorized(%L,%L,%L,%L,%L,%s,%L,%L)',intent_id,manager_id,'admission-manager@example.test','admission-owner@example.test','acct_AdmissionAgency',generation,'cus_Client','price_Retail'),'agency_invoice_denied');
 perform pg_temp.ma_assert((select provider_customer_id is null and provider_price_id is null from public.agency_billing_intents where id=intent_id),'denied binding appends no local terms');
 perform pg_temp.ma_assert(not has_function_privilege('authenticated','public.assert_agent_payment_admission(uuid,text,bigint)','execute') and not has_function_privilege('anon','public.assert_agency_billing_mutation(uuid,uuid,text,text,text,bigint)','execute'),'new admissions service-role only');
end $$;
rollback;
