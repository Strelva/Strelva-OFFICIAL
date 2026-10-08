-- #310: read-only, aggregate agent hold confirmation evidence for operators.
-- No admission limit, booking state, token, notification or pause is changed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- A bounded capture window avoids scanning the historical booking ledger.
create index business_bookings_agent_ratio_idx on public.business_bookings(created_at)
  include (id, workspace_id, calendar_key, tenant_stable_id)
  where origin = 'agent' and recorded_via = 'native';

create function public.read_agent_hold_ratio(p_user_id uuid, p_verified_email text, p_now timestamptz)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  perform public.operator_queue_read_operator(p_user_id, p_verified_email);
  if p_now is null or not isfinite(p_now) then raise exception 'booking_invalid'; end if;
  return (
    with mature as (
      select coalesce(b.workspace_id, l.workspace_id, b.calendar_key) as business_id,
        coalesce(b.workspace_id, l.workspace_id) as workspace_id, b.tenant_stable_id,
        greatest(b.created_at + interval '15 minutes', a.confirm_until) as matured_at,
        a.confirmed_at is not null and a.confirmed_at <= p_now as customer_confirmed
      from public.business_bookings b
      left join public.business_booking_access a on a.booking_id = b.id
      -- Conversion need not rewrite historical captures. Resolve an unlinked
      -- capture through the current unique link so one business is one sample.
      left join public.tenant_workspace_links l on b.workspace_id is null and l.tenant_stable_id = b.tenant_stable_id
      where b.origin = 'agent' and b.recorded_via = 'native'
        and b.created_at >= p_now - interval '24 hours'
        and b.created_at <= p_now - interval '15 minutes'
        and (a.confirm_until is null or a.confirm_until <= p_now)
    ), cohorts as (
      select business_id, workspace_id,
        min(tenant_stable_id::text)::uuid as tenant_stable_id,
        count(*) as mature_holds,
        count(*) filter (where customer_confirmed) as customer_confirmed,
        count(*) filter (where not customer_confirmed) as unconfirmed,
        min(matured_at) as first_matured_at,
        max(matured_at) filter (where not customer_confirmed) as latest_unconfirmed_matured_at
      from mature group by business_id, workspace_id
      order by business_id
      -- Never silently truncate. The reader refuses >1000 cohorts as unavailable.
      limit 1001
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'businessId', c.business_id, 'workspaceId', c.workspace_id,
      'tenantId', (select t.id from public.tenants t where t.stable_id = c.tenant_stable_id),
      'matureHolds', c.mature_holds, 'customerConfirmed', c.customer_confirmed,
      'unconfirmed', c.unconfirmed, 'firstMaturedAt', c.first_matured_at,
      'latestUnconfirmedMaturedAt', c.latest_unconfirmed_matured_at
    ) order by c.business_id), '[]'::jsonb) from cohorts c
  );
end $$;
revoke all on function public.read_agent_hold_ratio(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.read_agent_hold_ratio(uuid,text,timestamptz) to service_role;
commit;
