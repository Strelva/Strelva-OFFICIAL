begin;
set local lock_timeout='3s';
-- Disable STRELVA_INQUIRY_RECORDS first. Retain decisions and messages.
revoke execute on function public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamptz,uuid) from service_role;
commit;
