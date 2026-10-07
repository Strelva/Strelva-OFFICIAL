-- Disable connected inquiry notice flags first; preserve/export receipts.
begin;
set local lock_timeout = '3s';
-- Preserve immutable provider receipts and closed/ambiguous send purposes.
revoke execute on function public.list_connected_inquiry_owner_notices_not_told(),
  public.record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text),
  public.finish_connected_inquiry_owner_notice(uuid,text,text,timestamptz),
  public.claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text) from service_role;
commit;
