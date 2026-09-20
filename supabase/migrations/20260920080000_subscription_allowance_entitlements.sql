-- Explicit, optional subscription entitlement projection for work allowances.
-- This migration does not infer terms from a Stripe price, plan name, invoice
-- amount, or historical agreement. A signed event may be applied only after a
-- server-side configured entitlement supplies the exact units and operational
-- cap. The existing work allowance and job economics ledgers remain the only
-- usage/settlement authorities.

alter table public.work_allowances drop constraint if exists work_allowances_source_check;
alter table public.work_allowances add constraint work_allowances_source_check
  check (source in ('local_configured', 'subscription_configured'));

-- A provider can end a pending entitlement before its named payer accepts the
-- operational cap. The original local-award check accidentally made `closed`
-- require an acceptance receipt, which would misstate that boundary. Preserve
-- the paired nullability rule while allowing a closed record to retain the
-- fact that it was never accepted.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
      from pg_constraint
     where conrelid = 'public.work_allowances'::regclass
       and contype = 'c'
       and lower(pg_get_constraintdef(oid)) like '%status%pending_cap_acceptance%'
       and (lower(pg_get_constraintdef(oid)) like '%cap_accepted_by%'
         or lower(pg_get_constraintdef(oid)) like '%cap_accepted_at%')
  loop
    execute format('alter table public.work_allowances drop constraint %I', constraint_row.conname);
  end loop;
end $$;
-- PostgreSQL names the second unnamed check in the retained migration
-- `work_allowances_check2` on a fresh cluster. Keep this explicit fallback
-- alongside the definition-based lookup above so cancellation can close an
-- unaccepted period on both fresh and upgraded schemas.
alter table public.work_allowances drop constraint if exists work_allowances_check2;
alter table public.work_allowances drop constraint if exists work_allowances_cap_acceptance_check;
alter table public.work_allowances add constraint work_allowances_cap_acceptance_check
  check (status = 'closed' or ((status = 'pending_cap_acceptance') = (cap_accepted_by is null)));

