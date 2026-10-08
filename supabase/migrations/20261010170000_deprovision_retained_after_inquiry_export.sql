-- Integration of two additive teardown wrappers (w6 inquiries + agency-operator).
-- With Postgres lead authority and receipt retention both on, teardown must
-- check the inquiry export and retain receipts in one transaction.
begin;
set local lock_timeout = '3s';
create function public.deprovision_tenant_rows_retained_after_inquiry_export(p_tenant_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_tenant_inquiry_export(p_tenant_id);
  return public.deprovision_tenant_rows_retained(p_tenant_id);
end $$;
revoke all on function public.deprovision_tenant_rows_retained_after_inquiry_export(text) from public,anon,authenticated;
grant execute on function public.deprovision_tenant_rows_retained_after_inquiry_export(text) to service_role;
commit;
