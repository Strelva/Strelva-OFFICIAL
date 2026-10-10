begin;
set local lock_timeout = '3s';
-- Serialize the emptiness check with writers: otherwise a discovery transaction
-- can commit between the count check and DROP, silently deleting valid proof.
do $$
begin
  if to_regclass('public.agent_business_discovery_days') is null
     and to_regclass('public.agent_business_discovery_coverage') is null then
    return;
  end if;
  if to_regclass('public.agent_business_discovery_days') is null
     or to_regclass('public.agent_business_discovery_coverage') is null then
    raise exception 'agent_booking_outcomes_schema_incomplete' using errcode = '55000';
  end if;
  execute 'lock table public.agent_business_discovery_days, public.agent_business_discovery_coverage in access exclusive mode';
end $$;
-- Keep this in a separate statement from LOCK so READ COMMITTED takes a fresh
-- snapshot after any in-flight discovery write commits.
do $$
begin
  if to_regclass('public.agent_business_discovery_days') is null
     and to_regclass('public.agent_business_discovery_coverage') is null then
    return;
  end if;
  if exists (select 1 from public.agent_business_discovery_days)
     or exists (select 1 from public.agent_business_discovery_coverage) then
    raise exception 'agent_booking_outcomes_in_use' using errcode = '55000';
  end if;
end $$;
drop function if exists public.read_agent_booking_outcomes(text, timestamptz, timestamptz);
drop function if exists public.record_agent_business_discovery(text[]);
drop table if exists public.agent_business_discovery_days, public.agent_business_discovery_coverage;
notify pgrst, 'reload schema';
commit;
