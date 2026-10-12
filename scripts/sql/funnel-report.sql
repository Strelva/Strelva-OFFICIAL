-- Read-only direct-door funnel (ADR 0015) by week: checks run (direct and by
-- agencies), checks saved into a business, businesses created, first thing
-- made live. Run only with explicit authority; it writes nothing.
--   psql "$DATABASE_URL" -f scripts/sql/funnel-report.sql
\set ON_ERROR_STOP 1
begin read only;
select date_trunc('week', at)::date as week,
  count(*) filter (where step = 'check_run' and agency_workspace_id is null) as checks_direct,
  count(*) filter (where step = 'check_run' and agency_workspace_id is not null) as checks_by_agencies,
  count(*) filter (where step = 'check_saved') as checks_saved,
  count(*) filter (where step = 'business_created') as businesses_created,
  count(*) filter (where step = 'first_live') as first_live
from public.funnel_events group by 1 order by 1 desc;
rollback;
