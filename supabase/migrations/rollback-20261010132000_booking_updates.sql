begin;
set local lock_timeout = '2s';
drop function if exists public.claim_booking_updates(uuid,boolean,boolean,integer), public.finish_booking_update(uuid,text,text,text);
drop table if exists public.business_booking_updates,public.business_booking_update_epoch;
commit;
