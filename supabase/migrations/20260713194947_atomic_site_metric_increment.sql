-- Page-view and click beacons can arrive concurrently. Increment the daily
-- counter inside Postgres so two requests can never overwrite each other.
create or replace function public.increment_site_metric(
  p_tenant_id text,
  p_metric text,
  p_day date
)
returns integer
language sql
security invoker
set search_path = public
as $$
  insert into public.site_metrics (tenant_id, metric, day, count)
  values (p_tenant_id, p_metric, p_day, 1)
  on conflict (tenant_id, metric, day)
  do update set count = public.site_metrics.count + 1
  returning count;
$$;

-- The control plane calls this through its service-role client. Do not expose
-- a general-purpose counter mutation to browser roles through the Data API.
revoke execute on function public.increment_site_metric(text, text, date) from public;
grant execute on function public.increment_site_metric(text, text, date) to service_role;
