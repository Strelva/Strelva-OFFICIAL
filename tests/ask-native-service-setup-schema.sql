\set ON_ERROR_STOP on
create function pg_temp.assert_setup(value boolean,message text) returns void language plpgsql as $$
begin if value is not true then raise exception 'assertion failed: %',message; end if; end $$;
select pg_temp.assert_setup(to_regprocedure('public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)') is not null,
  'Ask new-service setup must have a scoped atomic native publication contract');
create temp table setup_input(payload jsonb); insert into setup_input values(:'setup_json'::jsonb);
create function pg_temp.setup_rows() returns jsonb language sql as $$
 select jsonb_build_object('work',(select coalesce(jsonb_agg(to_jsonb(w) order by w.id),'[]') from public.saved_product_work w),
 'inquiry',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.inquiry_workspaces i),
 'grant',(select coalesce(jsonb_agg(to_jsonb(g) order by g.id),'[]') from public.public_website_booking_grants g),
 'settings',(select coalesce(jsonb_agg(to_jsonb(r) order by r.calendar_key),'[]') from public.booking_settings r),
 'service',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.business_services r),
 'policy',(select coalesce(jsonb_agg(to_jsonb(r) order by r.business_service_id),'[]') from public.booking_service_policies r),
 'recordRevision',(select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence),'[]') from public.business_record_revisions r),
 'confirmed',(select coalesce(jsonb_agg(to_jsonb(r) order by r.entity_id),'[]') from public.business_record_confirmed r),
 'receipt',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.ask_native_service_setups r)); $$;
create function pg_temp.expect_setup_refusal(command text,reason text) returns void language plpgsql as $$
declare before_rows jsonb:=pg_temp.setup_rows(); caught text;
begin
 begin execute command; exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_setup(caught is not null and position(reason in caught)>0,'expected refusal '||reason||'; got '||coalesce(caught,'acceptance'));
 perform pg_temp.assert_setup(pg_temp.setup_rows()=before_rows,'refusal must preserve all native rows');
end $$;
insert into public.users(id,email,verified_at) values
 ('45600000-0000-4000-8000-000000000001','owner456@example.test',clock_timestamp()),
 ('45600000-0000-4000-8000-000000000002','member456@example.test',clock_timestamp()),
 ('45600000-0000-4000-8000-000000000003','admin456@example.test',clock_timestamp()),
 ('45600000-0000-4000-8000-000000000004','foreign456@example.test',clock_timestamp());
insert into public.workspaces(id,kind,name,created_by) values
 ('45600000-0000-4000-8000-000000000010','customer','Ask 456 fixture','45600000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','45600000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner','45600000-0000-4000-8000-000000000001'),
 ('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000002','member','45600000-0000-4000-8000-000000000001'),
 ('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000003','admin','45600000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values
 ('ask456-fixture','45600000-0000-4000-8000-000000000020','Ask fixture',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values('45600000-0000-4000-8000-000000000020','ask456-fixture','45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','45600000-0000-4000-8000-000000000050',repeat('b',64),'{}');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values
 ('45600000-0000-4000-8000-000000000001','ask456-fixture','45600000-0000-4000-8000-000000000020','owner');
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
 values('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000020','ask456-fixture','Ask fixture','ask456-binding',repeat('a',64),'45600000-0000-4000-8000-000000000001','45600000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_connections(id,workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by,updated_at)
 values('45600000-0000-4000-8000-000000000030','45600000-0000-4000-8000-000000000010','google','fixture-calendar','Fixture calendar','America/New_York','connected','45600000-0000-4000-8000-000000000001','2026-10-08T12:00:00Z');
select pg_temp.assert_setup(not has_function_privilege('anon','public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)','execute')
 and not has_function_privilege('authenticated','public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)','execute')
 and has_function_privilege('service_role','public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)','execute')
 and not has_table_privilege('service_role','public.ask_native_service_setups','insert,update,delete'),'service-only actor RPC and read-only receipt ACL');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000003','admin456@example.test',(select payload from setup_input))$q$,'ask_service_setup_owner_required');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000004','foreign456@example.test',(select payload from setup_input))$q$,'offering_business_membership_required');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','wrong@example.test',(select payload from setup_input))$q$,'offering_actor_unverified');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,tenantStableId}','"45600000-0000-4000-8000-000000000021"') from setup_input))$q$,'ask_service_setup_tenant_changed');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,calendarUpdatedAt}','"2026-10-08T11:00:00Z"') from setup_input))$q$,'ask_service_setup_calendar_changed');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,service,durationMinutes}','45') from setup_input))$q$,'ask_service_setup_times_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{inquiryState,capabilities,0,live,routing}','{}') from setup_input))$q$,'ask_service_setup_native_inquiry_invalid');
