-- Disable inquiry owner notices/review routing before reverting.
begin;
set local lock_timeout='3s';
drop function if exists public.authorize_inquiry_operator_actor(text,uuid);
drop function if exists public.read_inquiry_message_owner_policy(text,text);
drop function if exists public.authorize_inquiry_publication_actor(text,uuid,uuid,text);
drop function if exists public.authorize_inquiry_owner_link_publication(text,text,text,text,uuid,text);
drop function if exists public.authorize_inquiry_owner_link_message_action(text,text,text,text,text);
commit;
