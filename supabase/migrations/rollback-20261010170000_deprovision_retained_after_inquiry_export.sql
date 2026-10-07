-- Disable STRELVA_TENANT_RECEIPT_RETENTION or Postgres lead authority first.
set lock_timeout = '3s';
drop function if exists public.deprovision_tenant_rows_retained_after_inquiry_export(text);
