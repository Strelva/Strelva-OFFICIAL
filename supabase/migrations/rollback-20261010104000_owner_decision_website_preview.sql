begin;
set local lock_timeout = '3s';
drop function if exists public.read_owner_decision_website_preview(uuid,uuid,text,text);
commit;
