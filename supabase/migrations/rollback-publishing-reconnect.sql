begin;
set local lock_timeout = '2s';
drop function if exists public.publishing_google_reconnect(text,uuid,jsonb);
drop table if exists public.publishing_google_outages;
commit;
