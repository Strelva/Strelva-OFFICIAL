\set ON_ERROR_STOP on
-- Agency Payment links, numbered documents and their boundaries. Fictional rows only.
begin;
create function pg_temp.mp_assert(v boolean,m text) returns void language plpgsql as $$begin if v is not true then raise exception 'money pay links: %',m;end if;end$$;
create function pg_temp.mp_raises(q text,expected text) returns void language plpgsql as $$begin begin execute q;exception when others then if sqlerrm=expected then return;end if;raise exception 'money pay links: expected %, got %',expected,sqlerrm;end;raise exception 'money pay links: % did not raise',expected;end$$;
create function pg_temp.cmd(agency uuid,uid uuid,email text,body jsonb) returns text language sql as $$
 select format('select public.agency_pay_link_command(%L::jsonb,%L,%L)',(body||jsonb_build_object('agencyWorkspaceId',agency))::text,uid,email) $$;
do $$declare
 a constant uuid:='b0000000-0000-4000-8000-000000000020'; b constant uuid:='b0000000-0000-4000-8000-000000000030'; c constant uuid:='b0000000-0000-4000-8000-000000000040';
 ua constant uuid:='b0000000-0000-4000-8000-000000000001'; ub constant uuid:='b0000000-0000-4000-8000-000000000002'; us constant uuid:='b0000000-0000-4000-8000-000000000003';
 k1 uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); k3 uuid:=gen_random_uuid(); k4 uuid:=gen_random_uuid();
 r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; begin_r jsonb; pay uuid; doc jsonb; doc2 jsonb; fn text;
