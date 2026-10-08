\set ON_ERROR_STOP on
do $$
begin
  if to_regprocedure('public.deprovision_tenant_rows_retained_after_inquiry_export(text)') is null then
    raise exception 'combined teardown wrapper missing';
  end if;
  if has_function_privilege('anon','public.deprovision_tenant_rows_retained_after_inquiry_export(text)','execute')
    or has_function_privilege('authenticated','public.deprovision_tenant_rows_retained_after_inquiry_export(text)','execute')
    or not has_function_privilege('service_role','public.deprovision_tenant_rows_retained_after_inquiry_export(text)','execute') then
    raise exception 'combined teardown wrapper grants are wrong';
  end if;
  if position('assert_tenant_inquiry_export' in pg_get_functiondef('public.deprovision_tenant_rows_retained_after_inquiry_export(text)'::regprocedure)) = 0
    or position('deprovision_tenant_rows_retained' in pg_get_functiondef('public.deprovision_tenant_rows_retained_after_inquiry_export(text)'::regprocedure)) = 0 then
    raise exception 'combined teardown wrapper must check the export, then retain receipts';
  end if;
end $$;
