begin;
set local lock_timeout = '3s';
-- Disable STRELVA_INQUIRY_OUTCOMES and restore Redis reads first. No records are removed.
revoke execute on function public.read_tenant_lead_summary(text,timestamptz),public.business_inquiry_outcomes(uuid,uuid,text,timestamptz,timestamptz),
 public.business_outcome_month_inquiries(uuid,uuid,text,date) from service_role;
commit;
