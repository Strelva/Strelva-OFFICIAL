-- Server-side aggregation for site_metrics reads (Deep Audit #2, #4).
--
-- The dashboard read path scanned every (day, count) row for a tenant and summed
-- client-side — an unbounded scan that silently truncates at PostgREST's 1,000-row
-- default cap, so a busy tenant's all-time totals go quietly WRONG once it crosses
-- that. This function does the sum + window buckets in SQL: one row per metric, so
-- there is no row cap and one round-trip replaces the per-metric scans.
--
-- Windows match the previous client logic exactly:
--   today  = day = p_today
--   last7  = day in (p_today-6 .. p_today)        (this week, inclusive of today)
--   prev7  = day in (p_today-13 .. p_today-7)      (the week before that)
-- security invoker (matches increment_site_metric); the control-plane reads via a
-- service-role client that bypasses RLS, so it sees every row.
create or replace function public.site_metric_summary(
  p_tenant_id text,
  p_today date
)
returns table(metric text, total bigint, today bigint, last7 bigint, prev7 bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.metric,
    sum(m.count)::bigint,
    coalesce(sum(m.count) filter (where m.day = p_today), 0)::bigint,
    coalesce(sum(m.count) filter (where m.day > p_today - 7 and m.day <= p_today), 0)::bigint,
    coalesce(sum(m.count) filter (where m.day > p_today - 14 and m.day <= p_today - 7), 0)::bigint
  from public.site_metrics m
  where m.tenant_id = p_tenant_id
  group by m.metric;
$$;
