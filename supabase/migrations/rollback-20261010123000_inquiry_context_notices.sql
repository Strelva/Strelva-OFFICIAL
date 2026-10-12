-- Rollback only this wave's read functions; preserves every inquiry/event.
begin;
set local lock_timeout = '3s';
drop function if exists public.authorize_inquiry_owner_notice_repair(text,text,uuid,text);
drop function if exists public.list_inquiry_owner_notices_not_told(text[]);
drop function if exists public.read_inquiry_business_context(text);
commit;