begin
 -- Callers outside the agency are refused; agency B has no merchant.
 perform pg_temp.mp_raises(pg_temp.cmd(a,us,'mpl-stranger@example.test',jsonb_build_object('action','create','idempotencyKey',k1,'fingerprint','f1','slug','x-one','clientName','X','description','Work','amountCents',10000)),'connect_denied');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ub,'mpl-b-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k1,'fingerprint','f1','slug','x-one','clientName','X','description','Work','amountCents',10000)),'connect_denied');
 perform pg_temp.mp_raises(pg_temp.cmd(b,ub,'mpl-b-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k1,'fingerprint','f1','slug','b-one','clientName','B','description','Work','amountCents',10000)),'agency_pay_link_merchant_unavailable');
 -- Create, replay and conflicting replay.
 r1:=public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId',a,'action','create','idempotencyKey',k1,'fingerprint','f1','slug','site-one','clientName','Harbor Dental','description','Website setup','amountCents',50000,'businessWorkspaceId',c),ua,'mpl-a-owner@example.test');
 perform pg_temp.mp_assert(r1->>'status'='open' and (r1->>'invoiceNumber')::int=1 and r1->>'rail'='connected_account','first link open with invoice 1');
 r2:=public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId',a,'action','create','idempotencyKey',k1,'fingerprint','f1','slug','site-one','clientName','Harbor Dental','description','Website setup','amountCents',50000),ua,'mpl-a-owner@example.test');
 perform pg_temp.mp_assert(r2->>'id'=r1->>'id','replay returns the same link');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ua,'mpl-a-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k1,'fingerprint','other','slug','site-one','clientName','Harbor Dental','description','Website setup','amountCents',50000)),'agency_pay_link_conflict');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ua,'mpl-a-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k2,'fingerprint','f2','slug','site-one','clientName','Other','description','Work','amountCents',10000)),'agency_pay_link_slug_taken');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ua,'mpl-a-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k2,'fingerprint','f2','slug','bad-amount','clientName','Other','description','Work','amountCents',50)),'agency_pay_link_amount_invalid');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ua,'mpl-a-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k2,'fingerprint','f2','slug','bad-range','clientName','Other','description','Work','minCents',5000,'maxCents',12000)),'agency_pay_link_amount_invalid');
 perform pg_temp.mp_raises(pg_temp.cmd(a,ua,'mpl-a-owner@example.test',jsonb_build_object('action','create','idempotencyKey',k2,'fingerprint','f2','slug','not-mine','clientName','Other','description','Work','amountCents',10000,'businessWorkspaceId',gen_random_uuid())),'agency_pay_link_denied');
 -- Second link (range) gets invoice 2; agency B numbers start again at 1 once it has a merchant.
 r3:=public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId',a,'action','create','idempotencyKey',k3,'fingerprint','f3','slug','range-one','clientName','Harbor Dental','description','Monthly care','minCents',5000,'maxCents',20000),ua,'mpl-a-owner@example.test');
 perform pg_temp.mp_assert((r3->>'invoiceNumber')::int=2,'second invoice is 2');
 perform public.manage_connected_account(b,ub,'mpl-b-owner@example.test','reserve');
 perform public.record_connected_account(b,'acct_MplAgencyB',array['merchant'],'fictional-v1','{}','{}',true);
 r4:=public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId',b,'action','create','idempotencyKey',k4,'fingerprint','f4','slug','b-site','clientName','Other Client','description','Work','amountCents',10000),ub,'mpl-b-owner@example.test');
 perform pg_temp.mp_assert((r4->>'invoiceNumber')::int=1,'agency B numbers independently');
 perform pg_temp.mp_assert(jsonb_array_length(public.read_agency_pay_links(a,ua,'mpl-a-owner@example.test'))=2,'agency A lists its two links');
 perform pg_temp.mp_raises(format('select public.read_agency_pay_links(%L,%L,%L)',a,ub,'mpl-b-owner@example.test'),'connect_denied');
 -- Checkout admission.
 perform pg_temp.mp_raises('select public.begin_agency_pay_link_checkout(''site-one'',49900)','agency_pay_link_amount_invalid');
 perform pg_temp.mp_raises('select public.begin_agency_pay_link_checkout(''range-one'',7000)','agency_pay_link_amount_invalid');
 begin_r:=public.begin_agency_pay_link_checkout('range-one',10000);
 perform pg_temp.mp_assert(begin_r->>'idempotencyKey'='agency-pay-link:'||(r3->>'id')||':g0:10000','generation key');
 begin_r:=public.begin_agency_pay_link_checkout('site-one',50000);
 pay:=(public.reserve_business_payment(a,begin_r->>'idempotencyKey','checkout',50000,'usd',begin_r->>'referenceId')->>'id')::uuid;
 perform pg_temp.mp_assert(public.assert_agency_pay_link_checkout_open((r1->>'id')::uuid,pay),'open link admits its own payment');
 perform pg_temp.mp_raises(format('select public.assert_agency_pay_link_checkout_open(%L,%L)',r3->>'id',pay),'agency_pay_link_closed');
 perform pg_temp.mp_assert(public.advance_agency_pay_link_checkout((r1->>'id')::uuid,0)=1,'generation advances');
 perform pg_temp.mp_assert(public.advance_agency_pay_link_checkout((r1->>'id')::uuid,0)=1,'stale advance changes nothing');
 perform pg_temp.mp_raises(format('select public.issue_agency_pay_link_receipt(%L)',r1->>'id'),'agency_pay_link_unpaid');
 -- Paid: status, idempotent numbered receipt, immutability.
 insert into public.business_payment_events(payment_id,merchant_account_id,provider_event_id,provider_object_id,kind,amount_cents) values(pay,'acct_MplAgencyA','evt_paid_1','pi_mpl_1','paid',50000);
 perform pg_temp.mp_assert(public.read_public_agency_pay_link('site-one')->>'status'='paid','paid status');
 perform pg_temp.mp_raises('select public.begin_agency_pay_link_checkout(''site-one'',50000)','agency_pay_link_paid');
 doc:=public.issue_agency_pay_link_receipt((r1->>'id')::uuid); doc2:=public.issue_agency_pay_link_receipt((r1->>'id')::uuid);
 perform pg_temp.mp_assert((doc->>'number')::int=1 and doc->>'id'=doc2->>'id','receipt is issued once as number 1');
 perform pg_temp.mp_assert((public.read_public_agency_pay_link('site-one')->>'receiptNumber')::int=1,'projection carries the receipt number');
 perform pg_temp.mp_assert(public.read_money_document('invoice',(r1->>'id')::uuid)->>'kind'='invoice','invoice readable');
 perform pg_temp.mp_raises('update public.money_documents set snapshot=''{}''','money_document_immutable');
 perform pg_temp.mp_raises('delete from public.money_documents','money_document_immutable');
 -- Revoke closes checkout, and a revoke replays.
 perform public.agency_pay_link_command(jsonb_build_object('agencyWorkspaceId',a,'action','revoke','idempotencyKey',gen_random_uuid(),'fingerprint','rv','slug','range-one'),ua,'mpl-a-owner@example.test');
 perform pg_temp.mp_raises('select public.begin_agency_pay_link_checkout(''range-one'',10000)','agency_pay_link_expired');
 perform pg_temp.mp_assert(public.read_public_agency_pay_link('range-one')->>'status'='expired','revoked status');
 perform pg_temp.mp_raises(pg_temp.cmd(b,ub,'mpl-b-owner@example.test',jsonb_build_object('action','revoke','idempotencyKey',gen_random_uuid(),'fingerprint','rv2','slug','site-one')),'agency_pay_link_denied');
 -- Backfill.
 perform pg_temp.mp_assert(public.backfill_legacy_agency_pay_link('{"slug":"old-one","clientName":"Old","door":"build","amountCents":9000}'::jsonb,'hash1',a)='inserted','backfill inserts');
 perform pg_temp.mp_assert(public.backfill_legacy_agency_pay_link('{"slug":"old-one","clientName":"Old","door":"build","amountCents":9000}'::jsonb,'hash1',a)='unchanged','backfill is idempotent');
 perform pg_temp.mp_assert(public.backfill_legacy_agency_pay_link('{"slug":"old-one","clientName":"Changed","door":"build","amountCents":9000}'::jsonb,'hash2',a)='conflict','backfill reports conflicts');
 perform pg_temp.mp_raises(format('select public.backfill_legacy_agency_pay_link(%L::jsonb,%L,%L)','{"slug":"old-two","clientName":"Old","door":"build","amountCents":9000}','hash3',c),'agency_pay_link_backfill_owner');
 -- Only service_role may execute.
 for fn in select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in('agency_pay_link_command','read_agency_pay_links','read_public_agency_pay_link','list_agency_pay_links_for_support','begin_agency_pay_link_checkout','assert_agency_pay_link_checkout_open','advance_agency_pay_link_checkout','read_agency_pay_link_open_checkouts','issue_agency_pay_link_receipt','read_money_document','backfill_legacy_agency_pay_link') loop
  perform pg_temp.mp_assert(not has_function_privilege('anon',fn,'execute') and not has_function_privilege('authenticated',fn,'execute') and has_function_privilege('service_role',fn,'execute'),'ACL '||fn);
 end loop;
 perform pg_temp.mp_assert(not has_table_privilege('service_role','public.money_documents','select'),'tables are closed to service_role');
end $$;
rollback;
