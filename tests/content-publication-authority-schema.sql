\set ON_ERROR_STOP on
\if :{?cp_keep_fixture}
\else
\set cp_keep_fixture false
\endif
begin;
create function pg_temp.cp_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'content authority: %',label; end if; end $$;
create function pg_temp.cp_expect(q text,expected text) returns void language plpgsql as $$ begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'expected %',expected; end $$;
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec
insert into public.users(id,email,verified_at) values
 ('ca495000-0000-4000-8000-000000000001','cp-owner@example.test',now()),
 ('ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test',now()),
 ('ca495000-0000-4000-8000-000000000003','cp-other@agency.example.test',now()),
 ('ca495000-0000-4000-8000-000000000004','cp-operator@platform.example.test',now());
insert into public.super_admins(user_id,email) values ('ca495000-0000-4000-8000-000000000004','cp-operator@platform.example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('ca495000-0000-4000-8000-000000000010','customer','Content business','ca495000-0000-4000-8000-000000000001'),
 ('ca495000-0000-4000-8000-000000000011','agency','Actual Agency','ca495000-0000-4000-8000-000000000002'),
 ('ca495000-0000-4000-8000-000000000012','agency','Other Agency','ca495000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000001','owner','ca495000-0000-4000-8000-000000000001'),
 ('ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000004','admin','ca495000-0000-4000-8000-000000000001'),
 ('ca495000-0000-4000-8000-000000000011','ca495000-0000-4000-8000-000000000002','owner','ca495000-0000-4000-8000-000000000002'),
 ('ca495000-0000-4000-8000-000000000012','ca495000-0000-4000-8000-000000000003','owner','ca495000-0000-4000-8000-000000000003');
insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values
 ('ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000011','business_choice','ca495000-0000-4000-8000-000000000001');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000011','owner','ca495000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values
 ('ca495000-0000-4000-8000-000000000011','ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000002','ca495000-0000-4000-8000-000000000002');
insert into public.tenants(id,stable_id,site_name,active) values ('cp-fixture','ca495000-0000-4000-8000-000000000020','Content fixture',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('ca495000-0000-4000-8000-000000000020','cp-fixture','ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'{}');
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('ca495000-0000-4000-8000-000000000099','ca495000-0000-4000-8000-000000000010','Another website','website',gen_random_uuid(),repeat('b',64),'ca495000-0000-4000-8000-000000000001','ca495000-0000-4000-8000-000000000001');
select pg_temp.cp_assert(not has_function_privilege('anon','public.write_content_as_actor(text,text,jsonb,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.write_content_as_actor(text,text,jsonb,uuid,text)','EXECUTE') and has_function_privilege('service_role','public.write_content_as_actor(text,text,jsonb,uuid,text)','EXECUTE'),'service-role boundary');
set local role service_role;
select pg_temp.cp_expect($q$select public.write_operator_content('cp-fixture','hero','{}')$q$,'content_publication_actor_required');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000004','cp-operator@platform.example.test')$q$,'acting_provider_not_staffed');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000003','cp-other@agency.example.test')$q$,'acting_provider_not_staffed');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','wrong@example.test')$q$,'content_publication_access_denied');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'acting_provider_unverified');
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) values
 ('ca495000-0000-4000-8000-000000000011','google','verified','{"fixture":"no outside call"}','ca495000-0000-4000-8000-000000000004',false);
set local role service_role;
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'acting_provider_unverified');
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) values
 ('ca495000-0000-4000-8000-000000000011','publish','verified','{"fixture":"local only"}','ca495000-0000-4000-8000-000000000004',false);
