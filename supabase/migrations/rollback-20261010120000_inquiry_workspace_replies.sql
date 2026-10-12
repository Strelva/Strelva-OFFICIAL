-- Roll app switches off first. Preserve messages/receipts; no customer history is deleted.
begin;
set local lock_timeout = '3s';
revoke execute on function public.claim_workspace_inquiry_reply(uuid,uuid,text,uuid,uuid,text,text,text),
  public.finish_workspace_inquiry_reply(uuid,text,text,timestamptz),
  public.record_workspace_inquiry_provider_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text) from service_role;
commit;
