begin;
set local lock_timeout='3s';
-- Keep pending/decided source proposals with the accepted facts and history.
revoke execute on function public.correct_inquiry_business_fact(uuid,uuid,text,jsonb),
  public.confirm_inquiry_business_fact(uuid,uuid,uuid,text),
  public.inquiry_business_fact_revision(uuid,uuid),
  public.read_inquiry_business_facts(uuid,uuid),
  public.stage_inquiry_business_fact(uuid,uuid,text,jsonb,text) from service_role;
commit;
