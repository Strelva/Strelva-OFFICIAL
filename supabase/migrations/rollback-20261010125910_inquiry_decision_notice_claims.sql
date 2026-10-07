-- Roll back only after disabling the inquiry owner-notice callers.
begin;
set local lock_timeout = '3s';
-- Provider events reference these claims. Retain both, including unknown sends,
-- so disabling callers never erases acceptance or reopens a notice purpose.
revoke execute on function public.authorize_inquiry_owner_link_decision(text,text,text,text),
  public.finish_inquiry_decision_notice(uuid,uuid,text,text,timestamptz,text),
  public.claim_inquiry_decision_notice(uuid,uuid,text,text) from service_role;
commit;
