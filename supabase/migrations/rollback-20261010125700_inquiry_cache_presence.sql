-- First restore STRELVA_LEADS_READ=redis; retain all leads.
begin;
set local lock_timeout = '3s';
revoke execute on function public.read_tenant_lead_presence(text,text[]) from service_role;
commit;
