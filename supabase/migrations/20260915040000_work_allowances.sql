-- Locally configured subscription-period allowances. These records do not
-- create or change a Stripe subscription, define a price, or pay a contributor.

create table public.work_allowances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payer_id uuid not null references public.users(id) on delete restrict,
  period_start timestamptz not null,
  period_end timestamptz not null,
  spending_cap_cents integer not null check (spending_cap_cents between 0 and 100000000),
  source text not null default 'local_configured' check (source = 'local_configured'),
  status text not null default 'pending_cap_acceptance'
    check (status in ('pending_cap_acceptance', 'active', 'closed')),
  cap_accepted_by uuid references public.users(id) on delete restrict,
  cap_accepted_at timestamptz,
  award_key text not null unique check (award_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  award_digest text not null check (award_digest ~ '^[a-f0-9]{32}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (period_end > period_start and period_end <= period_start + interval '370 days'),
  check ((cap_accepted_by is null) = (cap_accepted_at is null)),
  check ((status = 'pending_cap_acceptance') = (cap_accepted_at is null))
);

create index work_allowances_business_period_idx
  on public.work_allowances (workspace_id, payer_id, period_start, period_end)
  where status <> 'closed';

create table public.work_allowance_reservations (
  id uuid primary key default gen_random_uuid(),
  allowance_id uuid not null references public.work_allowances(id) on delete cascade,
  job_id uuid not null,
  execution_key text not null check (execution_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
  unit_kind text not null check (unit_kind in (
    'completed_document_change', 'completed_tracker_change',
    'completed_investigation', 'completed_application_change'
  )),
  requested_units integer not null check (requested_units between 1 and 1000000),
  reserved_units integer not null check (reserved_units between 0 and requested_units),
  reserved_cap_cents integer not null check (reserved_cap_cents between 0 and 1000000),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  consumed_units integer not null default 0 check (consumed_units >= 0),
  actual_cost_cents integer check (actual_cost_cents between 0 and 1000000),
  cap_cost_cents integer check (cap_cost_cents between 0 and 1000000),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  unique (job_id, execution_key),
  foreign key (job_id, execution_key)
    references public.job_economics_executions(job_id, execution_key) on delete restrict,
  check (
    (status = 'reserved' and consumed_units = 0 and actual_cost_cents is null and cap_cost_cents is null and settled_at is null)
    or (status = 'consumed' and consumed_units = requested_units and actual_cost_cents is not null and cap_cost_cents is not null and settled_at is not null)
    or (status = 'released' and consumed_units = 0 and cap_cost_cents = 0 and settled_at is not null)
  )
);

create index work_allowance_reservations_allowance_idx
  on public.work_allowance_reservations (allowance_id, status, created_at);

create table public.work_allowance_ledger (
  id uuid primary key default gen_random_uuid(),
  allowance_id uuid not null references public.work_allowances(id) on delete cascade,
  event_kind text not null check (event_kind in ('grant', 'contribution_credit', 'consumption')),
  unit_kind text not null check (unit_kind in (
    'completed_document_change', 'completed_tracker_change',
    'completed_investigation', 'completed_application_change'
  )),
  units integer not null check (units between 1 and 1000000),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{32}$'),
  contribution_reference text check (char_length(contribution_reference) between 1 and 256),
  reservation_id uuid references public.work_allowance_reservations(id) on delete restrict,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (allowance_id, idempotency_key),
  check ((event_kind = 'contribution_credit') = (contribution_reference is not null)),
  check ((event_kind = 'consumption') = (reservation_id is not null))
);

create unique index work_allowance_contribution_once_idx
  on public.work_allowance_ledger (contribution_reference)
  where event_kind = 'contribution_credit';
create unique index work_allowance_consumption_once_idx
  on public.work_allowance_ledger (reservation_id)
  where event_kind = 'consumption';

alter table public.work_allowances enable row level security;
alter table public.work_allowance_reservations enable row level security;
alter table public.work_allowance_ledger enable row level security;
revoke all on public.work_allowances, public.work_allowance_reservations,
  public.work_allowance_ledger from public, anon, authenticated;
grant select, insert, update on public.work_allowances,
  public.work_allowance_reservations, public.work_allowance_ledger to service_role;

create or replace function public.work_allowance_assert_identity(
  p_actor_id uuid,
  p_verified_email text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users
    where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null
    for share;
  if not found then raise exception 'work_allowance_identity_denied'; end if;
end;
$$;
revoke all on function public.work_allowance_assert_identity(uuid,text) from public,anon,authenticated;
grant execute on function public.work_allowance_assert_identity(uuid,text) to service_role;

create or replace function public.work_allowance_operator_command(
  p_actor_id uuid,
  p_verified_email text,
  p_command jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_action text;
  v_allowance public.work_allowances%rowtype;
  v_existing public.work_allowance_ledger%rowtype;
  v_workspace_id uuid;
  v_payer_id uuid;
  v_allowance_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_cap bigint;
  v_units bigint;
  v_key text;
  v_unit text;
  v_reference text;
  v_digest text;
  v_grants jsonb;
  v_grant jsonb;
begin
  perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
  perform 1 from public.super_admins where user_id=p_actor_id and revoked_at is null for share;
  if not found then raise exception 'work_allowance_operator_required'; end if;
  if p_command is null or jsonb_typeof(p_command)<>'object' then raise exception 'work_allowance_command_invalid'; end if;
  v_action:=p_command->>'action';

  if v_action='award_period' then
    if exists(select 1 from jsonb_object_keys(p_command) k(name) where k.name not in
      ('action','workspaceId','payerId','periodStart','periodEnd','spendingCapCents','grants','idempotencyKey'))
      or p_command->>'workspaceId' is null or p_command->>'payerId' is null
      or p_command->>'periodStart' is null or p_command->>'periodEnd' is null
      or p_command->>'spendingCapCents' !~ '^[0-9]+$'
      or jsonb_typeof(p_command->'grants')<>'array'
      or jsonb_array_length(p_command->'grants') not between 1 and 4
      or p_command->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then
      raise exception 'work_allowance_command_invalid';
    end if;
    begin
      v_workspace_id:=(p_command->>'workspaceId')::uuid;
      v_payer_id:=(p_command->>'payerId')::uuid;
      v_start:=(p_command->>'periodStart')::timestamptz;
      v_end:=(p_command->>'periodEnd')::timestamptz;
      v_cap:=(p_command->>'spendingCapCents')::bigint;
    exception when others then raise exception 'work_allowance_command_invalid'; end;
    if v_cap not between 0 and 100000000 or v_end<=v_start or v_end>v_start+interval '370 days' then
      raise exception 'work_allowance_command_invalid';
    end if;
    v_key:=p_command->>'idempotencyKey';
    v_grants:=p_command->'grants';
    v_digest:=md5(p_command::text);
    select * into v_allowance from public.work_allowances where award_key=v_key for update;
    if found then
      if v_allowance.award_digest<>v_digest then raise exception 'work_allowance_idempotency_conflict'; end if;
      return v_allowance.id;
    end if;
    perform 1 from public.workspaces where id=v_workspace_id and kind='customer' for share;
    if not found then raise exception 'work_allowance_target_not_found'; end if;
    perform 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=v_payer_id for share;
    if not found then raise exception 'work_allowance_payer_required'; end if;
    for v_grant in select value from jsonb_array_elements(v_grants) loop
      if not (v_grant ? 'unitKind' and v_grant ? 'units')
        or exists(select 1 from jsonb_object_keys(v_grant) as grant_key(name)
          where grant_key.name not in ('unitKind','units'))
        or v_grant->>'unitKind' not in
        ('completed_document_change','completed_tracker_change','completed_investigation','completed_application_change')
        or v_grant->>'units' !~ '^[0-9]+$' then raise exception 'work_allowance_command_invalid'; end if;
      v_units:=(v_grant->>'units')::bigint;
      if v_units not between 1 and 1000000 then raise exception 'work_allowance_command_invalid'; end if;
    end loop;
    if (select count(distinct value->>'unitKind') from jsonb_array_elements(v_grants))<>jsonb_array_length(v_grants) then
      raise exception 'work_allowance_command_invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':'||v_payer_id::text,0));
    if exists(select 1 from public.work_allowances where workspace_id=v_workspace_id and payer_id=v_payer_id
      and status<>'closed' and tstzrange(period_start,period_end,'[)') && tstzrange(v_start,v_end,'[)')) then
      raise exception 'work_allowance_period_overlap';
    end if;
    insert into public.work_allowances(workspace_id,payer_id,period_start,period_end,spending_cap_cents,
      award_key,award_digest,created_by)
    values(v_workspace_id,v_payer_id,v_start,v_end,v_cap::integer,v_key,v_digest,p_actor_id)
    returning * into v_allowance;
    for v_grant in select value from jsonb_array_elements(v_grants) loop
      v_unit:=v_grant->>'unitKind'; v_units:=(v_grant->>'units')::bigint;
      insert into public.work_allowance_ledger(allowance_id,event_kind,unit_kind,units,idempotency_key,
        command_digest,created_by)
      values(v_allowance.id,'grant',v_unit,v_units::integer,'grant:'||v_unit,
        md5(v_unit||':'||v_units::text),p_actor_id);
    end loop;
    return v_allowance.id;
  elsif v_action='award_contribution_credit' then
    if exists(select 1 from jsonb_object_keys(p_command) k(name) where k.name not in
      ('action','allowanceId','contributionReference','unitKind','units','idempotencyKey'))
      or p_command->>'allowanceId' is null
      or p_command->>'contributionReference' is null
      or char_length(p_command->>'contributionReference') not between 1 and 256
      or p_command->>'unitKind' not in
        ('completed_document_change','completed_tracker_change','completed_investigation','completed_application_change')
      or p_command->>'units' !~ '^[0-9]+$'
      or p_command->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' then
      raise exception 'work_allowance_command_invalid';
    end if;
    begin v_allowance_id:=(p_command->>'allowanceId')::uuid; v_units:=(p_command->>'units')::bigint;
    exception when others then raise exception 'work_allowance_command_invalid'; end;
    if v_units not between 1 and 1000000 then raise exception 'work_allowance_command_invalid'; end if;
    select * into v_allowance from public.work_allowances where id=v_allowance_id for update;
    if not found then raise exception 'work_allowance_not_found'; end if;
    if v_allowance.status='closed' or v_allowance.period_end<=clock_timestamp() then raise exception 'work_allowance_invalid_transition'; end if;
    perform 1 from public.workspace_memberships where workspace_id=v_allowance.workspace_id and user_id=v_allowance.payer_id for share;
    if not found then raise exception 'work_allowance_payer_required'; end if;
    v_key:=p_command->>'idempotencyKey'; v_unit:=p_command->>'unitKind';
    v_reference:=p_command->>'contributionReference';
    v_digest:=md5(concat_ws('|',v_unit,v_units::text,v_reference));
    select * into v_existing from public.work_allowance_ledger
      where allowance_id=v_allowance.id and idempotency_key=v_key;
    if found then
      if v_existing.command_digest<>v_digest then raise exception 'work_allowance_idempotency_conflict'; end if;
      return v_allowance.id;
    end if;
    begin
      insert into public.work_allowance_ledger(allowance_id,event_kind,unit_kind,units,idempotency_key,
        command_digest,contribution_reference,created_by)
      values(v_allowance.id,'contribution_credit',v_unit,v_units::integer,v_key,v_digest,v_reference,p_actor_id);
    exception when unique_violation then
      raise exception 'work_allowance_idempotency_conflict';
    end;
    return v_allowance.id;
  else
    raise exception 'work_allowance_command_invalid';
  end if;
end;
$$;
revoke all on function public.work_allowance_operator_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.work_allowance_operator_command(uuid,text,jsonb) to service_role;

create or replace function public.work_allowance_accept_cap(
  p_actor_id uuid,
  p_verified_email text,
  p_allowance_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_allowance public.work_allowances%rowtype;
begin
  perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
  select * into v_allowance from public.work_allowances where id=p_allowance_id for update;
  if not found then raise exception 'work_allowance_not_found'; end if;
  if v_allowance.payer_id<>p_actor_id then raise exception 'work_allowance_payer_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id=v_allowance.workspace_id and user_id=p_actor_id for share;
  if not found then raise exception 'work_allowance_access_denied'; end if;
  if v_allowance.status='pending_cap_acceptance' and v_allowance.period_end>clock_timestamp() then
    update public.work_allowances set status='active',cap_accepted_by=p_actor_id,
      cap_accepted_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_allowance.id;
  elsif v_allowance.status<>'active' then raise exception 'work_allowance_invalid_transition'; end if;
  return v_allowance.id;
end;
$$;
revoke all on function public.work_allowance_accept_cap(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.work_allowance_accept_cap(uuid,text,uuid) to service_role;

create or replace function public.work_allowance_reservation_json(
  p_reservation public.work_allowance_reservations,
  p_disposition text
) returns jsonb language sql stable set search_path=public,pg_temp as $$
select jsonb_build_object(
  'allowanceId',p_reservation.allowance_id,'jobId',p_reservation.job_id,
  'executionKey',p_reservation.execution_key,'unitKind',p_reservation.unit_kind,
  'reservedUnits',p_reservation.reserved_units,'reservedCapCents',p_reservation.reserved_cap_cents,
  'status',p_reservation.status,'consumedUnits',p_reservation.consumed_units,
  'actualCostCents',p_reservation.actual_cost_cents,'capCostCents',p_reservation.cap_cost_cents,
  'disposition',p_disposition
)
$$;
revoke all on function public.work_allowance_reservation_json(public.work_allowance_reservations,text) from public,anon,authenticated;
grant execute on function public.work_allowance_reservation_json(public.work_allowance_reservations,text) to service_role;

create or replace function public.work_allowance_execution_command(
  p_actor_id uuid,
  p_verified_email text,
  p_command jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_action text;
  v_job public.job_economics%rowtype;
  v_execution public.job_economics_executions%rowtype;
  v_allowance public.work_allowances%rowtype;
  v_reservation public.work_allowance_reservations%rowtype;
  v_job_id uuid;
  v_allowance_count integer;
  v_key text;
  v_unit text;
  v_units bigint;
  v_granted bigint;
  v_used bigint;
  v_reserved_units bigint;
  v_cap_used bigint;
  v_cap_reserved bigint;
  v_retry boolean;
begin
  perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
  if p_command is null or jsonb_typeof(p_command)<>'object' then raise exception 'work_allowance_command_invalid'; end if;
  v_action:=p_command->>'action';
  if v_action='reserve' then
    if exists(select 1 from jsonb_object_keys(p_command) k(name) where k.name not in
      ('action','jobId','executionKey','unitKind','units'))
      or p_command->>'jobId' is null
      or p_command->>'executionKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
      or p_command->>'unitKind' not in
        ('completed_document_change','completed_tracker_change','completed_investigation','completed_application_change')
      or p_command->>'units' !~ '^[0-9]+$' then raise exception 'work_allowance_command_invalid'; end if;
    begin v_job_id:=(p_command->>'jobId')::uuid; v_units:=(p_command->>'units')::bigint;
    exception when others then raise exception 'work_allowance_command_invalid'; end;
    if v_units not between 1 and 1000000 then raise exception 'work_allowance_command_invalid'; end if;
    v_key:=p_command->>'executionKey'; v_unit:=p_command->>'unitKind';
    select * into v_reservation from public.work_allowance_reservations
      where job_id=v_job_id and execution_key=v_key for update;
    if found then
      if v_reservation.unit_kind<>v_unit or v_reservation.requested_units<>v_units then
        raise exception 'work_allowance_idempotency_conflict';
      end if;
      return public.work_allowance_reservation_json(v_reservation,
        case when v_reservation.status='reserved' then 'reserved' else v_reservation.status end);
    end if;
    select * into v_job from public.job_economics where id=v_job_id for share;
    if not found or v_job.workspace_id is null then return null; end if;
    perform 1 from public.workspace_memberships where workspace_id=v_job.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'work_allowance_access_denied'; end if;
    perform 1 from public.workspace_memberships where workspace_id=v_job.workspace_id and user_id=v_job.payer_id for share;
    if not found then raise exception 'work_allowance_payer_required'; end if;
    -- The execution row is the stable identity shared by simultaneous retries.
    -- Lock it, then repeat the reservation lookup: a competing transaction may
    -- have inserted the reservation after our first lookup but before this lock.
    select * into v_execution from public.job_economics_executions
      where job_id=v_job.id and execution_key=v_key for update;
    if not found or v_execution.status<>'reserved' then raise exception 'work_allowance_receipt_invalid'; end if;
    select * into v_reservation from public.work_allowance_reservations
      where job_id=v_job_id and execution_key=v_key for update;
    if found then
      if v_reservation.unit_kind<>v_unit or v_reservation.requested_units<>v_units then
        raise exception 'work_allowance_idempotency_conflict';
      end if;
      return public.work_allowance_reservation_json(v_reservation,
        case when v_reservation.status='reserved' then 'reserved' else v_reservation.status end);
    end if;
    select count(*) into v_allowance_count from public.work_allowances a
      where a.workspace_id=v_job.workspace_id and a.payer_id=v_job.payer_id
        and a.status<>'closed' and clock_timestamp()>=a.period_start and clock_timestamp()<a.period_end
        and exists(select 1 from public.work_allowance_ledger l where l.allowance_id=a.id
          and l.unit_kind=v_unit and l.event_kind in ('grant','contribution_credit'));
    if v_allowance_count=0 then return null; end if;
    if v_allowance_count<>1 then raise exception 'work_allowance_ambiguous'; end if;
    select * into v_allowance from public.work_allowances a
      where a.workspace_id=v_job.workspace_id and a.payer_id=v_job.payer_id
        and a.status<>'closed' and clock_timestamp()>=a.period_start and clock_timestamp()<a.period_end
        and exists(select 1 from public.work_allowance_ledger l where l.allowance_id=a.id
          and l.unit_kind=v_unit and l.event_kind in ('grant','contribution_credit')) for update;
    if v_allowance.status<>'active' or v_allowance.cap_accepted_at is null then raise exception 'work_allowance_cap_not_accepted'; end if;
    select coalesce(sum(units),0) into v_granted from public.work_allowance_ledger
      where allowance_id=v_allowance.id and unit_kind=v_unit and event_kind in ('grant','contribution_credit');
    select coalesce(sum(units),0) into v_used from public.work_allowance_ledger
      where allowance_id=v_allowance.id and unit_kind=v_unit and event_kind='consumption';
    select coalesce(sum(reserved_units),0) into v_reserved_units from public.work_allowance_reservations
      where allowance_id=v_allowance.id and unit_kind=v_unit and status='reserved';
    select coalesce(sum(cap_cost_cents),0) into v_cap_used from public.work_allowance_reservations
      where allowance_id=v_allowance.id and status='consumed';
    select coalesce(sum(reserved_cap_cents),0) into v_cap_reserved from public.work_allowance_reservations
      where allowance_id=v_allowance.id and status='reserved';
    v_retry:=v_execution.attribution='strelva_retry';
    if not v_retry and (v_used+v_reserved_units+v_units>v_granted
      or v_cap_used+v_cap_reserved+v_execution.maximum_cents>v_allowance.spending_cap_cents) then
      raise exception 'work_allowance_capacity_exceeded';
    end if;
    insert into public.work_allowance_reservations(allowance_id,job_id,execution_key,unit_kind,
      requested_units,reserved_units,reserved_cap_cents,created_by)
    values(v_allowance.id,v_job.id,v_key,v_unit,v_units::integer,
      case when v_retry then 0 else v_units::integer end,
      case when v_retry then 0 else v_execution.maximum_cents end,p_actor_id)
    returning * into v_reservation;
    return public.work_allowance_reservation_json(v_reservation,'reserved');
  elsif v_action='settle' then
    if exists(select 1 from jsonb_object_keys(p_command) k(name) where k.name not in ('action','jobId','executionKey'))
      or p_command->>'jobId' is null
      or p_command->>'executionKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$' then
      raise exception 'work_allowance_command_invalid';
    end if;
    begin v_job_id:=(p_command->>'jobId')::uuid; exception when others then raise exception 'work_allowance_command_invalid'; end;
    v_key:=p_command->>'executionKey';
    select * into v_reservation from public.work_allowance_reservations
      where job_id=v_job_id and execution_key=v_key for update;
    if not found then return null; end if;
    select * into v_allowance from public.work_allowances where id=v_reservation.allowance_id for update;
    select * into v_job from public.job_economics where id=v_job_id for share;
    perform 1 from public.workspace_memberships where workspace_id=v_job.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'work_allowance_access_denied'; end if;
    select * into v_execution from public.job_economics_executions
      where job_id=v_job_id and execution_key=v_key for share;
    if not found or v_execution.status<>'finished' then raise exception 'work_allowance_receipt_invalid'; end if;
    if v_reservation.status<>'reserved' then
      return public.work_allowance_reservation_json(v_reservation,v_reservation.status);
    end if;
    if v_execution.effect='unknown' or v_execution.amount_cents is null or v_execution.billable_cents is null then
      return public.work_allowance_reservation_json(v_reservation,'held_unknown');
    elsif v_execution.attribution='strelva_retry' or v_execution.effect='none' then
      update public.work_allowance_reservations set status='released',consumed_units=0,
        actual_cost_cents=v_execution.amount_cents,cap_cost_cents=0,settled_at=clock_timestamp()
      where id=v_reservation.id returning * into v_reservation;
      return public.work_allowance_reservation_json(v_reservation,'released');
    elsif v_execution.effect='accepted' then
      update public.work_allowance_reservations set status='consumed',consumed_units=requested_units,
        actual_cost_cents=v_execution.amount_cents,cap_cost_cents=v_execution.billable_cents,
        settled_at=clock_timestamp()
      where id=v_reservation.id returning * into v_reservation;
      insert into public.work_allowance_ledger(allowance_id,event_kind,unit_kind,units,idempotency_key,
        command_digest,reservation_id,created_by)
      values(v_reservation.allowance_id,'consumption',v_reservation.unit_kind,v_reservation.consumed_units,
        'consume:'||v_reservation.id::text,md5(v_reservation.id::text),v_reservation.id,p_actor_id)
      on conflict (allowance_id,idempotency_key) do nothing;
      return public.work_allowance_reservation_json(v_reservation,'consumed');
    end if;
    raise exception 'work_allowance_receipt_invalid';
  else
    raise exception 'work_allowance_command_invalid';
  end if;
end;
$$;
revoke all on function public.work_allowance_execution_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.work_allowance_execution_command(uuid,text,jsonb) to service_role;

create or replace function public.read_work_allowances(
  p_actor_id uuid,
  p_verified_email text,
  p_allowance_id uuid default null,
  p_workspace_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
  if p_allowance_id is null and p_workspace_id is null then raise exception 'work_allowance_command_invalid'; end if;
  if p_allowance_id is not null and not exists(select 1 from public.work_allowances where id=p_allowance_id) then
    raise exception 'work_allowance_not_found';
  end if;
  if p_workspace_id is not null and not exists(select 1 from public.workspaces where id=p_workspace_id) then
    raise exception 'work_allowance_not_found';
  end if;
  if not exists(select 1 from public.super_admins where user_id=p_actor_id and revoked_at is null)
    and exists(select 1 from public.work_allowances a where (p_allowance_id is null or a.id=p_allowance_id)
      and (p_workspace_id is null or a.workspace_id=p_workspace_id)
      and not exists(select 1 from public.workspace_memberships m where m.workspace_id=a.workspace_id and m.user_id=p_actor_id)) then
    raise exception 'work_allowance_access_denied';
  end if;
  select jsonb_build_object('allowances',coalesce(jsonb_agg(item order by item->>'periodStart' desc),'[]'::jsonb)) into v_result
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
  return coalesce(v_result,jsonb_build_object('allowances','[]'::jsonb));
end;
$$;
revoke all on function public.read_work_allowances(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_work_allowances(uuid,text,uuid,uuid) to service_role;