set local role service_role;
select public.grant_client_resource_mandate('ca495000-0000-4000-8000-000000000001','cp-owner@example.test','ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000011','publish','website','ca495000-0000-4000-8000-000000000099');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'acting_provider_no_mandate');
reset role;
select pg_temp.cp_assert(not exists(select 1 from public.content where tenant_id='cp-fixture') and not exists(select 1 from public.outside_write_receipts where tenant_id='cp-fixture'),'denials write neither content nor receipt');
set local role service_role;
select public.grant_client_resource_mandate('ca495000-0000-4000-8000-000000000001','cp-owner@example.test','ca495000-0000-4000-8000-000000000010','ca495000-0000-4000-8000-000000000011','publish','website',public.system_origin_id('ca495000-0000-4000-8000-000000000010','tenant','ca495000-0000-4000-8000-000000000020')::text);
create temporary table cp_receipts(body jsonb);
insert into cp_receipts values(public.write_content_as_actor('cp-fixture','hero','{"headline":"Agency update"}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test'));
select pg_temp.cp_assert((select body->'request'->'authorship'='{"authority":"provider","actorUserId":"ca495000-0000-4000-8000-000000000002","provider":{"workspaceId":"ca495000-0000-4000-8000-000000000011","name":"Actual Agency"}}'::jsonb and body->>'actor'='ca495000-0000-4000-8000-000000000002' and body->>'provider'='strelva_content' and body->>'undo'='put_back_draft' and body->>'undoLabel' like '%draft%review%publish%' from cp_receipts),'actual provider and actor snapshot separate from transport');
reset role;
update public.workspaces set name='Renamed agency' where id='ca495000-0000-4000-8000-000000000011';
select pg_temp.cp_assert((select public.outside_write_receipt_row((body->>'id')::uuid)->'request'->'authorship'->'provider'->>'name'='Actual Agency' from cp_receipts),'issued attribution survives renaming');
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,reason,verified_by,verifier_is_agency_member) values
 ('ca495000-0000-4000-8000-000000000011','publish','unverified','{}','Fixture verification revocation','ca495000-0000-4000-8000-000000000004',false);
set local role service_role;
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'acting_provider_unverified');
reset role;
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) values
 ('ca495000-0000-4000-8000-000000000011','publish','verified','{"fixture":"restored"}','ca495000-0000-4000-8000-000000000004',false);
update public.users set verified_at=null where id='ca495000-0000-4000-8000-000000000002';
set local role service_role;
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'content_publication_access_denied');
reset role;
update public.users set verified_at=now() where id='ca495000-0000-4000-8000-000000000002';
select id as exact_mandate from public.client_resource_mandates where resource_ref=public.system_origin_id('ca495000-0000-4000-8000-000000000010','tenant','ca495000-0000-4000-8000-000000000020')::text \gset
set local role service_role;
select public.end_client_resource_mandate('ca495000-0000-4000-8000-000000000001','cp-owner@example.test','ca495000-0000-4000-8000-000000000010', :'exact_mandate','Owner withdrew publish authority');
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{}','ca495000-0000-4000-8000-000000000002','cp-staff@agency.example.test')$q$,'acting_provider_no_mandate');
insert into cp_receipts values(public.write_content_as_actor('cp-fixture','hero','{"headline":"Owner update"}','ca495000-0000-4000-8000-000000000001','cp-owner@example.test'));
select pg_temp.cp_assert((select body->'request'->'authorship'->>'authority'='owner' and body->'request'->'authorship'->'provider'='null'::jsonb from cp_receipts where body->>'actor'='ca495000-0000-4000-8000-000000000001'),'self-serve owner never falsely attributed to an agency');
reset role;
-- Retain the accepted owner content when receipt insertion fails. No accepted
-- response is turned into a retry and readback cannot alter pinned authorship.
create function pg_temp.cp_refuse_receipt() returns trigger language plpgsql as $$ begin
 if new.tenant_id='cp-fixture' then raise exception 'cp_receipt_unavailable'; end if; return new;
end $$;
create trigger cp_refuse_receipt before insert on public.outside_write_receipts for each row execute function pg_temp.cp_refuse_receipt();
set local role service_role;
select pg_temp.cp_expect($q$select public.write_content_as_actor('cp-fixture','hero','{"headline":"Must never land"}','ca495000-0000-4000-8000-000000000001','cp-owner@example.test')$q$,'outside_write_receipt_invalid');
reset role;
select pg_temp.cp_assert((select data from public.content where tenant_id='cp-fixture' and section='hero')='{"headline":"Owner update"}'::jsonb and (select count(*) from public.outside_write_receipts where tenant_id='cp-fixture')=2,'receipt failure atomically rolls content back');
drop trigger cp_refuse_receipt on public.outside_write_receipts;
\if :cp_keep_fixture
commit;
\else
rollback;
\endif
