\set ON_ERROR_STOP on
-- Native joint payer/provider handoff on fictional identities. No rates or prices
-- are introduced. Both response policies below are local fixture-only choices;
-- every row is rolled back. Run before any fixture that commits a notice policy.
begin;
create function pg_temp.mpc_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'joint payer/provider assertion: %',label; end if; end $$;
create function pg_temp.mpc_expect(q text,expected text) returns void language plpgsql as $$
begin
 begin execute q;
 exception when others then
  if sqlstate='P0001' and sqlerrm=expected then return; end if;
  raise exception 'Expected %, got % %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Expected % but native command succeeded: %',expected,q;
end $$;
create function pg_temp.mpc_payer(command jsonb,actor uuid,email text) returns public.workspace_payer_transitions language sql as $$
 select * from public.workspace_payer_transition_command(command,actor,email)
$$;
create function pg_temp.mpc_propose(agency uuid) returns public.workspace_payer_transitions language sql as $$
 select pg_temp.mpc_payer(jsonb_build_object('action','propose','workspaceId','d2940000-0000-4000-8000-000000000010','successorAgencyWorkspaceId',agency),'d2940000-0000-4000-8000-000000000001','joint-owner@example.test')
$$;
create function pg_temp.mpc_accept(transition uuid,actor uuid,email text) returns public.workspace_payer_transitions language sql as $$
 select pg_temp.mpc_payer(jsonb_build_object('action','accept','transitionId',transition),actor,email)
$$;
create function pg_temp.mpc_request(transition uuid,key text,agency uuid default 'd2940000-0000-4000-8000-000000000021') returns jsonb language sql as $$
 select public.request_provider_change('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test',agency,key,transition)
$$;
create function pg_temp.mpc_complete(request uuid) returns jsonb language sql as $$
 select public.complete_provider_change(request,'d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')