create table public.work_allowance_subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payer_id uuid not null references public.users(id) on delete restrict,
  stripe_subscription_id text not null check (stripe_subscription_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$'),
  stripe_customer_id text check (stripe_customer_id is null or stripe_customer_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$'),
  config_key text not null check (config_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'),
  status text not null check (status in ('pending','active','trialing','past_due','cancelled','grandfathered','unavailable')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  spending_cap_cents integer check (spending_cap_cents between 0 and 100000000),
  grants jsonb,
  source text not null default 'stripe_subscription' check (source = 'stripe_subscription'),
  last_event_id text not null check (last_event_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$'),
  last_event_created bigint not null check (last_event_created >= 0),
  terms_digest text not null check (terms_digest ~ '^[a-f0-9]{32}$'),
  allowance_id uuid references public.work_allowances(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (period_end > period_start and period_end <= period_start + interval '370 days'),
  check ((grants is null) = (spending_cap_cents is null)),
  check (grants is null or jsonb_typeof(grants) = 'array'),
  unique (workspace_id, stripe_subscription_id)
);

create unique index work_allowance_subscription_event_once_idx
  on public.work_allowance_subscription_entitlements (last_event_id);
create index work_allowance_subscription_workspace_idx
  on public.work_allowance_subscription_entitlements (workspace_id, last_event_created desc);

alter table public.work_allowance_subscription_entitlements enable row level security;
revoke all on public.work_allowance_subscription_entitlements from public, anon, authenticated;
grant select, insert, update on public.work_allowance_subscription_entitlements to service_role;

create or replace function public.subscription_allowance_projection_json(
  p_entitlement public.work_allowance_subscription_entitlements,
  p_disposition text
) returns jsonb language sql stable set search_path=public,pg_temp as $$
select jsonb_build_object(
  'disposition',p_disposition,
  'entitlementId',p_entitlement.id,
  'allowanceId',p_entitlement.allowance_id,
  'status',p_entitlement.status
)
$$;
revoke all on function public.subscription_allowance_projection_json(public.work_allowance_subscription_entitlements,text) from public,anon,authenticated;
grant execute on function public.subscription_allowance_projection_json(public.work_allowance_subscription_entitlements,text) to service_role;

create or replace function public.sync_subscription_allowance_entitlement(
  p_entitlement jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing public.work_allowance_subscription_entitlements%rowtype;
  v_allowance public.work_allowances%rowtype;
  v_workspace_id uuid;
  v_payer_id uuid;
  v_subscription_id text;
  v_customer_id text;
  v_config_key text;
  v_event_id text;
  v_event_created bigint;
  v_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_cap bigint;
  v_grants jsonb;
  v_grant jsonb;
  v_unit text;
  v_units bigint;
  v_award_key text;
  v_terms_digest text;
  v_allowance_id uuid;
  v_disposition text := 'applied';
begin
  if p_entitlement is null or jsonb_typeof(p_entitlement)<>'object' then
    raise exception 'subscription_allowance_command_invalid';
  end if;
  if exists(select 1 from jsonb_object_keys(p_entitlement) k(name) where k.name not in
    ('version','eventId','eventCreated','subscriptionId','customerId','workspaceId','payerId',
     'configKey','status','periodStart','periodEnd','grants','spendingCapCents')) then
    raise exception 'subscription_allowance_command_invalid';
  end if;
  if p_entitlement->>'version' is distinct from '1'
    or p_entitlement->>'eventId' is null
    or p_entitlement->>'eventId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$'
    or p_entitlement->>'subscriptionId' is null
    or p_entitlement->>'subscriptionId' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$'
    or p_entitlement->>'workspaceId' is null
    or p_entitlement->>'payerId' is null
    or p_entitlement->>'configKey' is null
    or p_entitlement->>'configKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$'
    or p_entitlement->>'status' is null
    or p_entitlement->>'status' not in ('pending','active','trialing','past_due','cancelled','grandfathered','unavailable')
    or p_entitlement->>'periodStart' is null
    or p_entitlement->>'periodEnd' is null
    or p_entitlement->>'eventCreated' !~ '^[0-9]+$' then
    raise exception 'subscription_allowance_command_invalid';
  end if;
  begin
    v_workspace_id := (p_entitlement->>'workspaceId')::uuid;
    v_payer_id := (p_entitlement->>'payerId')::uuid;
    v_period_start := (p_entitlement->>'periodStart')::timestamptz;
    v_period_end := (p_entitlement->>'periodEnd')::timestamptz;
    v_event_created := (p_entitlement->>'eventCreated')::bigint;
  exception when others then
    raise exception 'subscription_allowance_command_invalid';
  end;
  if v_period_end<=v_period_start or v_period_end>v_period_start+interval '370 days' then
    raise exception 'subscription_allowance_command_invalid';
  end if;
  v_event_id := p_entitlement->>'eventId';
  v_subscription_id := p_entitlement->>'subscriptionId';
  v_customer_id := nullif(p_entitlement->>'customerId','');
  v_config_key := p_entitlement->>'configKey';
  v_status := p_entitlement->>'status';

  if p_entitlement ? 'spendingCapCents' then
    if jsonb_typeof(p_entitlement->'spendingCapCents') is distinct from 'number'
      or p_entitlement->>'spendingCapCents' !~ '^[0-9]+$' then
      raise exception 'subscription_allowance_command_invalid';
    end if;
    v_cap := (p_entitlement->>'spendingCapCents')::bigint;
    if v_cap not between 0 and 100000000 then raise exception 'subscription_allowance_command_invalid'; end if;
  end if;
  if p_entitlement ? 'grants' then
    if jsonb_typeof(p_entitlement->'grants') is distinct from 'array' or jsonb_array_length(p_entitlement->'grants') not between 1 and 4 then
      raise exception 'subscription_allowance_command_invalid';
    end if;
    v_grants := p_entitlement->'grants';
    for v_grant in select value from jsonb_array_elements(v_grants) loop
      if not (v_grant ? 'unitKind' and v_grant ? 'units')
        or exists(select 1 from jsonb_object_keys(v_grant) k(name) where k.name not in ('unitKind','units'))
        or v_grant->>'unitKind' not in ('completed_document_change','completed_tracker_change','completed_investigation','completed_application_change')
        or v_grant->>'units' !~ '^[0-9]+$' then raise exception 'subscription_allowance_command_invalid'; end if;
      v_units := (v_grant->>'units')::bigint;
      if v_units not between 1 and 1000000 then raise exception 'subscription_allowance_command_invalid'; end if;
    end loop;
    if (select count(distinct value->>'unitKind') from jsonb_array_elements(v_grants))<>jsonb_array_length(v_grants) then
      raise exception 'subscription_allowance_command_invalid';
    end if;
    select jsonb_agg(value order by value->>'unitKind') into v_grants
      from jsonb_array_elements(v_grants);
  end if;
  if ((v_grants is null) <> (v_cap is null)) then raise exception 'subscription_allowance_command_invalid'; end if;
  if v_status in ('active','trialing') and (v_grants is null or v_cap is null) then
    raise exception 'subscription_allowance_terms_required';
  end if;
  -- Bind replay identity to every selected entitlement fact. A provider event
  -- id may not be replayed with the same allowance terms but a different
  -- payer, period, workspace, status, or subscription customer.
  v_terms_digest := md5(concat_ws('|',
    coalesce(v_grants::text,''), coalesce(v_cap::text,''),
    v_workspace_id::text, v_payer_id::text, v_subscription_id,
    coalesce(v_customer_id,''), v_config_key,
    v_period_start::text, v_period_end::text));

  perform 1 from public.workspaces where id=v_workspace_id and kind='customer' for share;
  if not found then raise exception 'subscription_allowance_target_not_found'; end if;
  perform 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=v_payer_id for share;
  if not found then raise exception 'subscription_allowance_payer_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('subscription-allowance:'||v_workspace_id::text||':'||v_subscription_id,0));
  select * into v_existing from public.work_allowance_subscription_entitlements
    where workspace_id=v_workspace_id and stripe_subscription_id=v_subscription_id for update;
  if found then
    if v_existing.last_event_id=v_event_id then
      if v_existing.terms_digest<>v_terms_digest or v_existing.status<>v_status
        or v_existing.payer_id<>v_payer_id
        or v_existing.period_start<>v_period_start
        or v_existing.period_end<>v_period_end
        or v_existing.config_key<>v_config_key
        or v_existing.stripe_customer_id is distinct from v_customer_id then
        raise exception 'subscription_allowance_idempotency_conflict';
      end if;
      return public.subscription_allowance_projection_json(v_existing,'replayed');
    end if;
    if v_event_created<=v_existing.last_event_created then
      return public.subscription_allowance_projection_json(v_existing,'ignored_out_of_order');
    end if;
    if v_existing.allowance_id is not null and v_status in ('past_due','cancelled','grandfathered','unavailable') then
      update public.work_allowances set status='closed',updated_at=clock_timestamp()
        where id=v_existing.allowance_id and status in ('pending_cap_acceptance','active');
    end if;
  end if;

  if v_status in ('active','trialing') then
    v_award_key := 'subscription:'||md5(v_subscription_id)||':'||to_char(v_period_start at time zone 'UTC','YYYYMMDDHH24MISS');
    select * into v_allowance from public.work_allowances where award_key=v_award_key for update;
    if found then
      if v_allowance.source<>'subscription_configured'
        or v_allowance.spending_cap_cents<>v_cap
        or v_allowance.award_digest<>md5(v_terms_digest||':'||v_period_start::text) then
        raise exception 'subscription_allowance_terms_conflict';
      end if;
      -- Status transitions do not change the selected allowance terms. A
      -- past_due/cancelled event may have closed this same-period allowance;
      -- paid recovery reopens that record with its original cap acceptance and
      -- ledger intact instead of creating a second grant or resetting usage.
      if v_allowance.status='closed' then
        update public.work_allowances set
          status=case when v_allowance.cap_accepted_at is null
            then 'pending_cap_acceptance' else 'active' end,
          updated_at=clock_timestamp()
          where id=v_allowance.id
          returning * into v_allowance;
      end if;
      v_allowance_id := v_allowance.id;
    else
      insert into public.work_allowances(
        workspace_id,payer_id,period_start,period_end,spending_cap_cents,source,
        status,award_key,award_digest,created_by
      ) values (
        v_workspace_id,v_payer_id,v_period_start,v_period_end,v_cap::integer,'subscription_configured',
        'pending_cap_acceptance',v_award_key,md5(v_terms_digest||':'||v_period_start::text),v_payer_id
      ) returning * into v_allowance;
      v_allowance_id := v_allowance.id;
      for v_grant in select value from jsonb_array_elements(v_grants) loop
        v_unit := v_grant->>'unitKind'; v_units := (v_grant->>'units')::bigint;
        insert into public.work_allowance_ledger(
          allowance_id,event_kind,unit_kind,units,idempotency_key,command_digest,created_by
        ) values (
          v_allowance.id,'grant',v_unit,v_units::integer,'subscription-grant:'||v_award_key||':'||v_unit,
          md5(v_award_key||':'||v_unit||':'||v_units::text),v_payer_id
        );
      end loop;
    end if;
  else
    v_allowance_id := case when v_existing.id is not null then v_existing.allowance_id else null end;
  end if;

  if v_existing.id is null then
    insert into public.work_allowance_subscription_entitlements(
      workspace_id,payer_id,stripe_subscription_id,stripe_customer_id,config_key,status,
      period_start,period_end,spending_cap_cents,grants,last_event_id,last_event_created,
      terms_digest,allowance_id
    ) values (
      v_workspace_id,v_payer_id,v_subscription_id,v_customer_id,v_config_key,v_status,
      v_period_start,v_period_end,v_cap,v_grants,v_event_id,v_event_created,
      v_terms_digest,v_allowance_id
    ) returning * into v_existing;
  else
    update public.work_allowance_subscription_entitlements set
      payer_id=v_payer_id,stripe_customer_id=v_customer_id,config_key=v_config_key,status=v_status,
      period_start=v_period_start,period_end=v_period_end,spending_cap_cents=v_cap,grants=v_grants,
      last_event_id=v_event_id,last_event_created=v_event_created,terms_digest=v_terms_digest,
      allowance_id=coalesce(v_allowance_id,v_existing.allowance_id),updated_at=clock_timestamp()
      where id=v_existing.id returning * into v_existing;
  end if;
  return public.subscription_allowance_projection_json(v_existing,v_disposition);
exception
  when unique_violation then raise exception 'subscription_allowance_idempotency_conflict';
end;
$$;
revoke all on function public.sync_subscription_allowance_entitlement(jsonb) from public,anon,authenticated;
grant execute on function public.sync_subscription_allowance_entitlement(jsonb) to service_role;

-- Replace the read projection so the same business UI can state whether a
-- subscription entitlement was actually synchronized. Existing allowance
-- records remain unchanged; the added field is null when no projection exists.
create or replace function public.read_work_allowances(
  p_actor_id uuid,
  p_verified_email text,
  p_allowance_id uuid default null,
  p_workspace_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_result jsonb;
  v_subscription jsonb;
  v_target_workspace uuid;
begin
  perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
  if p_allowance_id is null and p_workspace_id is null then raise exception 'work_allowance_command_invalid'; end if;
  if p_allowance_id is not null and not exists(select 1 from public.work_allowances where id=p_allowance_id) then
    raise exception 'work_allowance_not_found';
  end if;
  if p_workspace_id is not null and not exists(select 1 from public.workspaces where id=p_workspace_id) then
    raise exception 'work_allowance_not_found';
  end if;
  select coalesce(p_workspace_id,(select workspace_id from public.work_allowances where id=p_allowance_id)) into v_target_workspace;
  if not exists(select 1 from public.super_admins where user_id=p_actor_id and revoked_at is null)
    and not exists(select 1 from public.workspace_memberships where workspace_id=v_target_workspace and user_id=p_actor_id) then
    raise exception 'work_allowance_access_denied';
  end if;
  if not exists(select 1 from public.super_admins where user_id=p_actor_id and revoked_at is null)
    and exists(select 1 from public.work_allowances a where (p_allowance_id is null or a.id=p_allowance_id)
      and (p_workspace_id is null or a.workspace_id=p_workspace_id)
      and not exists(select 1 from public.workspace_memberships m where m.workspace_id=a.workspace_id and m.user_id=p_actor_id)) then
    raise exception 'work_allowance_access_denied';
  end if;
  select jsonb_build_object(
    'subscriptionId',e.stripe_subscription_id,
    'customerId',e.stripe_customer_id,
    'configKey',e.config_key,
    'status',e.status,
    'periodStart',e.period_start,
    'periodEnd',e.period_end,
    'lastEventCreated',e.last_event_created,
    'synchronizedAt',e.updated_at
  ) into v_subscription
  from public.work_allowance_subscription_entitlements e
  where e.workspace_id=v_target_workspace
  order by e.last_event_created desc,e.updated_at desc
  limit 1;
  select jsonb_build_object('allowances',coalesce(jsonb_agg(item order by item->>'periodStart' desc),'[]'::jsonb),
    'subscription',v_subscription) into v_result
  from (
    select jsonb_build_object(
      'id',a.id,'workspaceId',a.workspace_id,'businessName',w.name,'payerId',a.payer_id,
      'periodStart',a.period_start,'periodEnd',a.period_end,'spendingCapCents',a.spending_cap_cents,
      'reservedCapCents',coalesce((select sum(r.reserved_cap_cents) from public.work_allowance_reservations r where r.allowance_id=a.id and r.status='reserved'),0),
      'consumedCapCents',coalesce((select sum(r.cap_cost_cents) from public.work_allowance_reservations r where r.allowance_id=a.id and r.status='consumed'),0),
      'actualCostCents',coalesce((select sum(r.actual_cost_cents) from public.work_allowance_reservations r where r.allowance_id=a.id and r.actual_cost_cents is not null),0),
      'source',a.source,'status',a.status,'capAcceptedBy',a.cap_accepted_by,'capAcceptedAt',a.cap_accepted_at,
      'createdBy',a.created_by,'createdAt',a.created_at,
      'buckets',coalesce((select jsonb_agg(jsonb_build_object(
        'unitKind',b.unit_kind,'grantedUnits',b.granted,'creditedUnits',b.credited,
        'reservedUnits',b.reserved,'consumedUnits',b.consumed,
        'availableUnits',greatest(0,b.granted+b.credited-b.reserved-b.consumed)
      ) order by b.unit_kind) from (
        select l.unit_kind,
          coalesce(sum(l.units) filter(where l.event_kind='grant'),0)::integer as granted,
          coalesce(sum(l.units) filter(where l.event_kind='contribution_credit'),0)::integer as credited,
          coalesce((select sum(r.reserved_units) from public.work_allowance_reservations r where r.allowance_id=a.id and r.unit_kind=l.unit_kind and r.status='reserved'),0)::integer as reserved,
          coalesce(sum(l.units) filter(where l.event_kind='consumption'),0)::integer as consumed
        from public.work_allowance_ledger l where l.allowance_id=a.id
        group by l.unit_kind
      ) b),'[]'::jsonb)
    ) item
    from public.work_allowances a join public.workspaces w on w.id=a.workspace_id
    where (p_allowance_id is null or a.id=p_allowance_id)
      and (p_workspace_id is null or a.workspace_id=p_workspace_id)
      and (exists(select 1 from public.super_admins where user_id=p_actor_id and revoked_at is null)
        or exists(select 1 from public.workspace_memberships m where m.workspace_id=a.workspace_id and m.user_id=p_actor_id))
  ) records;
  return coalesce(v_result,jsonb_build_object('allowances','[]'::jsonb,'subscription',v_subscription));
end;
$$;
revoke all on function public.read_work_allowances(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_work_allowances(uuid,text,uuid,uuid) to service_role;
