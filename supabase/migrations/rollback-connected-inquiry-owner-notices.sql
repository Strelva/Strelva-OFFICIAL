-- Disable connected inquiry notice flags first; preserve/export receipts.
begin;
set local lock_timeout = '3s';
drop function public.list_connected_inquiry_owner_notices_not_told();
drop function public.record_connected_inquiry_owner_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text);
drop function public.finish_connected_inquiry_owner_notice(uuid,text,text,timestamptz);
drop function public.claim_connected_inquiry_owner_notice(uuid,uuid,uuid,text);
drop table public.connected_inquiry_owner_notices;
commit;
