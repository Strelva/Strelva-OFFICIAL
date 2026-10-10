\set ON_ERROR_STOP on
-- Real PostgreSQL, fictional local identities. No signup/conversion/provider proof.
begin;
create function pg_temp.ba_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'business attribution assertion: %',label;end if;end $$;
insert into public.users(id,email,verified_at) values
 ('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test',now()),
 ('b2840000-0000-4000-8000-000000000002','attribution-agency@example.test',now()),
 ('b2840000-0000-4000-8000-000000000003','attribution-admin@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2840000-0000-4000-8000-000000000010','customer','Attribution fictional business','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','agency','Attribution fictional agency','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000021','agency','Original bringer, not current operator','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000011','customer','Other business','b2840000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','owner','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000003','admin','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000011','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002');
create temporary table ba_provider as select public.choose_business_provider('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000020') body;

create temporary table exit_original as select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','referral','{"kind":"owner_statement","reference":"original bringer before explicit exit"}','b2840000-0000-4000-8000-000000000060',(select id from public.workspace_providers where customer_workspace_id='b2840000-0000-4000-8000-000000000010' and status='active')) body;
do $$declare receipt jsonb;ending public.business_attribution_endings;begin
 receipt:=public.complete_workspace_exit('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','cancel','revoke','{"kind":"stop"}','fictional-provider-exit-revoke',repeat('a',64));
 perform pg_temp.ba_assert(not exists(select 1 from public.workspace_providers where customer_workspace_id='b2840000-0000-4000-8000-000000000010' and status='active'),'explicit owner exit ends operating provider');
 perform pg_temp.ba_assert(not exists(select 1 from public.provider_seats where customer_workspace_id='b2840000-0000-4000-8000-000000000010' and status='active'),'explicit exit ends matching seat');
 select * into ending from public.business_attribution_endings where attribution_id=(select (body->>'attributionId')::uuid from exit_original);
 perform pg_temp.ba_assert(ending.provider_change_request_id is null and ending.workspace_exit_request_id=(select id from public.workspace_exit_requests where workspace_id='b2840000-0000-4000-8000-000000000010') and ending.receipt->>'providerChangeRequestId' is null and ending.receipt->>'workspaceExitRequestId'=ending.workspace_exit_request_id::text,'real exit identity, no fabricated MO18 request');
 perform pg_temp.ba_assert(ending.receipt->'completionReceipt'=receipt and ending.receipt->'sourceReceipt'=(select body->'sourceReceipt' from exit_original),'exact exit completion and original source receipt');
 perform pg_temp.ba_assert(not exists(select 1 from public.provider_exit_completion_permissions),'private permission is gone at commit');
 perform pg_temp.ba_assert(not exists(select 1 from public.provider_change_requests),'explicit exit needs no request or notice policy');
 perform public.complete_workspace_exit('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','cancel','revoke','{"kind":"stop"}','fictional-provider-exit-revoke',repeat('a',64));
 perform pg_temp.ba_assert((select count(*)=1 from public.business_attribution_endings) and (select count(*)=1 from public.provider_completion_cleanup_receipts),'exit replay cannot repeat ending/cleanup');
 perform pg_temp.ba_assert(public.read_business_attributions('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test')->'attributions'->0->'ending'->>'workspaceExitRequestId'=ending.workspace_exit_request_id::text,'same original AOR pure reader projects exit ending');
end $$;
rollback;
