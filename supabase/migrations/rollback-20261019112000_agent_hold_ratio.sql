-- No durable observations or booking writes to undo; removes only this reader.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
drop function public.read_agent_hold_ratio(uuid,text,timestamptz);
drop index public.business_bookings_agent_ratio_idx;
commit;
