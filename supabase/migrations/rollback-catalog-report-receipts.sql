-- First disable STRELVA_CATALOG_REPORTS_RELEASE. Export receipts before removing.
-- Later flag migrations must be rolled back first.
begin;
set local lock_timeout = '3s';
delete from public.workspace_release_flags where flag = 'catalog_reports';
drop function public.read_catalog_report_failures(uuid,text);
drop function public.read_catalog_search_connection(text,uuid);
drop function public.record_catalog_search_connection(text,text,bigint,bigint);
drop function public.read_catalog_report_receipts(uuid,uuid,text,timestamptz);
drop function public.record_catalog_report_receipt(text,text,text,text,text,text,text);
drop table public.catalog_search_connections;
drop table public.catalog_report_receipts;
create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites',
    'make_real_owner_link', 'publishing', 'publishing_record_google_policy', 'internal_tool_notices']::text[]
$$;
commit;
