\set ON_ERROR_STOP on
begin;
-- Fictional disposable policy/price/provider receipts below prove machinery only.
-- They select no Strelva commercial values and survive neither rollback nor this database.
create function pg_temp.mcq_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Money creator/quote seam: %',label;end if;end;$$;
create function pg_temp.mcq_denied(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'expected denial %',expected;end;$$;
insert into public.users(id,email,verified_at) values
 ('cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',now()),
 ('cd161600-0000-4000-8000-000000000002','mcq-reviewer@example.test',now()),
 ('cd161600-0000-4000-8000-000000000003','mcq-operator@example.test',now()),
 ('cd161600-0000-4000-8000-000000000004','mcq-stranger@example.test',now());
insert into public.super_admins(user_id,email) values('cd161600-0000-4000-8000-000000000003','mcq-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('cd161600-0000-4000-8000-000000000010','customer','Fictional combined business','cd161600-0000-4000-8000-000000000001'),
 ('cd161600-0000-4000-8000-000000000020','agency','Fictional combined creator agency','cd161600-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','owner','cd161600-0000-4000-8000-000000000001'),
 ('cd161600-0000-4000-8000-000000000020','cd161600-0000-4000-8000-000000000003','owner','cd161600-0000-4000-8000-000000000003');
select public.set_platform_workspace('mcq-operator@example.test','strelva_agency','cd161600-0000-4000-8000-000000000020');
select public.register_offering_package_source('mcq-operator@example.test','private_staff_requests','1.0.0');
insert into public.system_revision_reviewers(user_id,policy_version) values('cd161600-0000-4000-8000-000000000002','fictional-seam-review-not-commercial-policy');
select public.review_system_revision_qualification('cd161600-0000-4000-8000-000000000002','mcq-reviewer@example.test',source_revision_id,true,'Disposable exact revision native command rehearsal reviewed') from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
create temporary table mcq_installed(id uuid primary key,revision_id uuid,lineage_id uuid,creator_id uuid);
do $$declare i public.offering_installations; app uuid;begin
 select * into i from public.prepare_staff_request_offering('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','fictional-seam-native-install',repeat('c',64),'{}','{"kind":"customer_operated","providerName":"Fictional owner team"}',array['submit_requests','review_requests'],array['staff_app','business_workspace']);
 app:=(i.native_resources->0->>'id')::uuid;
 perform public.rehearse_application_candidate(app,i.business_workspace_id,'cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',0);
 perform public.publish_application_candidate(app,i.business_workspace_id,'cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',0,0);
 i:=public.activate_offering(i.business_workspace_id,i.id,'cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',1);
 perform pg_temp.mcq_assert(i.status='active' and i.source_revision_id is not null and i.version_lineage_id is not null and i.creator_workspace_id='cd161600-0000-4000-8000-000000000020','actual qualified native install activated without copying app records');
 perform pg_temp.mcq_assert(i.responsibility='{"kind":"customer_operated","providerName":"Fictional owner team"}'::jsonb and i.accepted_scope=array['submit_requests','review_requests'] and i.surface_ids=array['staff_app','business_workspace'],'native owner command freezes accepted responsibilities and exact scopes');
 insert into mcq_installed values(i.id,i.source_revision_id,i.version_lineage_id,i.creator_workspace_id);
end $$;
select public.register_creator_listing('private_staff_requests',revision_id,creator_id,'cd161600-0000-4000-8000-000000000003','mcq-operator@example.test','fictional-seam-royalty','fictional-seam-rate-reference') from mcq_installed;
insert into public.money_agreements(beneficiary_workspace_id,kind,version,rate_reference,rate_bps,effective_from,approved_by,approved_at) values('cd161600-0000-4000-8000-000000000020','creator','fictional-seam-royalty','fictional-seam-rate-reference',201,'2020-01-01','cd161600-0000-4000-8000-000000000003',now());
-- Persisted fake provider billing mirrors bind customer, actual subscription item and linked business.
insert into public.accounts(id,name,workspace_id,billing_type,stripe_customer_id) values('cd161600-0000-4000-8000-000000000030','Fictional payer home','cd161600-0000-4000-8000-000000000010','subscription','cus_SeamPayer');
insert into public.tenants(id,stable_id,site_name,active,account_id,subscription_status) values('mcq-seam-site','cd161600-0000-4000-8000-000000000031','Fictional seam site',true,'cd161600-0000-4000-8000-000000000030','active');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values('cd161600-0000-4000-8000-000000000031','mcq-seam-site','cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'{}');
insert into public.subscriptions(id,account_id,stripe_subscription_id,stripe_customer_id,status,amount_cents,currency) values('cd161600-0000-4000-8000-000000000032','cd161600-0000-4000-8000-000000000030','sub_SeamPayer','cus_SeamPayer','active',10000,'cad');
insert into public.subscription_items(subscription_id,tenant_id,stripe_price_id,stripe_item_id,amount_cents) values('cd161600-0000-4000-8000-000000000032','mcq-seam-site','price_FictionalSeam','si_SeamItem',10000);
select pg_temp.mcq_assert(public.verify_invoice_split_source('cd161600-0000-4000-8000-000000000010','platform','cus_SeamPayer','sub_SeamPayer'),'genuine persisted payer/customer source');
select pg_temp.mcq_assert(public.resolve_invoice_business_line('cd161600-0000-4000-8000-000000000010','sub_SeamPayer','si_SeamItem',10000,'cad')='cd161600-0000-4000-8000-000000000010','actual approved item maps installed business');
select public.record_invoice_split_source('platform','il_SeamRoyalty','ch_SeamRoyalty','cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000010','cus_SeamPayer','sub_SeamPayer','si_SeamItem',10000,'cad',now()+interval '1 minute',now()+interval '1 month');
select public.accrue_invoice_splits('cd161600-0000-4000-8000-000000000010','il_SeamRoyalty',now()+interval '1 minute',now()+interval '1 month','platform','ch_SeamRoyalty',10000,'cad',id) from mcq_installed;
select public.accrue_invoice_splits('cd161600-0000-4000-8000-000000000010','il_SeamRoyalty',now()+interval '1 minute',now()+interval '1 month','platform','ch_SeamRoyalty',10000,'cad',id) from mcq_installed;
select pg_temp.mcq_assert((select count(*)=1 and bool_and(s.amount_cents=201 and s.source_revision_id=i.revision_id and s.beneficiary_workspace_id=i.creator_id and s.installation_id=i.id and o.version_lineage_id=i.lineage_id) from public.revenue_splits s join mcq_installed i on i.id=s.installation_id join public.offering_installations o on o.id=i.id where s.beneficiary_kind='creator'),'qualified frozen creator and exact original Version drive one royalty row');
select public.manage_connected_account('cd161600-0000-4000-8000-000000000020','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test','reserve');
select public.record_connected_account('cd161600-0000-4000-8000-000000000020','acct_SeamCreator',array['recipient'],'fictional-seam-connect-profile','{"recipient":{"capabilities":{"stripe_balance":{"stripe_transfers":{"status":"active"}}}}}','{}',true);
create temporary table mcq_payout as select public.reserve_split_payout_dry_run(id,'acct_SeamCreator','ch_SeamRoyalty',201,'cad','fictional-seam-royalty',9900) body from public.revenue_splits where invoice_line_id='il_SeamRoyalty' and beneficiary_kind='creator';
insert into public.split_payout_authorizations(payout_id,approved_by,approved_at,profile_version) select (body->>'id')::uuid,'cd161600-0000-4000-8000-000000000003',now(),'fictional-seam-connect-profile' from mcq_payout;
select public.prepare_approved_split_transfer((body->>'id')::uuid) from mcq_payout;
select public.record_split_transfer((body->>'id')::uuid,'tr_SeamCreator',201,'cad') from mcq_payout;
select public.reconcile_split_loss('platform','ch_SeamRoyalty','seam-refund-half',5000,10000);
create temporary table mcq_reversal as select public.prepare_split_transfer_reversal((body->>'id')::uuid,'seam-refund-half') body from mcq_payout;
select pg_temp.mcq_assert((select (body->>'amount_cents')::bigint=100 from mcq_reversal),'negative royalty row maps bounded exact original transfer reversal');
select public.record_split_transfer_reversal((body->>'id')::uuid,'trr_SeamCreator',100) from mcq_reversal;
select public.reconcile_split_loss('platform','ch_SeamRoyalty','seam-dispute-recovered',2500,10000);
create temporary table mcq_recovery as select public.authorize_split_recovery((select (body->>'id')::uuid from mcq_payout),id,'cd161600-0000-4000-8000-000000000003','mcq-operator@example.test',50,'fictional-seam-connect-profile','fictional-recovery-key') body from public.revenue_splits where event_key='seam-dispute-recovered' and beneficiary_kind='creator';
select public.prepare_split_recovery((body->>'id')::uuid) from mcq_recovery;
select public.assert_recovery_settlement((body->>'id')::uuid,9900,'cad') from mcq_recovery;
select public.record_split_recovery((body->>'id')::uuid,'tr_SeamRecovery',50,'cad') from mcq_recovery;
select pg_temp.mcq_assert(public.split_reserved_net((select split_id from public.split_payouts where id=(select (body->>'id')::uuid from mcq_payout)))=151,'royalty recovery respects current entitlement and confirmed reversal');
select pg_temp.mcq_assert(exists(select 1 from jsonb_array_elements(public.export_workspace_v3_category('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','revenue_splits',0,1000)->'items') e where e->>'source_revision_id'=(select revision_id::text from mcq_installed) and e->>'payer_customer_id'='cus_SeamPayer' and e->>'payer_subscription_id'='sub_SeamPayer'),'money export retains qualified source and exact frozen payer');
select pg_temp.mcq_assert(jsonb_array_length(public.export_workspace_v3_category('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','recovery_payouts',0,1000)->'items')=1,'recovery transfer exported once');
select pg_temp.mcq_assert((select o.source_revision_id=i.revision_id and o.version_lineage_id=i.lineage_id and o.creator_workspace_id=i.creator_id from public.offering_installations o join mcq_installed i on o.id=i.id),'all accounting left original creator source and Version identity unchanged');
-- Actual MCP capture and owner price command; never seed an approved quote receipt.
insert into public.business_pages(workspace_id,handle,published,published_at,updated_by) values('cd161600-0000-4000-8000-000000000010','mcq-fictional-business',true,now(),'cd161600-0000-4000-8000-000000000001');
select public.patch_business_record('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','owner',0,'{"services":[{"op":"upsert","name":"Fictional quoted work","verified":true}],"facts":{"response_time":{"value":{"maximumHours":17},"verified":true}}}',gen_random_uuid(),repeat('d',64));
create temporary table mcq_quote as select public.receive_agent_inquiry('workspace:cd161600-0000-4000-8000-000000000010',jsonb_build_object('origin','agent','type','quote','requestId','fictional-mcp-quote-seam','agent',jsonb_build_object('name','Fictional assistant'),'customer',jsonb_build_object('name','Fictional customer','email','mcq-customer@example.test'),'message','Please quote this work','serviceId',(select id from public.business_services where workspace_id='cd161600-0000-4000-8000-000000000010' and name='Fictional quoted work'),'fields',jsonb_build_object('scope','Fictional defined scope','area','Buffalo')),repeat('e',64),repeat('f',64),'encrypted-fictional-status',null) body;
select pg_temp.mcq_assert((select (body->>'replyBy')::timestamptz>now()+interval '16 hours' from mcq_quote),'actual owner confirmed response policy pins agent quote deadline');
select pg_temp.mcq_assert((select origin='agent' and inquiry_type='quote' and agent_workspace_id=workspace_id from public.tenant_leads where id=(select (body->>'inquiryId')::uuid from mcq_quote)),'MCP native canonical inquiry source and business attribution');
select pg_temp.mcq_denied(format('select public.record_agent_quote(%L,%L,%L,%L,%L,4321,''CAD'',''Fictional terms'')','cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000004','mcq-stranger@example.test',(select body->>'inquiryId' from mcq_quote),gen_random_uuid()),'inquiry_access_denied');
create temporary table mcq_quote_price as select public.record_agent_quote('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',(body->>'inquiryId')::uuid,'cd161600-0000-4000-8000-000000000040',4321,'CAD','Fictional exact scope. No recurring charge. Owner approved complete terms.') body from mcq_quote;
select pg_temp.mcq_assert(public.read_agent_inquiry_status('workspace:cd161600-0000-4000-8000-000000000010',repeat('f',64))#>>'{quote,amountCents}'='4321','agent sees only actual owner price receipt');
select pg_temp.mcq_denied(format('select public.issue_business_payment_request(%L,%L,%L,''quote'',%L,''[{"name":"Quoted work","quantity":1,"unitCents":4322}]'',4322,''cad'',now()+interval ''2 days'',%L,null,%L)','cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',(select body->>'inquiryId' from mcq_quote),repeat('1',64),'fake-price-override'),'payment_quote_receipt_mismatch');
create temporary table mcq_payment_request as select public.issue_payment_from_agent_quote('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',(body->>'receiptId')::uuid,now()+interval '2 days',repeat('2',64),'fictional-mcp-payment-key') body from mcq_quote_price;
select pg_temp.mcq_assert((select q.source_record_id=(r.body->>'inquiryId')::uuid and q.agent_quote_receipt_id=(p.body->>'receiptId')::uuid and q.amount_cents=4321 and q.currency='cad' and q.accepted_terms=p.body->>'terms' from public.business_payment_requests q cross join mcq_quote r cross join mcq_quote_price p where q.id=(select (body->>'id')::uuid from mcq_payment_request)),'same actual owner quote receipt freezes original lead, exact price/currency/full terms');
select pg_temp.mcq_assert(jsonb_array_length(public.read_payment_follow_ups('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test'))=1,'native unpaid quote is a follow-up before payment');
select public.manage_connected_account('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','reserve');
select public.record_connected_account('cd161600-0000-4000-8000-000000000010','acct_SeamMerchant',array['merchant'],'fictional-seam-connect-profile','{}','{}',true);
select pg_temp.mcq_assert(public.accept_public_payment_request(repeat('2',64))->>'acceptedTerms'=(select body->>'terms' from mcq_quote_price),'customer accept retains exact owner terms and reserves only frozen amount');
create temporary table mcq_customer_payment as select id from public.business_payments where workspace_id='cd161600-0000-4000-8000-000000000010' and reference_id=(select body->>'id' from mcq_payment_request);
select public.claim_business_payment_channel(id,'checkout') from mcq_customer_payment;
select public.prepare_business_checkout(id) from mcq_customer_payment;
select public.record_business_payment_event('acct_SeamMerchant','checkout:cs_SeamQuote','cs_SeamQuote',id,'checkout_created',0) from mcq_customer_payment;
select public.bind_business_payment_provider(id,'acct_SeamMerchant','pi_SeamQuote','cad','cs_SeamQuote') from mcq_customer_payment;
select pg_temp.mcq_denied(format('select public.record_business_payment_event(''acct_SeamMerchant'',''paid:pi_SeamQuote'',''pi_SeamQuote'',%L,''paid'',4321,''jpy'')',(select id from mcq_customer_payment)),'payment_currency_or_provider_mismatch');
select public.record_business_payment_event('acct_SeamMerchant','paid:pi_SeamQuote','pi_SeamQuote',id,'paid',4321,'cad') from mcq_customer_payment;
select pg_temp.mcq_assert(public.read_public_payment_request(repeat('2',64))->>'status'='paid' and jsonb_array_length(public.read_payment_follow_ups('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test'))=0,'exact paid ledger closes unpaid source, not owner follow-up acknowledgement');
select pg_temp.mcq_assert(public.business_payment_outcome_month('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test',current_date)#>>'{payments,quotesPaid}'='1','real inquiry to quote to accepted paid outcome');
-- Reconciliation must prove financial receipts, not harmless checkout observations.
select public.record_money_reconciliation_issue('acct_SeamMerchant','evt_SeamCheckoutReview','checkout.session.completed','fixture_checkout_review','cs_SeamQuote');
select pg_temp.mcq_denied(format('select public.resolve_money_reconciliation(%L,%L,''acct_SeamMerchant'',''evt_SeamCheckoutReview'',''fixture_checkout_review'',''effect_confirmed'',''Fictional checkout observation cannot prove financial effect.'',''business_payment'',%L)','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test',(select id from public.business_payment_events where provider_object_id='cs_SeamQuote')),'money_reconciliation_effect_unproven');
select public.record_money_reconciliation_issue('platform','evt_SeamForeignAccount','payment_intent.succeeded','fixture_foreign_account','pi_SeamQuote');
select pg_temp.mcq_denied(format('select public.resolve_money_reconciliation(%L,%L,''platform'',''evt_SeamForeignAccount'',''fixture_foreign_account'',''effect_confirmed'',''Foreign account receipt cannot prove this financial source.'',''business_payment'',%L)','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test',(select id from public.business_payment_events where kind='paid' and provider_object_id='pi_SeamQuote')),'money_reconciliation_effect_unproven');
select public.record_money_reconciliation_issue('acct_SeamMerchant','evt_SeamForeignObject','payment_intent.succeeded','fixture_foreign_object','pi_SeamOther');
select pg_temp.mcq_denied(format('select public.resolve_money_reconciliation(%L,%L,''acct_SeamMerchant'',''evt_SeamForeignObject'',''fixture_foreign_object'',''effect_confirmed'',''Foreign provider object receipt cannot prove this payment.'',''business_payment'',%L)','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test',(select id from public.business_payment_events where kind='paid' and provider_object_id='pi_SeamQuote')),'money_reconciliation_effect_unproven');
select pg_temp.mcq_assert(exists(select 1 from jsonb_array_elements(public.export_workspace_v3_category('cd161600-0000-4000-8000-000000000010','cd161600-0000-4000-8000-000000000001','mcq-owner@example.test','payment_requests',0,1000)->'items') e where e->>'agent_quote_receipt_id'=(select body->>'receiptId' from mcq_quote_price) and e->>'accepted_terms'=(select body->>'terms' from mcq_quote_price) and not(e ? 'token_hash')),'canonical quote terms exported without public capability');
select pg_temp.mcq_assert(not exists(select 1 from public.money_reconciliation_resolutions),'denied review evidence changes no financial or review state');
rollback;
