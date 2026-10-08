-- First disable STRELVA_CATALOG_REPORTS_RELEASE. Export receipts before removing.
-- The flag list keeps every other stream's keys; only catalog_reports is removed.
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
-- Remove only this stream's keys; never restate other streams' keys (#253).
do $migration$
declare previous text[];
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous from unnest(previous) key where key <> all(array['catalog_reports']);
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end;
$migration$;
commit;
