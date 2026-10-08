-- Removes the consent UI command only; preserves owner grants and approvals.
begin;
set local lock_timeout='3s';
drop function public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid);
drop function public.read_website_agency_publish_permission(uuid,uuid,uuid,text);
commit;
