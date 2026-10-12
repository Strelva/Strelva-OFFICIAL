begin;
set local lock_timeout = '3s';
-- Disable STRELVA_INQUIRY_OUTCOMES first; retain all evidence.
revoke execute on function public.business_inquiry_outcomes_for_tenant(text,timestamptz,timestamptz) from service_role;
commit;
