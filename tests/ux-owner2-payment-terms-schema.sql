\set ON_ERROR_STOP on
-- Fictional persisted native rows in a disposable database only. No provider
-- writes, commercial terms, release activation or real customer qualification.
begin;
create function pg_temp.pt_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'payment terms contract: %',m;end if;end$$;
create function pg_temp.pt_denied(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm=expected then return;end if;raise;end;raise exception 'payment terms incorrectly succeeded: %',q;end$$;
do $$declare
 owner_id uuid:=gen_random_uuid(); ws uuid:=gen_random_uuid(); r uuid; source_id uuid; p uuid; result jsonb; test_case record; sequence integer:=0;
begin
 insert into public.users(id,email,verified_at) values(owner_id,'payment-terms-owner@example.test',now());
 insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional payment terms business',owner_id);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',owner_id);
 perform public.ensure_native_business_billing_home(ws);
 perform public.manage_connected_account(ws,owner_id,'payment-terms-owner@example.test','reserve');
 perform public.record_connected_account(ws,'acct_PaymentTermsFixture',array['merchant'],'fictional-native','{}','{}',true);
 for test_case in select * from (values
   ('quote',null::text,'{}'::jsonb,false),
   ('quote',E' \t\r\n','{}'::jsonb,false),
   ('quote',U&'\00A0\FEFF','{}'::jsonb,false),
   ('quote',null,'{"refundable":"true"}'::jsonb,false),
   ('deposit','Quote terms do not define a deposit policy.','{}'::jsonb,false),
   ('deposit',null,'{"refundable":null}'::jsonb,false),
   ('deposit',null,'{"refundable":"false"}'::jsonb,false),
   ('quote',E'  Exact issued work and cancellation terms.\n','{}'::jsonb,true),
   ('quote',null,'{"refundable":false,"notice":"Exact issued policy"}'::jsonb,true),
   ('deposit',null,'{"refundable":true,"notice":"Exact issued policy"}'::jsonb,true),
   ('deposit',null,'{"refundable":false,"notice":"Exact issued policy"}'::jsonb,true)
 ) t(kind,terms,policy,allowed) loop
   sequence:=sequence+1; r:=gen_random_uuid(); source_id:=gen_random_uuid();
   if test_case.kind='deposit' then
     insert into public.business_bookings(id,calendar_key,workspace_id,status,origin,service_name_at_booking,start_at,end_at,block_end_at,time_zone,customer_name,recorded_via,created_at)
     values(source_id,ws,ws,'held','owner','Fictional consultation',clock_timestamp()+interval '4 days'+sequence*interval '1 hour',clock_timestamp()+interval '4 days 30 minutes'+sequence*interval '1 hour',clock_timestamp()+interval '4 days 30 minutes'+sequence*interval '1 hour','UTC','Fictional customer','native',clock_timestamp());
   end if;
   -- Explicit privileged historical fixtures exercise the atomic acceptance
   -- boundary even when issuance predates the customer-facing terms hold.
   insert into public.business_payment_requests(id,workspace_id,kind,source_record_id,lines,accepted_terms,amount_cents,currency,expires_at,token_hash,cancellation_policy,issued_by,idempotency_key)
   values(r,ws,test_case.kind,source_id,'[{"name":"Fictional issued work","quantity":1,"unitCents":1275}]',test_case.terms,1275,'cad',clock_timestamp()+interval '1 hour',lpad(sequence::text,64,'0'),test_case.policy,owner_id,'payment-terms-fixture-'||sequence::text);
   if not test_case.allowed then
     perform pg_temp.pt_denied(format('select public.accept_public_payment_request(%L)',lpad(sequence::text,64,'0')),'payment_request_terms_required');
     perform pg_temp.pt_assert(not exists(select 1 from public.business_payments where workspace_id=ws and reference_id=r::text),'missing terms leave no payment reservation');
     perform pg_temp.pt_assert(not exists(select 1 from public.payment_request_actions where request_id=r),'missing terms leave no accepted action');
   else
     result:=public.accept_public_payment_request(lpad(sequence::text,64,'0'));
     perform pg_temp.pt_assert(result->>'id'=r::text and result->>'workspaceId'=ws::text and result->>'kind'=test_case.kind and (result->>'amountCents')::bigint=1275 and result->>'currency'='cad','accepted request retains exact issued identity and money');
     perform pg_temp.pt_assert((result->>'acceptedTerms') is not distinct from test_case.terms and result->'cancellationPolicy'=test_case.policy,'accepted request retains exact immutable work and refund terms');
     select id into p from public.business_payments where workspace_id=ws and reference_id=r::text and amount_cents=1275 and currency='cad';
     perform pg_temp.pt_assert(p is not null and exists(select 1 from public.payment_request_actions where request_id=r and payment_id=p and action='accepted'),'accepted immutable request has its exact persisted reservation');
     perform public.accept_public_payment_request(lpad(sequence::text,64,'0'));
     perform pg_temp.pt_assert((select count(*)=1 from public.business_payments where workspace_id=ws and reference_id=r::text) and (select count(*)=1 from public.payment_request_actions where request_id=r and action='accepted'),'replay preserves one reservation and one accepted action');
     perform pg_temp.pt_denied(format('update public.business_payment_requests set accepted_terms=%L where id=%L','Replacement terms',r),'money_immutable');
     perform pg_temp.pt_denied(format('update public.business_payment_requests set cancellation_policy=%L::jsonb where id=%L','{"refundable":true}',r),'money_immutable');
   end if;
 end loop;
 perform pg_temp.pt_assert(not has_function_privilege('anon','public.accept_public_payment_request(text)','execute') and not has_function_privilege('authenticated','public.accept_public_payment_request(text)','execute') and has_function_privilege('service_role','public.accept_public_payment_request(text)','execute'),'payment acceptance remains service-only');
end $$;
rollback;
