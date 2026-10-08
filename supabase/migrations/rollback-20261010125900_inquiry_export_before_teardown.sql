-- First set STRELVA_LEADS_AUTHORITY back to Redis. No lead evidence is deleted.
begin;
set local lock_timeout='3s';
revoke execute on function public.assert_tenant_inquiry_export(text),public.deprovision_tenant_rows_after_inquiry_export(text) from service_role;
commit;
