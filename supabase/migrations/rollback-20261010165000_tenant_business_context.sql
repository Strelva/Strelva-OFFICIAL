-- Turn off STRELVA_BUSINESS_RECORD_READS first. Existing facts stay intact.
begin;
set local lock_timeout = '2s';
drop function if exists public.read_tenant_business_context(text);
commit;
