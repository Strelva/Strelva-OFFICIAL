-- Read-only cost per active business (ADR 0015 pricing model, "the test that
-- sets the numbers"). Run against a database only with explicit authority;
-- it reads model_call_log and writes nothing. Hosting cost is not in this
-- table and stays a separate input.
--   psql "$DATABASE_URL" -v days=14 -f scripts/sql/cost-per-business-report.sql
\set ON_ERROR_STOP 1
begin read only;
with window_calls as (
  select workspace_id, date_trunc('day', called_at) as day, purpose, cost_usd, cost_source
  from public.model_call_log
  where called_at >= clock_timestamp() - make_interval(days => :days) and workspace_id is not null
), per_business as (
  select workspace_id,
    count(*) as calls,
    count(distinct day) as active_days,
    coalesce(sum(cost_usd), 0) as known_usd,
    count(*) filter (where cost_source = 'unknown') as unknown_cost_calls
  from window_calls group by workspace_id
)
select
  count(*) as active_businesses,
  round(percentile_cont(0.5) within group (order by known_usd * 30.0 / :days)::numeric, 4) as median_monthly_usd,
  round(percentile_cont(0.75) within group (order by known_usd * 30.0 / :days)::numeric, 4) as p75_monthly_usd,
  round(percentile_cont(0.9) within group (order by known_usd * 30.0 / :days)::numeric, 4) as p90_monthly_usd,
  sum(unknown_cost_calls) as calls_with_unknown_cost
from per_business;
select purpose, count(*) as calls, round(coalesce(sum(cost_usd), 0)::numeric, 4) as known_usd
from public.model_call_log
where called_at >= clock_timestamp() - make_interval(days => :days)
group by purpose order by known_usd desc;
rollback;
