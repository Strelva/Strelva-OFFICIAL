\set ON_ERROR_STOP on
begin;
create function pg_temp.pb_assert(v boolean,msg text) returns void language plpgsql as $$begin if v is not true then raise exception 'payer billing: %',msg;end if;end$$;
create function pg_temp.pb_denied(stmt text,msg text) returns void language plpgsql as $$begin begin execute stmt;exception when others then if sqlerrm like msg then return;end if;raise;end;raise exception 'expected denial: %',stmt;end$$;
insert into public.users(id,email,verified_at) values
 ('7e000000-0000-4000-8000-000000000001','business@pb.test',now()),
 ('7e000000-0000-4000-8000-000000000002','agency@pb.test',now()),
 ('7e000000-0000-4000-8000-000000000003','admin@pb.test',now()),
 ('7e000000-0000-4000-8000-000000000004','member@pb.test',now()),
 ('7e000000-0000-4000-8000-000000000005','operator@pb.test',now());
insert into public.super_admins(user_id,email) values('7e000000-0000-4000-8000-000000000005','operator@pb.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('7e000000-0000-4000-8000-000000000010','customer','Party Client','7e000000-0000-4000-8000-000000000001'),
 ('7e000000-0000-4000-8000-000000000020','agency','Party Agency','7e000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000001','owner','7e000000-0000-4000-8000-000000000001'),
 ('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000002','owner','7e000000-0000-4000-8000-000000000002'),
 ('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000003','admin','7e000000-0000-4000-8000-000000000002'),
 ('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000004','member','7e000000-0000-4000-8000-000000000002');
insert into public.accounts(name,workspace_id,billing_type,monthly_cents) values('Party Client','7e000000-0000-4000-8000-000000000010','subscription',19900);
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('7e000000-0000-4000-8000-000000000030','7e000000-0000-4000-8000-000000000010','tracker','tracker','Party Work','{}','7e000000-0000-4000-8000-000000000001');
do $$
declare t public.workspace_payer_transitions%rowtype;a uuid;j uuid;r jsonb;e jsonb;i jsonb;
begin
 select * into t from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','7e000000-0000-4000-8000-000000000010','successorAgencyWorkspaceId','7e000000-0000-4000-8000-000000000020'),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 perform pg_temp.pb_assert((select can_respond from public.workspace_payer_transition_snapshot(t.workspace_id,'7e000000-0000-4000-8000-000000000003','admin@pb.test') where id=t.id),'current agency admin receives response control');
 perform public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',t.id),'7e000000-0000-4000-8000-000000000003','admin@pb.test');
 r:=public.read_agency_billing('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000002','agency@pb.test');
 perform pg_temp.pb_assert(jsonb_array_length(r->'clients')=1 and r->'clients'->0->'monthlyCents'='null'::jsonb,'one unpriced wholesale client; never copies legacy retail');
 a:=public.work_allowance_operator_command('7e000000-0000-4000-8000-000000000005','operator@pb.test',jsonb_build_object('action','award_period','workspaceId',t.workspace_id,'payerId','7e000000-0000-4000-8000-000000000003','payerKind','agency','payerWorkspaceId','7e000000-0000-4000-8000-000000000020','periodStart',now()-interval '1 day','periodEnd',now()+interval '1 month','spendingCapCents',1000,'grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',10)),'idempotencyKey','pb-agency-allowance'));
 perform pg_temp.pb_denied(format('select public.work_allowance_accept_cap(%L,%L,%L)','7e000000-0000-4000-8000-000000000004','member@pb.test',a),'work_allowance_payer_required');
 perform public.work_allowance_accept_cap('7e000000-0000-4000-8000-000000000002','agency@pb.test',a);
 perform pg_temp.pb_assert((select cap_accepted_by='7e000000-0000-4000-8000-000000000002' from public.work_allowances where id=a),'agency owner signs allowance awarded to another signer');
 r:=public.read_work_allowances('7e000000-0000-4000-8000-000000000002','agency@pb.test',a,null);
 perform pg_temp.pb_assert(r->'allowances'->0->>'payerKind'='agency' and r->'allowances'->0->>'canAccept'='true','agency read is party scoped');
 select id into j from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','workspaceId',t.workspace_id,'workId','7e000000-0000-4000-8000-000000000030','productId','tracker','resourceKind','tracker','payerId','7e000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 perform public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',j),'7e000000-0000-4000-8000-000000000003','admin@pb.test');
 perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,'executionKey','party-run','maximumCents',0,'kind','tool','attribution','normal'),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 r:=public.work_allowance_execution_command('7e000000-0000-4000-8000-000000000001','business@pb.test',jsonb_build_object('action','reserve','jobId',j,'executionKey','party-run','unitKind','completed_tracker_change','units',1));
 perform pg_temp.pb_assert(r->>'allowanceId'=a::text,'reservation matches the agency party across different signers');
 perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','party-run'),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','party-run','effect','accepted','amountCents',0),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 r:=public.work_allowance_execution_command('7e000000-0000-4000-8000-000000000001','business@pb.test',jsonb_build_object('action','settle','jobId',j,'executionKey','party-run'));
 perform pg_temp.pb_assert(r->>'disposition'='consumed','trusted completion settles agency allowance');
 update public.workspace_memberships set role='member' where workspace_id='7e000000-0000-4000-8000-000000000020' and user_id='7e000000-0000-4000-8000-000000000003';
 perform pg_temp.pb_denied(format('select public.work_allowance_accept_cap(%L,%L,%L)','7e000000-0000-4000-8000-000000000003','admin@pb.test',a),'work_allowance_payer_required');
 e:=jsonb_build_object('version',1,'eventId','evt_party_1','eventCreated',100,'subscriptionId','sub_party_1','customerId','cus_party_1','workspaceId',t.workspace_id,'payerId','7e000000-0000-4000-8000-000000000003','payerKind','agency','payerWorkspaceId','7e000000-0000-4000-8000-000000000020','configKey','party-config','status','active','periodStart',now()+interval '2 months','periodEnd',now()+interval '3 months','grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',10)),'spendingCapCents',1000);
 r:=public.sync_subscription_allowance_entitlement(e);
 perform pg_temp.pb_assert(r->>'disposition'='applied','agency renewal uses current party authority after historical signer demotion');
 perform pg_temp.pb_assert(public.sync_subscription_allowance_entitlement(e)->>'disposition'='replayed','entitlement replay once');
 perform pg_temp.pb_denied(format('select public.sync_subscription_allowance_entitlement(%L::jsonb)',e||jsonb_build_object('payerWorkspaceId','7e000000-0000-4000-8000-000000000010')),'subscription_allowance_payer_required');
 i:=public.agency_billing_intent_command(jsonb_build_object('action','propose','agencyWorkspaceId','7e000000-0000-4000-8000-000000000020','businessWorkspaceId',t.workspace_id,'kind','pay_link','amountCents',50000,'currency','usd','description','Accepted client build','idempotencyKey','party-invoice-1'),'7e000000-0000-4000-8000-000000000002','agency@pb.test');
 perform pg_temp.pb_assert(i->>'status'='proposed','agency invoice starts without charge or acceptance');
 perform pg_temp.pb_denied(format('select public.agency_billing_intent_command(%L::jsonb,%L,%L)',jsonb_build_object('action','accept','intentId',i->>'id'),'7e000000-0000-4000-8000-000000000002','agency@pb.test'),'agency_invoice_denied');
 perform pg_temp.pb_denied(format('select public.record_agency_billing_checkout(%L,%L,%L,%L)',i->>'id','acct_pb','cs_pb','https://checkout.stripe.com/c/pay/pb'),'agency_invoice_conflict');
 perform pg_temp.pb_denied(format('select public.agency_billing_intent_command(%L::jsonb,%L,%L)',jsonb_build_object('action','accept','intentId',i->>'id','businessWorkspaceId','7e000000-0000-4000-8000-000000000020'),'7e000000-0000-4000-8000-000000000001','business@pb.test'),'agency_invoice_denied');
 i:=public.agency_billing_intent_command(jsonb_build_object('action','accept','intentId',i->>'id'),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 perform pg_temp.pb_assert(i->>'status'='accepted' and i->>'accepted_by'='7e000000-0000-4000-8000-000000000001','only business owner accepts exact retail terms');
 perform public.agency_billing_intent_command(jsonb_build_object('action','prepare','intentId',i->>'id'),'7e000000-0000-4000-8000-000000000002','agency@pb.test');
 perform pg_temp.pb_assert((select provider_attempt_started_at is not null from public.agency_billing_intents where id=(i->>'id')::uuid),'provider attempt has durable start for idempotency-expiry stop');
 r:=public.record_agency_billing_provider_event('acct_pb','evt_paid_pb','cs_pb',200,'paid');
 perform pg_temp.pb_assert(r->>'pending'='true','early signed provider receipt survives before local checkout projection');
 i:=public.record_agency_billing_checkout((i->>'id')::uuid,'acct_pb','cs_pb','https://checkout.stripe.com/c/pay/pb');
 perform pg_temp.pb_assert(i->>'status'='paid','known early receipt reconciles when provider identity lands');
 perform pg_temp.pb_assert(public.record_agency_billing_provider_event('acct_pb','evt_paid_pb','cs_pb',200,'paid')->>'replayed'='true','signed provider receipt replays without changing amount');
 perform pg_temp.pb_denied($q$select public.record_agency_billing_provider_event('acct_pb','evt_paid_pb','cs_pb',200,'cancelled')$q$,'agency_invoice_conflict');
 perform pg_temp.pb_assert((select amount_cents=50000 from public.agency_billing_intents where id=(i->>'id')::uuid),'paid receipt retains exact accepted retail amount');
 select * into t from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId',t.workspace_id,'successorKind','business'),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 perform pg_temp.pb_assert((select can_respond from public.workspace_payer_transition_inbox('7e000000-0000-4000-8000-000000000001','business@pb.test') where id=t.id),'business owner inbox supplies acceptance control');
 perform public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',t.id),'7e000000-0000-4000-8000-000000000001','business@pb.test');
 r:=public.read_agency_billing('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000002','agency@pb.test');
 perform pg_temp.pb_assert(r->'clients'->0->>'lineState'='ended','payer switch ends old wholesale line without deleting historical budgets');
 update public.accounts set payment_status='past_due' where workspace_id=t.workspace_id;
 r:=public.read_agency_billing('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000002','agency@pb.test');
 perform pg_temp.pb_assert(r->'clients'->0->>'paymentStatus'<>'past_due','former payer sees retained line snapshot, not future business payment status');
 perform pg_temp.pb_assert((select monthly_cents=19900 from public.accounts where workspace_id=t.workspace_id),'legacy retail amount untouched');
end $$;
select pg_temp.pb_denied($q$select public.read_agency_billing('7e000000-0000-4000-8000-000000000020','7e000000-0000-4000-8000-000000000004','member@pb.test')$q$,'agency_billing_denied');
select pg_temp.pb_assert(not has_function_privilege('authenticated','public.read_agency_billing(uuid,uuid,text)','execute'),'browser cannot bypass billing API');
rollback;
