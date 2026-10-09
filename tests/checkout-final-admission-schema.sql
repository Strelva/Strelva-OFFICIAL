\set ON_ERROR_STOP on
-- PREPARED UNRUN. Controlled fictional native rows, not a provider/ordinary
-- customer or commercial qualification. Execute only in an owned throwaway DB.
begin;
create function pg_temp.ca_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'checkout native contract: %',m;end if;end$$;
create function pg_temp.ca_denied(q text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm='checkout_admission_denied' then return;end if;raise;end;raise exception 'checkout admission incorrectly succeeded';end$$;
do $$declare owner_id uuid:=gen_random_uuid();ws uuid:=gen_random_uuid();p uuid;r uuid:=gen_random_uuid();generation bigint;booking uuid:=gen_random_uuid();manager uuid:=gen_random_uuid();agency uuid:=gen_random_uuid();intent uuid;ap uuid;agency_generation bigint;begin
 insert into public.users(id,email,verified_at) values(owner_id,'checkout-native-owner@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional final Checkout contract',owner_id);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
 perform public.manage_connected_account(ws,owner_id,'checkout-native-owner@example.test','reserve');
 perform public.record_connected_account(ws,'acct_FinalCheckout',array['merchant'],'fictional-native','{}','{}',true);
 select c.generation into generation from public.connected_accounts c where c.workspace_id=ws;
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(r,ws,'quote',gen_random_uuid(),'[{"name":"Fictional quoted work","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()+interval '1 hour',repeat('1',64),owner_id,'fictional-final-quote');
 perform public.accept_public_payment_request(repeat('1',64));
 select id into p from public.business_payments where workspace_id=ws and idempotency_key='request:'||r::text;
 perform public.claim_business_payment_channel(p,'checkout');perform public.prepare_business_checkout(p);
 perform pg_temp.ca_assert(public.assert_business_checkout_admission(p,'acct_FinalCheckout',generation,null,null,null),'accepted source-bound Checkout');
 update public.connected_accounts set state='restricted' where workspace_id=ws;
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation));
 update public.connected_accounts set state='ready' where workspace_id=ws;
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation+1));
 insert into public.payment_request_actions(request_id,action) values(r,'cancelled');
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation));
 -- Already accepted remote Checkout observations remain recordable after loss.
 perform public.record_business_payment_event('acct_FinalCheckout','checkout:cs_FinalAccepted','cs_FinalAccepted',p,'checkout_created',0);
 perform pg_temp.ca_assert(public.prepare_business_checkout(p)->>'sessionId'='cs_FinalAccepted','accepted-session readback does not repeat new-effect admission');
 r:=gen_random_uuid();
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(r,ws,'quote',gen_random_uuid(),'[{"name":"Fictional expired work","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()-interval '1 second',repeat('2',64),owner_id,'fictional-final-expired');
 p:=(public.reserve_business_payment(ws,'request:'||r::text,'quote',1000,'usd',r::text)->>'id')::uuid;
 insert into public.payment_request_actions(request_id,action,payment_id) values(r,'accepted',p);
 perform public.claim_business_payment_channel(p,'checkout');perform public.prepare_business_checkout(p);
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation));
 insert into public.business_bookings(id,calendar_key,workspace_id,legacy_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,customer_email,recorded_via,created_at)
 values(booking,ws,ws,'fictional-final-deposit','held','agent','Fictional consultation',clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 30 minutes',clock_timestamp()+interval '4 days 30 minutes','UTC','Fictional customer','checkout-native-customer@example.test','native',clock_timestamp());
 r:=gen_random_uuid();
 insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,amount_cents,currency,expires_at,token_hash,issued_by,idempotency_key)
 values(r,ws,'deposit',booking,'[{"name":"Fictional deposit","quantity":1,"unitCents":1000}]',1000,'usd',clock_timestamp()+interval '1 hour',repeat('3',64),owner_id,'fictional-final-deposit');
 perform public.accept_public_payment_request(repeat('3',64));select id into p from public.business_payments where workspace_id=ws and idempotency_key='request:'||r::text;
 perform public.claim_business_payment_channel(p,'checkout');perform public.prepare_business_checkout(p);
 perform pg_temp.ca_assert(public.assert_business_checkout_admission(p,'acct_FinalCheckout',generation,null,null,null),'held accepted deposit');
 update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp() where id=booking;
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation));
 p:=(public.reserve_business_payment(ws,'fictional-store-exit','checkout',1000,'usd','fictional-cart-hash')->>'id')::uuid;
 perform public.claim_business_payment_channel(p,'checkout');perform public.prepare_business_checkout(p);
 perform pg_temp.ca_assert(public.assert_business_checkout_admission(p,'acct_FinalCheckout',generation,null,null,null),'generic connected store before exit');
 -- Actual local agency proposal -> current customer owner acceptance -> prepare.
 insert into public.users(id,email,verified_at) values(manager,'checkout-native-agency@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(agency,'agency','Fictional final agency Checkout',manager);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(agency,manager,'owner',manager);
 perform public.manage_connected_account(agency,manager,'checkout-native-agency@example.test','reserve');
 perform public.record_connected_account(agency,'acct_FinalAgencyCheckout',array['merchant'],'fictional-native','{}','{}',true);
 select c.generation into agency_generation from public.connected_accounts c where c.workspace_id=agency;
 update public.accounts set payer_kind='agency',payer_workspace_id=agency where workspace_id=ws;
 intent:=(public.agency_billing_intent_command(jsonb_build_object('action','propose','agencyWorkspaceId',agency,'businessWorkspaceId',ws,'kind','pay_link','amountCents',1000,'currency','usd','description','Fictional explicitly accepted native terms','idempotencyKey','fictional-final-retail'),manager,'checkout-native-agency@example.test')->>'id')::uuid;
 perform public.agency_billing_intent_command(jsonb_build_object('action','accept','intentId',intent,'businessWorkspaceId',ws),owner_id,'checkout-native-owner@example.test');
 perform public.agency_billing_intent_command(jsonb_build_object('action','prepare','intentId',intent),manager,'checkout-native-agency@example.test');
 ap:=(public.reserve_business_payment(agency,'agency-invoice:'||intent::text,'pay_link',1000,'usd',intent::text)->>'id')::uuid;
 perform public.claim_business_payment_channel(ap,'checkout');perform public.prepare_business_checkout(ap);
 perform pg_temp.ca_assert(public.assert_business_checkout_admission(ap,'acct_FinalAgencyCheckout',agency_generation,manager,'checkout-native-agency@example.test','checkout-native-owner@example.test'),'exact current agency actor/accepted customer owner/payer');
 insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at)
 values(ws,owner_id,'fictional-final-exit',repeat('4',64),'pause','keep','stop','{"status":"completed"}',clock_timestamp());
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,null,null,null)',p,'acct_FinalCheckout',generation));
 perform pg_temp.ca_denied(format('select public.assert_business_checkout_admission(%L,%L,%s,%L,%L,%L)',ap,'acct_FinalAgencyCheckout',agency_generation,manager,'checkout-native-agency@example.test','checkout-native-owner@example.test'));
 perform public.record_business_payment_event('acct_FinalAgencyCheckout','checkout:cs_AgencyExitAccepted','cs_AgencyExitAccepted',ap,'checkout_created',0);
 perform public.record_agency_billing_checkout(intent,'acct_FinalAgencyCheckout','cs_AgencyExitAccepted',null);
 perform pg_temp.ca_assert(public.prepare_business_checkout(ap)->>'sessionId'='cs_AgencyExitAccepted','exited customer retains already accepted agency provider effect');
 perform public.record_business_payment_event('acct_FinalCheckout','checkout:cs_ExitAccepted','cs_ExitAccepted',p,'checkout_created',0);
 perform pg_temp.ca_assert(public.prepare_business_checkout(p)->>'sessionId'='cs_ExitAccepted','exit retains accepted effect');
 perform pg_temp.ca_assert(not has_function_privilege('authenticated','public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)','EXECUTE') and not has_function_privilege('anon','public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)','EXECUTE') and has_function_privilege('service_role','public.assert_business_checkout_admission(uuid,text,bigint,uuid,text,text)','EXECUTE'),'service-only exact Checkout actor boundary');
end $$;
rollback;
