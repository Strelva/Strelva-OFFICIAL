-- Catalog reporting instrumentation, never a new send. Off by default.
-- New tables only; no rewrite or change to existing cron schedules/recipients.
set local lock_timeout = '3s';

-- Append this stream's keys to the current list; never restate other streams' keys (#253).
do $migration$
declare previous text[];
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous from unnest(previous || array['catalog_reports']) key;
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end;
$migration$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;

create table public.catalog_report_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly', 'hosted_monthly')),
  period text not null check (char_length(period) between 1 and 30),
  status text not null check (status in ('accepted', 'suppressed', 'failed')),
  recipient text check (recipient is null or char_length(recipient) between 3 and 254),
  reason text check (reason is null or char_length(reason) <= 500),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 300),
  created_at timestamptz not null default clock_timestamp(),
  check (status <> 'accepted' or recipient is not null)
);
create index catalog_report_receipts_workspace_time_idx on public.catalog_report_receipts(workspace_id, created_at desc);
alter table public.catalog_report_receipts enable row level security;
revoke all on public.catalog_report_receipts from public, anon, authenticated, service_role;

create table public.catalog_search_connections (
  tenant_stable_id uuid primary key references public.tenants(stable_id) on delete cascade,
  status text not null check (status in ('available', 'unreachable')),
  checked_at timestamptz not null,
  unreachable_since timestamptz,
  clicks bigint check (clicks is null or clicks >= 0),
  impressions bigint check (impressions is null or impressions >= 0),
  check ((status = 'unreachable') = (unreachable_since is not null)),
  check ((status = 'available') = (clicks is not null and impressions is not null))
);
alter table public.catalog_search_connections enable row level security;
revoke all on public.catalog_search_connections from public, anon, authenticated, service_role;

create function public.record_catalog_report_receipt(p_tenant_id text, p_kind text, p_period text,
  p_status text, p_recipient text, p_reason text, p_provider_message_id text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare tenant uuid; business uuid;
begin
  select t.stable_id, l.workspace_id into tenant, business
    from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id where t.id = p_tenant_id;
  if business is null then return false; end if;
  insert into public.catalog_report_receipts(workspace_id, tenant_stable_id, kind, period, status, recipient, reason, provider_message_id)
    values (business, tenant, p_kind, p_period, p_status, lower(btrim(p_recipient)), p_reason, p_provider_message_id);
  return true;
end;
$$;

create function public.read_catalog_report_receipts(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'workspace_access_denied';
  end if;
  return coalesce((select jsonb_agg(row order by row->>'at' desc) from (
    select jsonb_build_object('id', r.id, 'workspaceId', r.workspace_id, 'tenantId', t.id, 'kind', r.kind,
      'period', r.period, 'status', r.status, 'recipient', r.recipient, 'reason', r.reason,
      'providerMessageId', r.provider_message_id, 'at', r.created_at) as row
      from public.catalog_report_receipts r join public.tenants t on t.stable_id = r.tenant_stable_id
      where r.workspace_id = p_workspace_id and r.created_at >= coalesce(p_since, clock_timestamp() - interval '7 days')
      order by r.created_at desc limit 100
  ) rows), '[]'::jsonb);
end;
$$;

create function public.record_catalog_search_connection(p_tenant_id text, p_status text, p_clicks bigint, p_impressions bigint) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare tenant uuid; checked timestamptz := clock_timestamp();
begin
  select stable_id into tenant from public.tenants where id = p_tenant_id;
  if tenant is null then return false; end if;
  insert into public.catalog_search_connections(tenant_stable_id, status, checked_at, unreachable_since, clicks, impressions)
    values (tenant, p_status, checked, case when p_status = 'unreachable' then checked end,
      case when p_status = 'available' then p_clicks end, case when p_status = 'available' then p_impressions end)
    on conflict (tenant_stable_id) do update set status = excluded.status, checked_at = excluded.checked_at,
      unreachable_since = case when excluded.status = 'unreachable' then coalesce(catalog_search_connections.unreachable_since, excluded.unreachable_since) end,
      clicks = excluded.clicks, impressions = excluded.impressions;
  return true;
end;
$$;

create function public.read_catalog_search_connection(p_tenant_id text, p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('status', s.status, 'checkedAt', s.checked_at, 'unreachableSince', s.unreachable_since,
    'clicks', s.clicks, 'impressions', s.impressions)
    from public.catalog_search_connections s join public.tenants t on t.stable_id = s.tenant_stable_id
    join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    where t.id = p_tenant_id and l.workspace_id = p_workspace_id
$$;

create function public.read_catalog_report_failures(p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.needs_you_operator_id(p_user_id, p_verified_email) is null then raise exception 'workspace_access_denied'; end if;
  -- Latest outcome per tenant: a later success resolves the queue item.
  return coalesce((select jsonb_agg(row) from (
    select jsonb_build_object('id', latest.id, 'workspaceId', latest.workspace_id, 'tenantId', t.id,
      'at', latest.created_at, 'reason', latest.reason) as row from (
      select distinct on (tenant_stable_id) * from public.catalog_report_receipts order by tenant_stable_id, created_at desc, id
    ) latest join public.tenants t on t.stable_id = latest.tenant_stable_id
    where latest.reason in ('missing_owner_email', 'owner_not_accepted') or latest.status = 'failed'
    order by latest.created_at desc limit 100
  ) rows), '[]'::jsonb);
end;
$$;

revoke all on function public.record_catalog_report_receipt(text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.read_catalog_report_receipts(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.record_catalog_search_connection(text,text,bigint,bigint) from public, anon, authenticated;
revoke all on function public.read_catalog_search_connection(text,uuid) from public, anon, authenticated;
revoke all on function public.read_catalog_report_failures(uuid,text) from public, anon, authenticated;
grant execute on function public.record_catalog_report_receipt(text,text,text,text,text,text,text) to service_role;
grant execute on function public.read_catalog_report_receipts(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.record_catalog_search_connection(text,text,bigint,bigint) to service_role;
grant execute on function public.read_catalog_search_connection(text,uuid) to service_role;
grant execute on function public.read_catalog_report_failures(uuid,text) to service_role;
