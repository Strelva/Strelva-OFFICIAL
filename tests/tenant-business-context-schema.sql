\set ON_ERROR_STOP on
begin;
create function pg_temp.bc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'business context: %', message; end if; end $$;
insert into public.users(id,email) values ('eb000000-0000-4000-8000-000000000001','bc-owner@example.test');
insert into public.workspaces(id,kind,name,created_by) values
  ('eb000000-0000-4000-8000-000000000010','customer','BC fixture','eb000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000011','customer','BC unrelated','eb000000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values ('bc-site','eb000000-0000-4000-8000-000000000020','BC Site',true), ('bc-unlinked','eb000000-0000-4000-8000-000000000021','Unlinked',true);
insert into public.business_records(workspace_id,created_by,updated_by) values
  ('eb000000-0000-4000-8000-000000000010','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000011','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
  ('eb000000-0000-4000-8000-000000000020','bc-site','eb000000-0000-4000-8000-000000000010','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000030',repeat('a',64),'{}');
insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values
  ('eb000000-0000-4000-8000-000000000010','display_name','"Confirmed name"','owner','eb000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000010','phone','"+17165550100"','tenant_import','eb000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000010','owner_recipient','{"email":"private@example.test"}','owner','eb000000-0000-4000-8000-000000000001'),
  ('eb000000-0000-4000-8000-000000000011','display_name','"Other business"','owner','eb000000-0000-4000-8000-000000000001');
insert into public.business_services(workspace_id,name,description,source,created_by,updated_by,active) values
  ('eb000000-0000-4000-8000-000000000010','Consult','Confirmed','owner','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001',true),
  ('eb000000-0000-4000-8000-000000000010','Unconfirmed','Import','tenant_import','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001',true),
  ('eb000000-0000-4000-8000-000000000010','Retired','Old service','owner','eb000000-0000-4000-8000-000000000001','eb000000-0000-4000-8000-000000000001',false);
select pg_temp.bc_assert(not has_function_privilege('anon','public.read_tenant_business_context(text)','execute') and not has_function_privilege('authenticated','public.read_tenant_business_context(text)','execute') and has_function_privilege('service_role','public.read_tenant_business_context(text)','execute'),'server-only reader');
select pg_temp.bc_assert(public.read_tenant_business_context('bc-site')->'facts'->>'display_name' = 'Confirmed name','linked record');
select pg_temp.bc_assert(not (public.read_tenant_business_context('bc-site')->'facts' ? 'phone') and not (public.read_tenant_business_context('bc-site')->'facts' ? 'owner_recipient'),'unconfirmed and private facts excluded');
select pg_temp.bc_assert(jsonb_array_length(public.read_tenant_business_context('bc-site')->'services') = 1,'active confirmed services only');
select pg_temp.bc_assert(public.read_tenant_business_context('bc-unlinked') is null and public.read_tenant_business_context('unknown') is null,'unlinked tenants never receive unrelated facts');
update public.tenants set id = 'bc-renamed' where id = 'bc-site';
select pg_temp.bc_assert(public.read_tenant_business_context('bc-site') is null and public.read_tenant_business_context('bc-renamed')->'facts'->>'display_name' = 'Confirmed name','stable identity follows rename');
rollback;
