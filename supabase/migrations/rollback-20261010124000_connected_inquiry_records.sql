-- First deploy with STRELVA_INQUIRY_RECORDS unset/0. Evidence and shared
-- source-aware review functions remain; no connected leads/events are deleted.
begin;
set local lock_timeout = '3s';
drop function if exists public.record_connected_site_inquiry_v2(text,text,jsonb);
drop function if exists public.record_connected_site_spam_v2(text,text,text,jsonb,text,timestamptz);
drop function if exists public.read_connected_site_inquiries_v2(uuid,uuid,text,integer);
commit;
