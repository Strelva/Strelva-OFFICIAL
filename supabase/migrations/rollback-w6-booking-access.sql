-- Disable agent and message/manage switches before rollback. Kept bookings survive.
begin;
set local lock_timeout = '2s';
drop function if exists public.issue_booking_access(text,text,jsonb), public.hold_agent_booking(text,jsonb,jsonb),
  public.read_native_booking_access(text,text), public.confirm_agent_booking(text,boolean), public.change_native_booking(text,jsonb);
drop table if exists public.business_booking_access;
commit;
