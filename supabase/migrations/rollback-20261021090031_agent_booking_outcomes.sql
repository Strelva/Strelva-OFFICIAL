begin;
set local lock_timeout = '3s';
drop function if exists public.read_agent_booking_outcomes(text, timestamptz, timestamptz);
drop function if exists public.record_agent_business_discovery(text[]);
drop table if exists public.agent_business_discovery_days, public.agent_business_discovery_coverage;
notify pgrst, 'reload schema';
commit;
