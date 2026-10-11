\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.cr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'catalog report assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.cr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but statement succeeded', expected;
end; $$;

insert into public.users(id,email,verified_at) values
  ('c6100000-0000-4000-8000-000000000001','catalog-owner@example.test',now()),
  ('c6100000-0000-4000-8000-000000000002','catalog-other@example.test',now()),
  ('c6100000-0000-4000-8000-000000000003','catalog-operator@example.test',now());
insert into public.super_admins(user_id,email) values ('c6100000-0000-4000-8000-000000000003','catalog-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
  ('c6100000-0000-4000-8000-000000000010','customer','Catalog business','c6100000-0000-4000-8000-000000000001'),
  ('c6100000-0000-4000-8000-000000000011','customer','Other catalog business','c6100000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('c6100000-0000-4000-8000-000000000010','c6100000-0000-4000-8000-000000000001','owner','c6100000-0000-4000-8000-000000000001'),
  ('c6100000-0000-4000-8000-000000000011','c6100000-0000-4000-8000-000000000002','owner','c6100000-0000-4000-8000-000000000002');
insert into public.tenants(id,stable_id) values
  ('catalog-site','c6100000-0000-4000-8000-0000000000a1'),('catalog-unlinked','c6100000-0000-4000-8000-0000000000a2');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
  values ('c6100000-0000-4000-8000-0000000000a1','catalog-site','c6100000-0000-4000-8000-000000000010',
    'c6100000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-0000000000c1',repeat('a',64),'{}'::jsonb);

select pg_temp.cr_assert(not has_table_privilege('service_role','public.catalog_report_receipts','SELECT')
  and not has_table_privilege('authenticated','public.catalog_search_connections','SELECT')
  and not has_function_privilege('anon','public.record_catalog_report_receipt(text,text,text,text,text,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_catalog_report_failures(uuid,text)','EXECUTE')
  and has_function_privilege('service_role','public.read_catalog_report_receipts(uuid,uuid,text,timestamptz)','EXECUTE'), 'service RPCs only');
select pg_temp.cr_assert('catalog_reports' = any(public.workspace_release_flag_names()) and 'internal_tool_notices' = any(public.workspace_release_flag_names()), 'flag allowlist retained');
select pg_temp.cr_assert(not public.record_catalog_report_receipt('catalog-unlinked','monthly','2026-09','suppressed',null,'missing_owner_email',null), 'unconverted tenant is unchanged');
select pg_temp.cr_assert(public.record_catalog_report_receipt('catalog-site','monthly','2026-09','suppressed',null,'missing_owner_email',null), 'missing recipient is a durable suppression');
select pg_temp.cr_assert(jsonb_array_length(public.read_catalog_report_receipts('c6100000-0000-4000-8000-000000000010','c6100000-0000-4000-8000-000000000001','catalog-owner@example.test',null)) = 1, 'owner sees own suppression');
select pg_temp.cr_expect($$select public.read_catalog_report_receipts('c6100000-0000-4000-8000-000000000010','c6100000-0000-4000-8000-000000000002','catalog-other@example.test',null)$$, 'workspace_access_denied');
select pg_temp.cr_expect($$select public.read_catalog_report_receipts('c6100000-0000-4000-8000-000000000010','c6100000-0000-4000-8000-000000000001','wrong@example.test',null)$$, 'workspace_access_denied');
select pg_temp.cr_expect($$select public.read_catalog_report_failures('c6100000-0000-4000-8000-000000000001','catalog-owner@example.test')$$, 'workspace_access_denied');
select pg_temp.cr_assert(jsonb_array_length(public.read_catalog_report_failures('c6100000-0000-4000-8000-000000000003','catalog-operator@example.test')) = 1, 'operator sees missing recipient');
select public.record_catalog_report_receipt('catalog-site','monthly','2026-09','accepted','catalog-owner@example.test',null,'message-fixture');
select pg_temp.cr_assert(jsonb_array_length(public.read_catalog_report_failures('c6100000-0000-4000-8000-000000000003','catalog-operator@example.test')) = 0, 'success resolves queue item');

select public.record_catalog_search_connection('catalog-site','unreachable',null,null);
create temp table first_catalog_failure as select unreachable_since from public.catalog_search_connections where tenant_stable_id = 'c6100000-0000-4000-8000-0000000000a1';
select public.record_catalog_search_connection('catalog-site','unreachable',null,null);
select pg_temp.cr_assert((select s.unreachable_since = f.unreachable_since and s.clicks is null from public.catalog_search_connections s, first_catalog_failure f where s.tenant_stable_id = 'c6100000-0000-4000-8000-0000000000a1'), 'failure date retained, missing is not zero');
select pg_temp.cr_assert(public.read_catalog_search_connection('catalog-site','c6100000-0000-4000-8000-000000000011') is null, 'another business cannot read reachability');
select public.record_catalog_search_connection('catalog-site','available',0,0);
select pg_temp.cr_assert(public.read_catalog_search_connection('catalog-site','c6100000-0000-4000-8000-000000000010')->>'status' = 'available'
  and public.read_catalog_search_connection('catalog-site','c6100000-0000-4000-8000-000000000010')->'unreachableSince' = 'null'::jsonb, 'recovery clears failure date and retains measured zeros');

rollback;
