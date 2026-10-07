-- Turn STRELVA_CLIENT_RECORDS_READ / DUAL_WRITE off first. Keep all copied rows.
set lock_timeout = '3s';
drop function if exists public.read_tenant_client_records_page(text,text,integer,timestamptz,text);
drop function if exists public.find_client_calendly_tenant(text);
-- Expanded store constraint deliberately remains: reverting it would require
-- deleting client records. Existing code ignores unrecognized stores safely.
-- Restore client_record_parity_streak from 20261007181000 only if old partial
-- tenant coverage is explicitly desired; the stricter guard is backward safe.