delete from public.memberships where tenant_id='ask456-fixture';
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload from setup_input))$q$,'ask_service_setup_tenant_owner_required');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('45600000-0000-4000-8000-000000000001','ask456-fixture','45600000-0000-4000-8000-000000000020','owner');
-- Malformed service-role input never reaches a write.
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select null::jsonb from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload-'selection' from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload-'capabilityId' from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,service,provider}','null') from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,service,serviceName}','null') from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,service,availability}','null') from setup_input))$q$,'ask_service_setup_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{inquiryState,capabilities}','null') from setup_input))$q$,'ask_service_setup_native_inquiry_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{inquiryState,capabilities,0,live,connections}','null') from setup_input))$q$,'ask_service_setup_native_inquiry_invalid');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,businessRecordRevision}','1') from setup_input))$q$,'ask_service_setup_native_booking_changed');
-- Successful activation changes all native owners in a single transaction.
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{inquiryState,requests,0,publishApproval,approvedAt}','"2000-01-01T00:00:00.000Z"') from setup_input))$q$,'ask_service_setup_native_inquiry_invalid');
select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload from setup_input));
select pg_temp.assert_setup((select count(*)=1 from public.ask_native_service_setups)
 and (select count(*)=1 from public.public_website_booking_grants)
 and (select count(*)=1 from public.saved_product_work where created_by='45600000-0000-4000-8000-000000000001')
 and (select state->'capabilities'->0->'live'->'routing'='null'::jsonb and state->'capabilities'->0->'live'->'followUp'='null'::jsonb from public.inquiry_workspaces),'native owner-authored schedule, no-email inquiry and grant committed');
select pg_temp.assert_setup(public.read_tenant_booking_context('ask456-fixture')->'services'->0->>'durationMinutes'='30' and public.read_tenant_booking_context('ask456-fixture')->'services'->0->>'externalRef'=(select payload->>'capabilityId' from setup_input)
 and public.read_tenant_booking_context('ask456-fixture')->'settings'->>'mode'='request' and public.read_tenant_booking_context('ask456-fixture')->'settings'->'bookableHours'='[]'::jsonb and jsonb_array_length(public.read_tenant_booking_context('ask456-fixture')->'settings'->'bookableOverrides')=1,'real confirmed service and exact native availability visible to unchanged store reader');
-- VISITOR_HTTP_PROOF
create temp table accepted_rows as select pg_temp.setup_rows() rows;
-- Exact accepted replay preserves rows, even after mutable reservations change.
select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload from setup_input));
select pg_temp.assert_setup(pg_temp.setup_rows()=(select rows from accepted_rows),'accepted replay makes no second native write');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select jsonb_set(payload,'{selection,service,serviceName}','"Changed name"') from setup_input))$q$,'ask_service_setup_replay_mismatch');
select pg_temp.expect_setup_refusal($q$update public.ask_native_service_setups set selection='{}'$q$,'ask_service_setup_receipt_immutable');
update public.saved_product_work set payload=jsonb_set(payload,'{reservations}','[{"requestId":"accepted-fixture","title":"Customer appointment","start":"2035-10-08T14:00:00.000Z","end":"2035-10-08T14:30:00.000Z","status":"accepted","providerId":"fictional-provider-id"}]');
update public.workspace_calendar_connections set updated_at=clock_timestamp();
select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload from setup_input));
select public.revoke_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select grant_id from public.ask_native_service_setups),'Stopped reviewed setup');
select pg_temp.assert_setup((select status='revoked' from public.public_website_booking_grants)
 and (select payload ? 'pause' and payload->'reservations'->0->>'status'='accepted' from public.saved_product_work)
 and (select state->'capabilities'->0->>'status'='paused' and state->'capabilities'->0->'live' is not null from public.inquiry_workspaces)
 and (select count(*)=1 from public.ask_native_service_setups),'undo stops only new acceptance and preserves prior reservation, inquiry definition and immutable receipt');
create temp table stopped_rows as select pg_temp.setup_rows() rows;
select public.revoke_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select grant_id from public.ask_native_service_setups),'Stopped reviewed setup');
select pg_temp.assert_setup(pg_temp.setup_rows()=(select rows from stopped_rows),'repeated undo changes no rows');
select pg_temp.expect_setup_refusal($q$select public.publish_ask_native_service_setup('45600000-0000-4000-8000-000000000010','45600000-0000-4000-8000-000000000001','owner456@example.test',(select payload from setup_input))$q$,'ask_service_setup_replay_revoked');

-- Accepted evidence outlives native teardown; no new receipt FK may block it.
-- A later separately edited operating policy keeps its existing authority guard.
update public.booking_service_policies set revision=3;
select pg_temp.expect_setup_refusal($q$select public.deprovision_tenant_rows_retained_after_inquiry_export('ask456-fixture')$q$,'ask_service_setup_teardown_policy_changed');
update public.booking_service_policies set revision=2;
-- Foreign policies are never removed by this setup's teardown hook.
insert into public.business_services(id,workspace_id,name,source,created_by,updated_by) values('45600000-0000-4000-8000-000000000077','45600000-0000-4000-8000-000000000010','Independent service','owner','45600000-0000-4000-8000-000000000001','45600000-0000-4000-8000-000000000001');
insert into public.booking_service_policies(tenant_stable_id,workspace_id,business_service_id,mode,buffer_minutes,bookable,intake)
  select tenant_stable_id,workspace_id,'45600000-0000-4000-8000-000000000077','request',0,false,'[]' from public.booking_service_policies;
select pg_temp.expect_setup_refusal($q$select public.deprovision_tenant_rows_retained_after_inquiry_export('ask456-fixture')$q$,'booking_service_policies_tenant_stable_id_fkey');
delete from public.booking_service_policies where business_service_id='45600000-0000-4000-8000-000000000077';
select public.deprovision_tenant_rows_retained_after_inquiry_export('ask456-fixture');
select pg_temp.assert_setup((select count(*)=1 from public.ask_native_service_setups) and not exists(select 1 from public.public_website_booking_grants),'tenant teardown succeeds, grant disappears and immutable setup evidence survives');
