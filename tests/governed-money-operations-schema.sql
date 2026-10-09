\set ON_ERROR_STOP on
-- PREPARED UNRUN. Privileged fictional setup in an owned disposable native DB.
-- This is not a signed-in Auth journey, written commercial agreement or provider approval.
begin;
create function pg_temp.gm_assert(value boolean,note text) returns void language plpgsql as $$begin if value is not true then raise exception 'governed money: %',note;end if;end$$;
create function pg_temp.gm_refused(command text,expected text) returns void language plpgsql as $$begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise;end;raise exception 'governed money expected refusal: %',expected;end$$;
insert into public.users(id,email,verified_at) values
 ('d1720000-0000-4000-8000-000000000001','gm-owner@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000003','gm-admin@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000004','gm-stranger@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000005','gm-reviewer@example.test',clock_timestamp());
insert into public.super_admins(user_id,email) values('d1720000-0000-4000-8000-000000000002','gm-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('d1720000-0000-4000-8000-000000000010','customer','Fictional governed preparation business','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000020','agency','Fictional governed preparation creator','d1720000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000001','owner','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000003','admin','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','owner','d1720000-0000-4000-8000-000000000002');
select public.ensure_native_business_billing_home('d1720000-0000-4000-8000-000000000010');
select pg_temp.gm_assert(public.read_governed_money_preparation('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000001','gm-owner@example.test')->>'collectionDispatch'='not_configured','owner sees no invented dispatch configuration');
select pg_temp.gm_assert((public.read_governed_money_preparation('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000003','gm-admin@example.test')->>'canPrepare')::boolean=false,'admin retained read does not grant owner acceptance');
create temporary table gm_price as select jsonb_build_object('action','record_price','version','fictional-gm-explicit-price','amountCents',1700,'currency','cad','definitionId',null,'effectiveFrom',clock_timestamp()-interval '1 minute','effectiveUntil',null) command;
select pg_temp.gm_refused(format('select public.record_governed_money_configuration(%L,%L,%L)','d1720000-0000-4000-8000-000000000004','gm-stranger@example.test',(select command from gm_price)),'governed_money_denied');
select public.record_governed_money_configuration('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',command) from gm_price;
select pg_temp.gm_assert((public.record_governed_money_configuration('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',command)->>'replayed')::boolean,'explicit price replay once') from gm_price;
select pg_temp.gm_refused(format('select public.record_governed_money_configuration(%L,%L,%L)','d1720000-0000-4000-8000-000000000002','gm-operator@example.test',(select command||'{"amountCents":1701}'::jsonb from gm_price)),'governed_money_conflict');
create temporary table gm_terms as select jsonb_build_object('workspaceId','d1720000-0000-4000-8000-000000000010','lineId','d1720000-0000-4000-8000-000000000100','priceVersion','fictional-gm-explicit-price','amountCents',1700,'currency','cad','installationId',null,'periodStart',clock_timestamp(),'periodEnd',clock_timestamp()+interval '1 month') command;
select pg_temp.gm_refused(format('select public.prepare_governed_collection_terms(%L,%L,%L)','d1720000-0000-4000-8000-000000000001','gm-owner@example.test',(select command from gm_terms)),'governed_money_not_configured');
update public.accounts set stripe_customer_id='cus_FictionalGovernedPayer' where workspace_id='d1720000-0000-4000-8000-000000000010';
select pg_temp.gm_refused(format('select public.prepare_governed_collection_terms(%L,%L,%L)','d1720000-0000-4000-8000-000000000003','gm-admin@example.test',(select command from gm_terms)),'collection_owner_required');
select pg_temp.gm_refused(format('select public.prepare_governed_collection_terms(%L,%L,%L)','d1720000-0000-4000-8000-000000000001','gm-owner@example.test',(select command||'{"amountCents":1701}'::jsonb from gm_terms)),'governed_money_changed');
select public.prepare_governed_collection_terms('d1720000-0000-4000-8000-000000000001','gm-owner@example.test',command) from gm_terms;
select public.prepare_governed_collection_terms('d1720000-0000-4000-8000-000000000001','gm-owner@example.test',command) from gm_terms;
select pg_temp.gm_assert((select count(*)=1 from public.platform_collection_terms where line_id='d1720000-0000-4000-8000-000000000100') and (select count(*)=1 from public.platform_collection_periods where line_id='d1720000-0000-4000-8000-000000000100'),'atomic owner acceptance/period replay once');
select pg_temp.gm_assert(not exists(select 1 from public.platform_collections where invoice_line_id='d1720000-0000-4000-8000-000000000100'),'local terms preparation creates no provider collection');
create temporary table gm_agreement as select jsonb_build_object('action','record_agreement','workspaceId','d1720000-0000-4000-8000-000000000020','kind','creator','version','fictional-gm-written-agreement','rateReference','fictional-gm-written-rate','rateBps',171,'effectiveFrom',clock_timestamp()-interval '1 minute','effectiveUntil',null) command;
select public.record_governed_money_configuration('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',command) from gm_agreement;
-- Actual source creation/qualification/review, with explicit fictional local
-- reviewer policy. This selects no production reviewer or royalty agreement.
select public.set_platform_workspace('gm-operator@example.test','strelva_agency','d1720000-0000-4000-8000-000000000020');
select public.register_offering_package_source('gm-operator@example.test','private_staff_requests','1.0.0');
insert into public.system_revision_reviewers(user_id,policy_version) values('d1720000-0000-4000-8000-000000000005','fictional-governed-native-review-only');
select public.review_system_revision_qualification('d1720000-0000-4000-8000-000000000005','gm-reviewer@example.test',source_revision_id,true,'Fictional native declaration/rehearsal source review; no commercial qualification') from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
select public.register_governed_creator_listing('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',jsonb_build_object('workspaceId','d1720000-0000-4000-8000-000000000020','sourceRevisionId',source_revision_id,'agreementVersion','fictional-gm-written-agreement','rateReference','fictional-gm-written-rate')) from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
select pg_temp.gm_assert(exists(select 1 from public.creator_listings where creator_workspace_id='d1720000-0000-4000-8000-000000000020' and definition_id='private_staff_requests'),'only canonical source-selected definition has its creator listing');
-- Synthetic historical platform source exercises local transfer authority only.
-- These fictional provider IDs prove no provider settlement or money movement.
select public.manage_connected_account('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test','reserve');
select public.record_connected_account('d1720000-0000-4000-8000-000000000020','acct_FictionalGovernedRecipient',array['recipient'],'fictional-gm-profile','{"recipient":{"capabilities":{"stripe_balance":{"stripe_transfers":{"status":"active"}}}}}','{}',true);
insert into public.revenue_splits(id,business_workspace_id,beneficiary_workspace_id,beneficiary_kind,invoice_line_id,period_start,period_end,source_account_id,source_charge_id,basis_cents,amount_cents,agreement_version,rate_reference,rate_bps,event_key,currency)
values('d1720000-0000-4000-8000-000000000200','d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000020','creator','fictional-gm-historical-source',clock_timestamp()-interval '1 month',clock_timestamp(),'platform','ch_FictionalGovernedSource',10000,171,'fictional-gm-written-agreement','fictional-gm-written-rate',171,'accrual','cad');
create temporary table gm_payout as select (public.reserve_split_payout_dry_run('d1720000-0000-4000-8000-000000000200','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource',171,'cad','fictional-gm-written-agreement',1000)->>'id')::uuid id;
select pg_temp.gm_refused(format('select public.prepare_approved_split_transfer(%L)',id),'payout_operator_authorization_required') from gm_payout;
select public.record_governed_money_configuration('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',jsonb_build_object('action','authorize_payout','payoutId',id,'profileVersion','fictional-gm-profile')) from gm_payout;
-- Current recipient profile cannot relabel an immutable recorded approval.
select public.record_connected_account('d1720000-0000-4000-8000-000000000020','acct_FictionalGovernedRecipient',array['recipient'],'fictional-gm-later-profile','{"recipient":{"capabilities":{"stripe_balance":{"stripe_transfers":{"status":"active"}}}}}','{}',true);
select pg_temp.gm_assert(public.read_governed_money_configuration('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test')#>>'{payouts,0,authorizationProfileVersion}'='fictional-gm-profile' and public.read_governed_money_configuration('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test')#>>'{payouts,0,recipientProfileVersion}'='fictional-gm-later-profile','old recorded approval remains distinct from current recipient profile');
select pg_temp.gm_refused(format('select public.assert_governed_payout_dispatch(%L,%L,%L,%L,%L,%L,171,%L,1000)',id,'d1720000-0000-4000-8000-000000000002','gm-operator@example.test','fictional-gm-later-profile','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource','cad'),'governed_money_denied') from gm_payout;
select public.record_connected_account('d1720000-0000-4000-8000-000000000020','acct_FictionalGovernedRecipient',array['recipient'],'fictional-gm-profile','{"recipient":{"capabilities":{"stripe_balance":{"stripe_transfers":{"status":"active"}}}}}','{}',true);
select public.prepare_approved_split_transfer(id) from gm_payout;
select public.assert_governed_payout_dispatch(id,'d1720000-0000-4000-8000-000000000002','gm-operator@example.test','fictional-gm-profile','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource',171,'cad',1000) from gm_payout;
select pg_temp.gm_refused(format('select public.assert_governed_payout_dispatch(%L,%L,%L,%L,%L,%L,171,%L,1000)',id,'d1720000-0000-4000-8000-000000000004','gm-stranger@example.test','fictional-gm-profile','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource','cad'),'governed_money_denied') from gm_payout;
update public.super_admins set revoked_at=clock_timestamp() where user_id='d1720000-0000-4000-8000-000000000002';
select pg_temp.gm_refused(format('select public.assert_governed_payout_dispatch(%L,%L,%L,%L,%L,%L,171,%L,1000)',id,'d1720000-0000-4000-8000-000000000002','gm-operator@example.test','fictional-gm-profile','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource','cad'),'governed_money_denied') from gm_payout;
-- Post-acceptance observation remains the historical port, even after revoke.
select public.record_split_transfer(id,'tr_FictionalGovernedAccepted',171,'cad') from gm_payout;
select pg_temp.gm_assert(public.assert_governed_payout_dispatch(id,'d1720000-0000-4000-8000-000000000002','gm-operator@example.test','fictional-gm-profile','acct_FictionalGovernedRecipient','ch_FictionalGovernedSource',171,'cad',1000)->>'transfer_id'='tr_FictionalGovernedAccepted','accepted receipt recovered without fresh operator grant') from gm_payout;
update public.super_admins set revoked_at=null where user_id='d1720000-0000-4000-8000-000000000002';
-- Completed creator exit refuses a future listing command while preserving
-- already accepted listing/transfer bytes. Controlled two-session wait proof
-- additionally uses tests/support/governed-creator-exit-race-*.sql.
create temporary table gm_creator_retained as select
 (select jsonb_agg(to_jsonb(l) order by l.id) from public.creator_listings l where creator_workspace_id='d1720000-0000-4000-8000-000000000020') listings,
 (select jsonb_agg(to_jsonb(r) order by r.payout_id) from public.split_transfer_receipts r where payout_id in(select id from gm_payout)) receipts;
select public.complete_workspace_exit('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test','cancel','revoke','{"kind":"stop"}','fictional-governed-creator-exit',repeat('a',64));
select pg_temp.gm_assert(public.workspace_exit_completed('d1720000-0000-4000-8000-000000000020'),'actual creator exit completed');
select pg_temp.gm_refused(format('select public.register_governed_creator_listing(%L,%L,%L)','d1720000-0000-4000-8000-000000000002','gm-operator@example.test',jsonb_build_object('workspaceId','d1720000-0000-4000-8000-000000000020','sourceRevisionId',source_revision_id,'agreementVersion','fictional-gm-written-agreement','rateReference','fictional-gm-written-rate')),'workspace_exit_future_work_blocked') from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
select pg_temp.gm_assert(listings is not distinct from (select jsonb_agg(to_jsonb(l) order by l.id) from public.creator_listings l where creator_workspace_id='d1720000-0000-4000-8000-000000000020') and receipts is not distinct from (select jsonb_agg(to_jsonb(r) order by r.payout_id) from public.split_transfer_receipts r where payout_id in(select id from gm_payout)),'creator exit refusal preserves prior listing and accepted effect bytes') from gm_creator_retained;
-- Both ports are STABLE; the independent full readonly-RPC qualification
-- must additionally execute these inside a genuine READ ONLY transaction.
set local role service_role;
select public.read_governed_money_preparation('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000001','gm-owner@example.test');
select public.read_governed_money_configuration('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','gm-operator@example.test');
reset role;
-- Existing transaction is rolled back after both reads. No privileged fixtures survive.
rollback;
