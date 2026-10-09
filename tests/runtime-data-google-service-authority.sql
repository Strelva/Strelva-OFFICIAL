\set ON_ERROR_STOP on
-- Prepared real producer proof; transaction owns only fictional rows.
begin;
create function pg_temp.pa_assert(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'fixture assertion: %',message; end if; end $$;
insert into public.users(id, email, verified_at) values
  ('6c000000-0000-4000-8000-000000000001', 'pa-operator@strelva.example.test', now()),
  ('6c000000-0000-4000-8000-000000000002', 'pa-north-owner@north.example.test', now()),
  ('6c000000-0000-4000-8000-000000000003', 'pa-north-staff@north.example.test', now()),
  ('6c000000-0000-4000-8000-000000000004', 'pa-client-owner@example.test', null),
  ('6c000000-0000-4000-8000-000000000005', 'pa-unverified-agency@else.example.test', now());
insert into public.super_admins(user_id, email) values ('6c000000-0000-4000-8000-000000000001', 'pa-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('6c000000-0000-4000-8000-000000000020', 'agency', 'Strelva agency fixture', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000030', 'agency', 'Northside Web', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000040', 'agency', 'Unverified Agency', '6c000000-0000-4000-8000-000000000005'),
  ('6c000000-0000-4000-8000-000000000010', 'customer', 'Converted Strelva client', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000011', 'customer', 'Northside client', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000012', 'customer', 'Unverified agency client', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000013', 'customer', 'No provider', '6c000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('6c000000-0000-4000-8000-000000000020', '6c000000-0000-4000-8000-000000000001', 'owner', '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000002', 'owner', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000003', 'member', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000040', '6c000000-0000-4000-8000-000000000005', 'owner', '6c000000-0000-4000-8000-000000000005'),
  -- Converted today: the operator holds admin (the pre-7A conversion path).
  ('6c000000-0000-4000-8000-000000000010', '6c000000-0000-4000-8000-000000000001', 'admin', '6c000000-0000-4000-8000-000000000001'),
  -- The Northside client's owner exists but never verified (never signed in).
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000004', 'owner', '6c000000-0000-4000-8000-000000000004'),
  ('6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000005', 'admin', '6c000000-0000-4000-8000-000000000005'),
  ('6c000000-0000-4000-8000-000000000013', '6c000000-0000-4000-8000-000000000001', 'admin', '6c000000-0000-4000-8000-000000000001');
select public.designate_strelva_agency_workspace('pa-operator@strelva.example.test', '6c000000-0000-4000-8000-000000000020');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('pa-fixture-site', '6c000000-0000-4000-8000-0000000000a1', 'Platform Actor Fixture', true, 'pa-tenant-owner@example.test');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('6c000000-0000-4000-8000-0000000000a1', 'pa-fixture-site', '6c000000-0000-4000-8000-000000000010',
    '6c000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-0000000000b1', repeat('a', 64), '{}'::jsonb);
-- Outside providers by the owner's ordinary choice (provider row + seat). The
-- unverified owner cannot choose, so these fixture rows are written directly.
insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by) values
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000030', 'business_choice', '6c000000-0000-4000-8000-000000000002'),
  ('6c000000-0000-4000-8000-000000000012', '6c000000-0000-4000-8000-000000000040', 'business_choice', '6c000000-0000-4000-8000-000000000005');
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values
  ('6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000030', 'owner', '6c000000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values
  ('6c000000-0000-4000-8000-000000000030', '6c000000-0000-4000-8000-000000000011', '6c000000-0000-4000-8000-000000000003', '6c000000-0000-4000-8000-000000000002');
select pg_temp.pa_assert((select provider_workspace_id from public.workspace_providers
  where customer_workspace_id = '6c000000-0000-4000-8000-000000000010' and status = 'active') = '6c000000-0000-4000-8000-000000000020',
  'conversion still marks Strelva as provider of record');


insert into public.business_owner_recipient_trust(workspace_id,email,trusted_via,tenant_stable_id) values('6c000000-0000-4000-8000-000000000010','pa-tenant-owner@example.test','conversion','6c000000-0000-4000-8000-0000000000a1') on conflict(workspace_id) do nothing;
select public.record_agency_verification('pa-operator@strelva.example.test','6c000000-0000-4000-8000-000000000020','publish','verified','{"fixture":"fictional local authority"}',null);
select public.record_agency_verification('pa-operator@strelva.example.test','6c000000-0000-4000-8000-000000000020','google','verified','{"fixture":"fictional local authority"}',null);
-- A provider attribution row is not a seat or a customer mandate.
-- Repair this fictional converted link through the actual operator repath command.
select public.repath_converted_tenant_provider('pa-operator@strelva.example.test','pa-fixture-site',
 '6c000000-0000-4000-8000-000000000020','["pa-operator@strelva.example.test"]'::jsonb,'existing_contract',true);
select pg_temp.pa_assert(exists(select 1 from public.provider_seats where customer_workspace_id='6c000000-0000-4000-8000-000000000010'
 and agency_workspace_id='6c000000-0000-4000-8000-000000000020' and status='active' and granted_by_kind='conversion'),'actual repath creates conversion seat');
select public.record_conversion_resource_mandate('pa-operator@strelva.example.test',
 '6c000000-0000-4000-8000-000000000010','6c000000-0000-4000-8000-000000000020',
 'google','google_location','service-location','Fictional offline customer instruction for local authority proof.');
insert into public.workspace_account_bindings(id,workspace_id,provider,migrated_from,status,access_token_ciphertext)
values('6c000000-0000-4000-8000-000000000051','6c000000-0000-4000-8000-000000000010','google','oauth','connected','enc:v1:AAAA:BBBB:CCCC');
insert into public.workspace_google_locations(workspace_id,binding_id,account_id,location_id)
values('6c000000-0000-4000-8000-000000000010','6c000000-0000-4000-8000-000000000051','accounts/fixture','service-location');
create temporary table gs_fixture(request jsonb,decision uuid,session uuid) on commit drop;
insert into gs_fixture(request) values(jsonb_build_object('tenantId','workspace-6c000000-0000-4000-8000-000000000010','locationId','service-location','eventId','event','draftDigest',repeat('a',64)));
insert into public.system_possibilities(id,business_workspace_id,status,revision,candidate_revision,body,created_by)
select '6c000000-0000-4000-8000-000000000052','6c000000-0000-4000-8000-000000000010','ready',1,1,jsonb_build_object('effects',jsonb_build_array(jsonb_build_object('kind','publish','channel','google_listing','request',request))),'6c000000-0000-4000-8000-000000000001' from gs_fixture;
update gs_fixture set decision=(public.open_owner_decision('6c000000-0000-4000-8000-000000000010',jsonb_build_object('kind','system.change_live','route','owner_decides','title','Google fixture','approveEffect','Publish exact Google draft','notYetEffect','Nothing changes','sourceLifecycle','make_real','sourceId','6c000000-0000-4000-8000-000000000052@1','revisionHash',repeat('b',64),'urgent',false,'adminMayDecide',false))->>'id')::uuid;
update gs_fixture set session=(public.strelva_make_real_link_session('6c000000-0000-4000-8000-000000000010',decision,'pa-tenant-owner@example.test')->>'sessionId')::uuid;
select public.claim_owner_decision('6c000000-0000-4000-8000-000000000010',decision,repeat('b',64),'approve','owner_link',null,null,'pa-tenant-owner@example.test') from gs_fixture;
select public.record_strelva_service_action('6c000000-0000-4000-8000-000000000010',session,'run','possibility:6c000000-0000-4000-8000-000000000052@1','Fixture') from gs_fixture;
create function pg_temp.gs_check(mode text default 'approve') returns jsonb language sql as $$ select public.check_google_make_real_service_authority('6c000000-0000-4000-8000-000000000010',session,decision,request,mode,'6c000000-0000-4000-8000-000000000052',null) from gs_fixture $$;
create function pg_temp.gs_denied() returns void language plpgsql as $$ begin
 begin perform pg_temp.gs_check(); exception when others then if sqlerrm='google_service_denied' then return; end if; raise; end;
 raise exception 'expected_service_denial'; end $$;
do $$ begin
 if has_function_privilege('authenticated','public.check_google_make_real_service_authority(uuid,uuid,uuid,jsonb,text,text,text)','execute') or not has_function_privilege('service_role','public.check_google_make_real_service_authority(uuid,uuid,uuid,jsonb,text,text,text)','execute') then raise exception 'service_acl_wrong'; end if;
 if pg_temp.gs_check()->>'userId'<>'6c000000-0000-4000-8000-000000000001' then raise exception 'service_identity_wrong'; end if;
 begin perform pg_temp.gs_check('undo'); raise exception 'link_undo_allowed'; exception when others then if sqlerrm<>'google_service_denied' then raise; end if; end;
end $$;
savepoint recipient;
update public.business_owner_recipient_trust set email='changed@example.test' where workspace_id='6c000000-0000-4000-8000-000000000010';
select pg_temp.gs_denied();
rollback to recipient;
savepoint candidate;
update public.system_possibilities set candidate_revision=2 where id='6c000000-0000-4000-8000-000000000052';
select pg_temp.gs_denied();
rollback to candidate;
savepoint revoked;
update public.workspace_account_bindings set status='revoked' where id='6c000000-0000-4000-8000-000000000051';
select pg_temp.gs_denied();
rollback to revoked;
savepoint expired;
insert into public.strelva_service_actions(id,workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,provider_workspace_id,created_at)
select '6c000000-0000-4000-8000-000000000053',workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,provider_workspace_id,clock_timestamp()-interval '31 minutes' from public.strelva_service_actions where id=(select session from gs_fixture);
update gs_fixture set session='6c000000-0000-4000-8000-000000000053';
select pg_temp.gs_denied();
rollback to expired;
select public.record_agency_verification('pa-operator@strelva.example.test','6c000000-0000-4000-8000-000000000020','google','unverified','{}','Fixture');
select pg_temp.gs_denied();
rollback;
