begin;
insert into public.tenants(id) values('w6-retention');
insert into public.report_snapshots(tenant_id,period,metrics) values('w6-retention','2026-10','{}');
do $$declare v_result jsonb;
begin
  v_result:=public.deprovision_tenant_rows_retained('w6-retention');
  if exists(select 1 from public.tenants where id='w6-retention') then raise exception 'tenant not removed'; end if;
  if not exists(select 1 from public.report_snapshots where tenant_id='w6-retention') then raise exception 'receipt erased'; end if;
  if not exists(select 1 from public.tenant_deprovision_retention_receipts where tenant_slug='w6-retention' and retained_counts->>'report_snapshots'='1') then raise exception 'retention receipt missing'; end if;
  if has_table_privilege('authenticated','public.tenant_deprovision_retention_receipts','SELECT') then raise exception 'receipt exposed'; end if;
  if has_function_privilege('anon','public.deprovision_tenant_rows_retained(text)','EXECUTE') then raise exception 'purge exposed'; end if;
end $$;
rollback;
