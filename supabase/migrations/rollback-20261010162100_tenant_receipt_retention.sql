-- Disable STRELVA_TENANT_RECEIPT_RETENTION first. Retain receipts as evidence.
set lock_timeout = '3s';
drop function if exists public.deprovision_tenant_rows_retained(text);
-- Keep tenant_deprovision_retention_receipts; rollback never erases evidence.
