begin;
set local lock_timeout = '3s';
-- Turn the new entry and booking Make real channel off first. Accepted grants
-- and their immutable proposal receipts remain for recovery and audit.
drop function if exists public.publish_ask_booking_service_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text,jsonb,jsonb,uuid,timestamptz);
commit;
