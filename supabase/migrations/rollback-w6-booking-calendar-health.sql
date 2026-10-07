-- Prepared rollback only. Retains no booking changes; removes health audit.
begin;
set local lock_timeout='2s';
drop function if exists public.finish_booking_calendar_health(uuid,uuid,text,text,text);
drop function if exists public.claim_booking_calendar_health(uuid,uuid,text,date);
drop function if exists public.sync_booking_calendar_health(uuid);
drop table if exists public.booking_calendar_health_actions;
commit;
