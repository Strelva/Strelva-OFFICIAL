\set ON_ERROR_STOP on
\if :{?keep_fixture}
\else
\set keep_fixture false
\endif
-- Prepared native qualification, never evidence until actually executed on
-- the composed disposable schema after 20261022090100. Always rolls back.
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
 raise exception 'Expected % for %',expected,statement;
end $$;
select pg_temp.assert_true(not has_table_privilege('service_role','public.tenant_deprovision_cleanup','select'), 'receipt table closed');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.finish_tenant_deprovision_cleanup(text,uuid,boolean,boolean,jsonb)','execute'), 'no public cleanup write');
select pg_temp.assert_true(not has_function_privilege('service_role','public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean)','execute'), 'no service bypass of atomic receipt');
insert into public.tenants(id,site_name) values('cleanup-native','Cleanup fictional'),('cleanup-other','Other fictional');
insert into public.domain_claims(tenant_id,domain,role,status) values
 ('cleanup-native','cleanup-native.example.test','production','verified'),
 ('cleanup-other','cleanup-other.example.test','production','verified');
create temp table cleanup_native_result as select public.deprovision_tenant_guarded('cleanup-native',false,false,false) as body;
select pg_temp.assert_true(not exists(select 1 from public.tenants where id='cleanup-native'),'database removal committed in transaction');
select pg_temp.assert_true((select (body->'cleanup'->>'databaseDeleted')::boolean and not(body->'cleanup'->>'complete')::boolean from cleanup_native_result),'native pending receipt distinguishes database removal');
select pg_temp.assert_true(exists(select 1 from public.domain_claims where tenant_id='cleanup-other'),'other tenant untouched');
select pg_temp.expect_error($q$insert into public.tenants(id,site_name) values('cleanup-native','Unsafe reuse')$q$,'tenant_slug_retired');
select public.finish_tenant_deprovision_cleanup('cleanup-native',(body->'cleanup'->>'id')::uuid,true,false,'{"provider":"refused"}'::jsonb) from cleanup_native_result;
select pg_temp.expect_error($q$insert into public.tenants(id,site_name) values('cleanup-native','Provider still pending')$q$,'tenant_slug_retired');
select pg_temp.expect_error($q$select public.finish_tenant_deprovision_cleanup('cleanup-native','27410000-0000-4000-8000-000000000099',true,true,'{}')$q$,'tenant_cleanup_receipt_changed');
select public.finish_tenant_deprovision_cleanup('cleanup-native',(body->'cleanup'->>'id')::uuid,false,true,'{"provider":"confirmed-absent"}'::jsonb) from cleanup_native_result;
select pg_temp.assert_true((public.tenant_cleanup_receipt('cleanup-native')->>'complete')::boolean,'monotonic native progress completes only both stores');
select pg_temp.expect_error($q$insert into public.tenants(id,site_name) values('cleanup-native','Completed cleanup does not reallocate identity')$q$,'tenant_slug_retired');
select pg_temp.expect_error(format('select public.finish_tenant_deprovision_cleanup(%L,%L,true,true,%L)',
 'cleanup-other',(select body->'cleanup'->>'id' from cleanup_native_result),'{}'),'tenant_cleanup_identity_conflict');
-- A guarded refusal must leave no pending receipt and no cross-store authority.
insert into public.tenants(id,site_name,subscription_status) values('cleanup-paid','Paid fictional','active');
select pg_temp.expect_error($q$select public.deprovision_tenant_guarded('cleanup-paid',false,false,false)$q$,'tenant_teardown_active_subscription');
select pg_temp.assert_true(public.tenant_cleanup_receipt('cleanup-paid') is null,'guard failure leaves no cleanup receipt');
-- Fictional publication row exercises a protected booking-only hold. It is
-- not provider acceptance or real booking-publication qualification.
insert into public.users(id,email,verified_at) values('27419000-0000-4000-8000-000000000001','cleanup-native-owner@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values('27419000-0000-4000-8000-000000000010','customer','Cleanup booking-only fixture','27419000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('27419000-0000-4000-8000-000000000010','27419000-0000-4000-8000-000000000001','owner','27419000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name) values('cleanup-booking-only','27419000-0000-4000-8000-000000000020','Cleanup booking-only fixture');
insert into public.offering_website_bindings(id,business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
values('27419000-0000-4000-8000-000000000030','27419000-0000-4000-8000-000000000010','27419000-0000-4000-8000-000000000020','cleanup-booking-only','Cleanup booking-only fixture','cleanup-booking-only',repeat('a',64),'27419000-0000-4000-8000-000000000001','27419000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
values('27419000-0000-4000-8000-000000000040','27419000-0000-4000-8000-000000000010','scheduling','schedule','Cleanup booking-only fixture',
'{"version":1,"revision":0,"title":"Cleanup booking-only fixture","createdBy":"27419000-0000-4000-8000-000000000001","createdAt":"2026-10-08T00:00:00Z","history":[],"availability":[],"reservations":[]}', '27419000-0000-4000-8000-000000000001');
insert into public.public_website_booking_grants(id,tenant_stable_id,business_workspace_id,work_id,capability_id,capability_version,inquiry_capability_id,inquiry_version,provider,display_name,time_zone,published_by)
values('27419000-0000-4000-8000-000000000050','27419000-0000-4000-8000-000000000020','27419000-0000-4000-8000-000000000010','27419000-0000-4000-8000-000000000040','cleanup-booking',1,'cleanup-inquiry',1,'outlook','Cleanup booking-only fixture','America/New_York','27419000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select publications=0 and reservations=0 and booking_grants=1 and bookings=0 from public.tenant_cleanup_teardown_blockers('cleanup-booking-only')),'preview refuses the exact booking-only hold');
select pg_temp.expect_error($q$select public.deprovision_tenant_guarded('cleanup-booking-only',false,false,false)$q$,'tenant_teardown_blocked_by_workspace_owned_records');
select pg_temp.assert_true(exists(select 1 from public.tenants where id='cleanup-booking-only'),'booking-only refusal preserves tenant and grant');
\if :keep_fixture
commit;
\else
rollback;
\endif
