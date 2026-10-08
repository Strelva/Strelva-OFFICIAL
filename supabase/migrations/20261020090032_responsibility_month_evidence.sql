-- #299: one immutable evidence snapshot for a completed UTC month. This is
-- observed responsibility history, never billable units or retrospective grants.
begin;
set local lock_timeout='3s';
create table public.responsibility_meter_months (
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  month date not null check(extract(day from month)=1),
  captured_at timestamptz not null default clock_timestamp(),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  primary key(business_workspace_id,month)
);
alter table public.responsibility_meter_months enable row level security;
revoke all on public.responsibility_meter_months from public,anon,authenticated,service_role;
create trigger responsibility_month_immutable before update or delete on public.responsibility_meter_months
  for each row execute function public.responsibility_immutable();

alter function public.snapshot_responsibility_meter(uuid,uuid,text,date)
  rename to snapshot_responsibility_meter_preview_v1;
revoke all on function public.snapshot_responsibility_meter_preview_v1(uuid,uuid,text,date)
  from public,anon,authenticated,service_role;

create function public.snapshot_responsibility_meter(p_business_id uuid,p_user_id uuid,p_verified_email text,p_month date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare captured timestamptz:=clock_timestamp(); current_month date; provider uuid;
  existing jsonb; observations jsonb; snapshot jsonb; first_observed timestamptz; last_observed timestamptz;
  period_from timestamptz; period_to timestamptz; observation_count integer;
begin
  current_month:=date_trunc('month',captured at time zone 'UTC')::date;
  if p_month is null or extract(day from p_month)<>1 or p_month>current_month then raise exception 'responsibility_meter_month_invalid'; end if;
  if p_month=current_month then
    return public.snapshot_responsibility_meter_preview_v1(p_business_id,p_user_id,p_verified_email,p_month);
  end if;
  -- Keep the existing verified business-member / assigned-provider contract.
  -- Lock its live premises: deletion/demotion/disconnect must serialize with
  -- historical snapshot admission and replay, rather than authorize stale data.
  perform 1 from public.users where id=p_user_id for share;
  perform 1 from public.workspaces where id=p_business_id for share;
  perform 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id for share;
  perform 1 from public.workspace_providers where customer_workspace_id=p_business_id and status='active' for share;
  perform 1 from public.provider_seats where customer_workspace_id=p_business_id for share;
  perform 1 from public.agency_client_staff where customer_workspace_id=p_business_id and user_id=p_user_id for share;
  perform 1 from public.workspace_memberships where user_id=p_user_id and workspace_id in
    (select agency_workspace_id from public.agency_client_staff where customer_workspace_id=p_business_id and user_id=p_user_id) for share;
  select provider_workspace_id into provider from public.workspace_providers where customer_workspace_id=p_business_id and status='active';
  if provider is not null then
    perform 1 from public.workspaces where id=provider for share;
    perform pg_advisory_xact_lock_shared(hashtextextended('agency-verification:'||provider::text,0));
  end if;
  provider:=public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':responsibility-meter:'||p_month::text,0));
  select m.snapshot into existing from public.responsibility_meter_months m
    where m.business_workspace_id=p_business_id and m.month=p_month;
  if found then return existing; end if;
  period_from:=p_month::timestamp at time zone 'UTC';
  period_to:=(p_month+interval '1 month')::timestamp at time zone 'UTC';
  -- Only already immutable observations from this month enter its history.
  -- Current standing policies, offerings, payer or provider are never used to
  -- backfill a past month. Invalid source identity/boundaries fail closed.
  if exists(select 1 from public.responsibility_meter_periods m where m.business_workspace_id=p_business_id and m.month=p_month and (
    m.captured_at<period_from or m.captured_at>=period_to or m.capture_day<>(m.captured_at at time zone 'UTC')::date
    or m.snapshot->>'businessId' is distinct from p_business_id::text or m.snapshot->>'month' is distinct from to_char(p_month,'YYYY-MM')
    or public.inquiry_safe_timestamp(m.snapshot->>'capturedAt') is distinct from m.captured_at
    or m.snapshot->>'stage' is distinct from 'preview' or m.snapshot->>'priced' is distinct from 'false'
    or m.snapshot->>'stripeExportEnabled' is distinct from 'false'
    or jsonb_typeof(m.snapshot->'standingResponsibilities') is distinct from 'array'
    or jsonb_typeof(m.snapshot->'acceptedOfferings') is distinct from 'array'
    or public.inquiry_safe_timestamp(m.snapshot->'slaEvidence'->>'from') is distinct from period_from
    or public.inquiry_safe_timestamp(m.snapshot->'slaEvidence'->>'to') is distinct from m.captured_at
  )) then raise exception 'responsibility_meter_source_evidence_invalid'; end if;
  select count(*),min(m.captured_at),max(m.captured_at),coalesce(jsonb_agg(jsonb_build_object(
    'observationId',m.id,'capturedAt',m.captured_at,'captureDay',m.capture_day,
    'evidence','responsibility_meter_period:'||m.id,
    'snapshotSha256',encode(sha256(convert_to(m.snapshot::text,'UTF8')),'hex'),'snapshot',m.snapshot)
    order by m.captured_at,m.id),'[]'::jsonb)
    into observation_count,first_observed,last_observed,observations from public.responsibility_meter_periods m
    where m.business_workspace_id=p_business_id and m.month=p_month;
  snapshot:=jsonb_build_object('version',1,'stage','monthly_snapshot','businessId',p_business_id,'month',to_char(p_month,'YYYY-MM'),
    'capturedAt',captured,'period',jsonb_build_object('from',period_from,'to',period_to,'endExclusive',true),
    'measurement','immutable_responsibility_observations_in_month',
    'availability',case when observation_count=0 then 'unavailable' else 'partial' end,
    'coverage',jsonb_build_object('observationCount',observation_count,'firstObservedAt',first_observed,'lastObservedAt',last_observed,
      'completePeriod',false,'gapsKnown',false),
    'inventoryAsOf',last_observed,
    'standingResponsibilities',case when observation_count=0 then null else observations->(observation_count-1)->'snapshot'->'standingResponsibilities' end,
    'acceptedOfferings',case when observation_count=0 then null else observations->(observation_count-1)->'snapshot'->'acceptedOfferings' end,
    'payerParty',case when observation_count=0 then null else observations->(observation_count-1)->'snapshot'->'payerParty' end,
    'recordedSlaEvidence',case when observation_count=0 then null else observations->(observation_count-1)->'snapshot'->'slaEvidence' end,
    'observations',observations,
    'slaEvidence',jsonb_build_object('status','unavailable','from',period_from,'to',period_to,
      'reason','Full-period outcomes and accepted targets are not reconstructed from daily captures. Recorded cohorts remain attached to each observation.'),
    'responsibilityStateAtPeriodEnd','unavailable','billableQuantity',null,'priced',false,'stripeExportEnabled',false);
  insert into public.responsibility_meter_months(business_workspace_id,month,captured_at,snapshot)
    values(p_business_id,p_month,captured,snapshot);
  return snapshot;
end $$;
revoke all on function public.snapshot_responsibility_meter(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.snapshot_responsibility_meter(uuid,uuid,text,date) to service_role;

-- Statement-scoped read: no receipt write or row/advisory lock in a genuine
-- READ ONLY transaction. Current actor qualification is rechecked on each read.
create function public.read_responsibility_month_evidence(p_business_id uuid,p_user_id uuid,p_verified_email text,p_month date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_month is null or extract(day from p_month)<>1 or p_month>=date_trunc('month',now() at time zone 'UTC')::date then
    raise exception 'responsibility_meter_month_invalid';
  end if;
  perform public.responsibility_assert_actor(p_business_id,p_user_id,p_verified_email);
  return (select snapshot from public.responsibility_meter_months where business_workspace_id=p_business_id and month=p_month);
end $$;
revoke all on function public.read_responsibility_month_evidence(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.read_responsibility_month_evidence(uuid,uuid,text,date) to service_role;
notify pgrst,'reload schema';
commit;
