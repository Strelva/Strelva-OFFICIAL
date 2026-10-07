-- Restore STRELVA_LEADS_READ=redis first. Keep the daily parity evidence.
begin;
set local lock_timeout = '3s';
revoke execute on function public.record_tenant_lead_read_parity(text,integer,integer,integer,integer),
  public.tenant_lead_read_parity_streak() from service_role;
commit;
