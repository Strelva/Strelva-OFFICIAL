-- Roll back 20261023144000: drop the funnel events. Measurement only; nothing
-- else reads these rows.
begin;
drop function public.record_funnel_event(text, text, uuid, uuid);
drop table public.funnel_events;
commit;