$$;
select pg_temp.mpc_assert(not exists(select 1 from public.provider_change_policy),'no production/default notice window is assumed');
insert into public.users(id,email,verified_at) values
 ('d2940000-0000-4000-8000-000000000001','joint-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test',now()),
 ('d2940000-0000-4000-8000-000000000004','joint-new-agency-owner@example.test',now()),
 ('d2940000-0000-4000-8000-000000000005','joint-new-agency-admin@example.test',now()),
 ('d2940000-0000-4000-8000-000000000006','joint-other-agency@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('d2940000-0000-4000-8000-000000000010','customer','Joint handoff business','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000011','customer','Other joint business','d2940000-0000-4000-8000-000000000002'),
 ('d2940000-0000-4000-8000-000000000020','agency','Outgoing joint agency','d2940000-0000-4000-8000-000000000003'),
 ('d2940000-0000-4000-8000-000000000021','agency','Incoming joint agency','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000022','agency','Other joint agency','d2940000-0000-4000-8000-000000000006');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','owner','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000002','owner','d2940000-0000-4000-8000-000000000001'),
 ('d2940000-0000-4000-8000-000000000011','d2940000-0000-4000-8000-000000000002','owner','d2940000-0000-4000-8000-000000000002'),
 ('d2940000-0000-4000-8000-000000000020','d2940000-0000-4000-8000-000000000003','owner','d2940000-0000-4000-8000-000000000003'),
 ('d2940000-0000-4000-8000-000000000021','d2940000-0000-4000-8000-000000000004','owner','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000021','d2940000-0000-4000-8000-000000000005','admin','d2940000-0000-4000-8000-000000000004'),
 ('d2940000-0000-4000-8000-000000000022','d2940000-0000-4000-8000-000000000006','owner','d2940000-0000-4000-8000-000000000006');
insert into public.accounts(id,name,workspace_id,billing_type,stripe_customer_id) values
 ('d2940000-0000-4000-8000-000000000030','Joint billing home','d2940000-0000-4000-8000-000000000010','subscription','cus_JointFictionalPayer');
insert into public.tenants(id,stable_id,site_name,active,account_id,subscription_status) values
 ('joint-payer-provider','d2940000-0000-4000-8000-000000000031','Joint fictional live site',true,'d2940000-0000-4000-8000-000000000030','active');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('d2940000-0000-4000-8000-000000000031','joint-payer-provider','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','d2940000-0000-4000-8000-000000000032',repeat('a',64),'{}');
create temporary table mpc_initial_provider as select public.choose_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000020') body;
create temporary table cancellation_request as select public.request_provider_change('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000021','cancel-without-policy') body;
select pg_temp.mpc_assert((select body->>'status'='awaiting_policy' and body->>'payer_transition_id' is null from cancellation_request),'request without payer transition is stranded awaiting policy');
select pg_temp.mpc_expect($q$select public.choose_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000021')$q$,'provider_change_required');
select pg_temp.mpc_expect($q$select public.end_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','Exit blocked by pending request')$q$,'provider_change_completion_required');
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'')',(select body->>'id' from cancellation_request)),'provider_change_policy_required');
create function pg_temp.cancel_cmd(actor uuid,email text) returns jsonb language sql as $$
 select public.cancel_provider_change((select (body->>'id')::uuid from cancellation_request),actor,email)
$$;
-- Other business owners, either agency, client admins, stale owners and wrong
-- verified identities cannot turn the recovery into a switching shortcut.
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000004','joint-new-agency-owner@example.test')$q$,'provider_seat_owner_required');
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000003','joint-old-agency@example.test')$q$,'provider_seat_owner_required');
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000001','wrong@example.test')$q$,'provider_seat_owner_required');
update public.workspace_memberships set role='admin' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000002';
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')$q$,'provider_seat_owner_required');
update public.workspace_memberships set role='owner' where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000002';
update public.users set verified_at=null where id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000001','joint-owner@example.test')$q$,'provider_seat_owner_required');
update public.users set verified_at=now() where id='d2940000-0000-4000-8000-000000000001';
savepoint removed_owner;
delete from public.workspace_memberships where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000001';
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000001','joint-owner@example.test')$q$,'provider_seat_owner_required');
rollback to removed_owner;
savepoint wrong_business;
delete from public.workspace_memberships where workspace_id='d2940000-0000-4000-8000-000000000010' and user_id='d2940000-0000-4000-8000-000000000002';
select pg_temp.mpc_expect($q$select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')$q$,'provider_seat_owner_required');
rollback to wrong_business;
create function pg_temp.cancel_unchanged() returns jsonb language plpgsql as $$
declare result jsonb='{}'; table_name text; rows jsonb;
begin
 foreach table_name in array array['accounts','tenants','workspace_providers','provider_seats','agency_client_staff','client_resource_mandates','workspace_payer_transitions','workspace_memberships','agency_handoff_receipts','agency_package_handoffs'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t',table_name) into rows;
  result:=result||jsonb_build_object(table_name,rows);
 end loop;
 return result;
end $$;
create temporary table cancellation_before as select pg_temp.cancel_unchanged() body;
select pg_temp.mpc_assert(public.cancel_provider_change((select (body->>'id')::uuid from cancellation_request),'d2940000-0000-4000-8000-000000000001','joint-owner@example.test')->>'status'='cancelled','current owner recovers stranded request without selecting a policy');
create temporary table cancellation_after as select pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000001','joint-owner@example.test') body;
select pg_temp.mpc_assert(pg_temp.cancel_cmd('d2940000-0000-4000-8000-000000000002','joint-co-owner@example.test')=(select body from cancellation_after),'current co-owner replay returns immutable original receipt');
select pg_temp.mpc_assert(pg_temp.cancel_unchanged()=(select body from cancellation_before),'cancellation preserves providers, payer, subscription, seats, staff, grants, membership, site and handoff receipts byte for byte');
select pg_temp.mpc_assert((select count(*)=1 from public.provider_change_cancellations where request_id=(select (body->>'id')::uuid from cancellation_request)),'replay creates no additional cancellation receipt');
select pg_temp.mpc_expect($q$update public.provider_change_cancellations set verified_email='forged@example.test'$q$,'money_immutable');
select pg_temp.mpc_assert(not has_function_privilege('authenticated','public.cancel_provider_change(uuid,uuid,text)','EXECUTE') and not has_function_privilege('anon','public.cancel_provider_change(uuid,uuid,text)','EXECUTE') and has_function_privilege('service_role','public.cancel_provider_change(uuid,uuid,text)','EXECUTE') and not has_table_privilege('service_role','public.provider_change_cancellations','UPDATE'),'only service supplied-actor RPC can cancel; receipt is not table-writable');
select pg_temp.mpc_assert(public.read_provider_change_requests('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','joint-owner@example.test')->0->'cancellation'->>'cancelled_by'='d2940000-0000-4000-8000-000000000001','reader preserves original cancellation actor/time after reload');
-- Replaying the request key cannot resurrect the cancellation.
select pg_temp.mpc_assert(public.request_provider_change('d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000021','cancel-without-policy')->>'status'='cancelled','request replay remains cancelled');
select pg_temp.mpc_expect(format('select public.acknowledge_provider_change_notice(%L,''d2940000-0000-4000-8000-000000000003'',''joint-old-agency@example.test'')',(select body->>'id' from cancellation_request)),'provider_change_stale');
select pg_temp.mpc_expect(format('select public.complete_provider_change(%L,''d2940000-0000-4000-8000-000000000001'',''joint-owner@example.test'')',(select body->>'id' from cancellation_request)),'provider_response_window_open');
-- No policy/no pending request preserves the existing direct owner path.
savepoint direct_end;
select public.end_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','Owner ends provider after cancelling');
rollback to direct_end;
select public.choose_business_provider('d2940000-0000-4000-8000-000000000001','joint-owner@example.test','d2940000-0000-4000-8000-000000000010','d2940000-0000-4000-8000-000000000021');
\if :{?provider_cancel_retain}
commit;
\else
rollback;
\endif
