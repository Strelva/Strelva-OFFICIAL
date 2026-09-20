-- Preserve provider-reported sub-cent costs without changing the existing
-- customer-facing cent budget. The cent fields remain the operational
-- projection used by the existing execution and allowance commands; the exact
-- receipt amount and attribution-specific fractional-cent remainders keep that
-- projection lossless across a period. Retry costs use their own accumulator
-- so their exact provider cost never enters customer allowance spend.

alter table public.work_provider_receipts
  add column if not exists billable_usd numeric,
  add column if not exists billable_usd_text text,
  add column if not exists settlement_cents integer;

update public.work_provider_receipts
   set billable_usd = billable_cents::numeric / 100,
       billable_usd_text = (billable_cents::numeric / 100)::text,
       settlement_cents = billable_cents
 where billable_usd is null
    or billable_usd_text is null
    or settlement_cents is null;

create or replace function public.work_provider_receipt_fill_exact_amount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.billable_usd is null then new.billable_usd := new.billable_cents::numeric / 100; end if;
  if new.billable_usd_text is null then new.billable_usd_text := new.billable_usd::text; end if;
  if new.settlement_cents is null then new.settlement_cents := new.billable_cents; end if;
  return new;
end;
$$;

drop trigger if exists work_provider_receipt_fill_exact_amount_trigger on public.work_provider_receipts;
create trigger work_provider_receipt_fill_exact_amount_trigger
before insert on public.work_provider_receipts
for each row execute function public.work_provider_receipt_fill_exact_amount();

alter table public.work_provider_receipts
  alter column billable_usd set not null,
  alter column billable_usd_text set not null,
  alter column settlement_cents set not null;

alter table public.work_provider_receipts
  add constraint work_provider_receipts_billable_usd_check
    check (billable_usd >= 0 and billable_usd <= maximum_cents::numeric / 100),
  add constraint work_provider_receipts_billable_usd_text_check
    check (billable_usd_text = btrim(billable_usd_text)
      and char_length(billable_usd_text) between 1 and 32
      and billable_usd_text ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'),
  add constraint work_provider_receipts_settlement_cents_check
    check (settlement_cents between 0 and maximum_cents);

create table public.work_allowance_subcent_remainders (
  allowance_id uuid primary key references public.work_allowances(id) on delete cascade,
  remainder_cents numeric not null check (remainder_cents >= 0 and remainder_cents < 1),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.work_allowance_subcent_remainders enable row level security;
revoke all on public.work_allowance_subcent_remainders from public, anon, authenticated;
grant select, insert, update on public.work_allowance_subcent_remainders to service_role;

-- Jobs without an allowance still need an exact accumulator. The frozen job
-- budget remains integer-cent based, so this row preserves the fraction that
-- would otherwise be discarded when a trusted receipt settles to zero cents.
create table public.work_provider_subcent_remainders (
  job_id uuid primary key references public.job_economics(id) on delete cascade,
  remainder_cents numeric not null check (remainder_cents >= 0 and remainder_cents < 1),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.work_provider_subcent_remainders enable row level security;
revoke all on public.work_provider_subcent_remainders from public, anon, authenticated;
grant select, insert, update on public.work_provider_subcent_remainders to service_role;

-- Retry work is paid by Strelva and is excluded from customer usage and cap
-- admission. Keep its fractional projection separate from direct customer
-- jobs so a retry remainder can never reduce or consume customer capacity.
create table public.work_retry_subcent_remainders (
  job_id uuid primary key references public.job_economics(id) on delete cascade,
  remainder_cents numeric not null check (remainder_cents >= 0 and remainder_cents < 1),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.work_retry_subcent_remainders enable row level security;
revoke all on public.work_retry_subcent_remainders from public, anon, authenticated;
grant select, insert, update on public.work_retry_subcent_remainders to service_role;

-- The existing integer receipt RPC remains available for exact-cent callers.
-- Decimal callers use this additive seam, which keeps exact evidence and
-- settles only the whole-cent aggregate that the frozen ledger can represent.
create or replace function public.record_work_provider_receipt_decimal(p_receipt jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_job_id uuid;
  v_execution_key text;
  v_provider text;
  v_request_id text;
  v_kind text;
  v_attribution text;
  v_maximum integer;
  v_amount_usd numeric;
  v_amount_cents numeric;
  v_settlement_cents integer;
  v_remainder_cents numeric;
  v_total_cents numeric;
  v_job_remainder_cents numeric;
  v_job_total_cents numeric;
  v_retry_remainder_cents numeric;
  v_retry_total_cents numeric;
  v_reference text;
  v_execution public.job_economics_executions%rowtype;
  v_existing public.work_provider_receipts%rowtype;
  v_reservation public.work_allowance_reservations%rowtype;
  v_result jsonb;
  v_existing_result jsonb;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_receipt) key(name)
      where key.name not in ('provider','requestId','jobId','executionKey','kind',
        'attribution','maximumCents','billableUsd','evidenceReference')
    )
    or p_receipt->>'provider' is null
    or p_receipt->>'requestId' is null
    or p_receipt->>'jobId' is null
    or p_receipt->>'executionKey' is null
    or p_receipt->>'kind' not in ('provider','model','tool','human')
    or p_receipt->>'attribution' not in ('normal','strelva_retry')
    or p_receipt->>'maximumCents' !~ '^[0-9]+$'
    or char_length(p_receipt->>'billableUsd') not between 1 and 32
    or p_receipt->>'billableUsd' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
    or p_receipt->>'evidenceReference' is null then
    raise exception 'provider_receipt_invalid';
  end if;

  begin
    v_job_id := (p_receipt->>'jobId')::uuid;
    v_maximum := (p_receipt->>'maximumCents')::integer;
    v_amount_usd := (p_receipt->>'billableUsd')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'provider_receipt_invalid';
  end;
  v_provider := btrim(p_receipt->>'provider');
  v_request_id := btrim(p_receipt->>'requestId');
  v_execution_key := btrim(p_receipt->>'executionKey');
  v_kind := p_receipt->>'kind';
  v_attribution := p_receipt->>'attribution';
  v_reference := btrim(p_receipt->>'evidenceReference');

  if char_length(v_provider) not between 1 and 96
    or v_provider !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    or char_length(v_request_id) not between 1 and 256
    or char_length(v_execution_key) not between 1 and 100
    or v_execution_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(v_reference) not between 1 and 256
    or v_maximum not between 0 and 1000000
    or v_amount_usd < 0
    or v_amount_usd > v_maximum::numeric / 100 then
    raise exception 'provider_receipt_invalid';
  end if;

  -- A provider request id is immutable. Equivalent numeric spellings are the
  -- same exact amount, while all execution and evidence bindings remain exact.
  select * into v_existing
    from public.work_provider_receipts
   where provider = v_provider and request_id = v_request_id
   for update;
  if found then
    if v_existing.job_id <> v_job_id
      or v_existing.execution_key <> v_execution_key
      or v_existing.kind <> v_kind
      or v_existing.attribution <> v_attribution
      or v_existing.maximum_cents <> v_maximum
      or v_existing.billable_usd <> v_amount_usd
      or v_existing.evidence_reference <> v_reference then
      raise exception 'provider_receipt_mismatch';
    end if;
    v_existing_result := public.record_work_provider_receipt(jsonb_build_object(
      'provider',v_provider,'requestId',v_request_id,'jobId',v_job_id,
      'executionKey',v_execution_key,'kind',v_kind,'attribution',v_attribution,
      'maximumCents',v_maximum,'billableCents',v_existing.billable_cents,
      'evidenceReference',v_reference
    ));
    return v_existing_result;
  end if;

  select * into v_execution
    from public.job_economics_executions
   where job_id = v_job_id and execution_key = v_execution_key
   for update;
  if not found then raise exception 'provider_receipt_target_not_found'; end if;
  if v_execution.kind <> v_kind
    or v_execution.attribution <> v_attribution
    or v_execution.maximum_cents <> v_maximum then
    raise exception 'provider_receipt_mismatch';
  end if;
  if v_execution.status = 'reserved' then raise exception 'provider_receipt_target_not_started'; end if;

  -- Recheck after taking the execution lock so two deliveries for the same
  -- execution cannot both advance the fractional remainder.
  select * into v_existing
    from public.work_provider_receipts
   where job_id = v_job_id and execution_key = v_execution_key
   for update;
  if found then raise exception 'provider_receipt_conflict'; end if;

  v_amount_cents := v_amount_usd * 100;
  v_settlement_cents := floor(v_amount_cents)::integer;
  if v_execution.attribution <> 'strelva_retry' then
    select * into v_reservation
      from public.work_allowance_reservations
     where job_id = v_job_id and execution_key = v_execution_key
     for update;
    if found then
      insert into public.work_allowance_subcent_remainders(allowance_id,remainder_cents)
      values (v_reservation.allowance_id,0)
      on conflict (allowance_id) do nothing;
      select remainder_cents into v_remainder_cents
        from public.work_allowance_subcent_remainders
       where allowance_id = v_reservation.allowance_id
       for update;
      v_total_cents := v_remainder_cents + v_amount_cents;
      v_settlement_cents := floor(v_total_cents)::integer;
      v_remainder_cents := v_total_cents - v_settlement_cents;
      update public.work_allowance_subcent_remainders
         set remainder_cents = v_remainder_cents, updated_at = clock_timestamp()
       where allowance_id = v_reservation.allowance_id;
    else
      -- No allowance reservation means this is a direct job budget. Keep the
      -- fractional remainder at the job boundary so repeated sub-cent
      -- receipts advance the exact aggregate instead of flooring each call.
      insert into public.work_provider_subcent_remainders(job_id,remainder_cents)
      values (v_job_id,0)
      on conflict (job_id) do nothing;
      select remainder_cents into v_job_remainder_cents
        from public.work_provider_subcent_remainders
       where job_id = v_job_id
       for update;
      v_job_total_cents := v_job_remainder_cents + v_amount_cents;
      v_settlement_cents := floor(v_job_total_cents)::integer;
      v_job_remainder_cents := v_job_total_cents - v_settlement_cents;
      update public.work_provider_subcent_remainders
         set remainder_cents = v_job_remainder_cents, updated_at = clock_timestamp()
       where job_id = v_job_id;
    end if;
  else
    -- Retry costs are excluded from customer allowance spend, but their
    -- provider-reported fractional cents still need a lossless integer
    -- projection for the Strelva-paid cost ledger.
    insert into public.work_retry_subcent_remainders(job_id,remainder_cents)
    values (v_job_id,0)
    on conflict (job_id) do nothing;
    select remainder_cents into v_retry_remainder_cents
      from public.work_retry_subcent_remainders
     where job_id = v_job_id
     for update;
    v_retry_total_cents := v_retry_remainder_cents + v_amount_cents;
    v_settlement_cents := floor(v_retry_total_cents)::integer;
    v_retry_remainder_cents := v_retry_total_cents - v_settlement_cents;
    update public.work_retry_subcent_remainders
       set remainder_cents = v_retry_remainder_cents, updated_at = clock_timestamp()
     where job_id = v_job_id;
  end if;

  v_result := public.record_work_provider_receipt(jsonb_build_object(
    'provider',v_provider,'requestId',v_request_id,'jobId',v_job_id,
    'executionKey',v_execution_key,'kind',v_kind,'attribution',v_attribution,
    'maximumCents',v_maximum,'billableCents',v_settlement_cents,
    'evidenceReference',v_reference
  ));
  update public.work_provider_receipts
     set billable_usd = v_amount_usd,
         billable_usd_text = p_receipt->>'billableUsd',
         settlement_cents = v_settlement_cents
   where id = (v_result->>'receiptId')::uuid;
  return v_result;
exception
  when unique_violation then raise exception 'provider_receipt_conflict';
end;
$$;

revoke all on function public.record_work_provider_receipt_decimal(jsonb) from public, anon, authenticated;
grant execute on function public.record_work_provider_receipt_decimal(jsonb) to service_role;

-- Admission includes the exact fractional amount already retained by an
-- allowance. The allowance row and remainder row are locked in this order so
-- concurrent reservations cannot race the precise cap.
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
  v_subcent_used numeric;
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
    -- A trusted receipt can settle the held execution before the separate
    -- allowance projection runs. Count its durable cent projection rather
    -- than charging the maximum a second time while the reservation is still
    -- marked reserved.
    select coalesce(sum(case when receipt.id is null then reservation.reserved_cap_cents
      else receipt.settlement_cents end),0) into v_cap_reserved
      from public.work_allowance_reservations reservation
      left join public.work_provider_receipts receipt
        on receipt.job_id=reservation.job_id and receipt.execution_key=reservation.execution_key
      where reservation.allowance_id=v_allowance.id and reservation.status='reserved';
    v_subcent_used:=0;
    select remainder_cents into v_subcent_used from public.work_allowance_subcent_remainders
      where allowance_id=v_allowance.id for update;
    if not found then v_subcent_used:=0; end if;
    v_retry:=v_execution.attribution='strelva_retry';
    if not v_retry and (v_used+v_reserved_units+v_units>v_granted
      or v_cap_used+v_cap_reserved+v_subcent_used+v_execution.maximum_cents>v_allowance.spending_cap_cents) then
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

-- The direct job budget uses the same exact remainder when no allowance is
-- available, so a later execution cannot reserve the discarded fraction.
create or replace function public.job_economics_execution_command(p_command jsonb,p_actor_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.job_economics%rowtype;
  e public.job_economics_executions%rowtype;
  a text := p_command->>'action';
  k text := p_command->>'executionKey';
  amount integer;
  maximum integer;
  billable integer;
  retained integer;
  charge integer;
  retry_cost integer;
  previous_billable integer;
  previous_retry integer;
  v_effect text := p_command->>'effect';
  v_subcent_remainder numeric;
begin
  if p_command is null or jsonb_typeof(p_command)<>'object' or a is null or a not in ('claim','start','finish','reconcile')
    or k is null or k !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$' then raise exception 'job_economics_command_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(p_command) x where x not in
    ('action','jobId','executionKey','maximumCents','kind','attribution','amountCents','effect','evidenceReference')) then
    raise exception 'job_economics_command_invalid'; end if;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  -- All admission, settlement, cancellation, and legacy ledger commands lock this row first.
  select * into j from public.job_economics where id=(p_command->>'jobId')::uuid for update;
  if not found then raise exception 'job_economics_not_found'; end if;
  select * into e from public.job_economics_executions where job_id=j.id and execution_key=k for update;
  -- A launched action can record its result after access revocation or cancellation.
  -- It can never launch more work on that authority.
  if a='finish' then
    if e.job_id is null or e.created_by<>p_actor_id then raise exception 'job_economics_workspace_denied'; end if;
  elsif a='reconcile' then
    if e.job_id is null then raise exception 'job_economics_not_found'; end if;
    perform 1 from public.workspace_memberships where workspace_id=j.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'job_economics_workspace_denied'; end if;
    -- Only the actor who admitted the exact execution can apply evidence to it.
    -- Product services may additionally require owner/operator authority before
    -- reaching this RPC. A different member cannot clear another actor's hold.
    if e.created_by<>p_actor_id then raise exception 'job_economics_workspace_denied'; end if;
  else
    if j.workspace_id is null then raise exception 'job_economics_target_not_found'; end if;
    perform 1 from public.workspace_memberships where workspace_id=j.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'job_economics_workspace_denied'; end if;
    -- Payer authority is the exact accepted job receipt, not customer-data access.
    if j.accepted_by is distinct from j.payer_id or j.accepted_at is null then raise exception 'job_economics_payer_required'; end if;
  end if;
  if a='claim' then
    if p_command->>'maximumCents' is null or p_command->>'maximumCents' !~ '^[0-9]{1,7}$'
      or p_command->>'kind' is null or p_command->>'kind' not in ('provider','model','tool','human')
      or p_command->>'attribution' is null or p_command->>'attribution' not in ('normal','strelva_retry') then
      raise exception 'job_economics_command_invalid'; end if;
    maximum := (p_command->>'maximumCents')::integer;
    if maximum>1000000 then raise exception 'job_economics_command_invalid'; end if;
    if e.job_id is not null then
      if e.maximum_cents<>maximum or e.kind<>p_command->>'kind' or e.attribution<>p_command->>'attribution'
        or e.created_by<>p_actor_id then raise exception 'job_economics_idempotency_conflict'; end if;
      return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
    end if;
    if j.status not in ('accepted','reserved') then raise exception 'job_economics_invalid_transition'; end if;
    if exists(select 1 from public.job_economics_reservations where job_id=j.id and idempotency_key not like 'runtime:%')
      or exists(select 1 from public.job_economics_usage where job_id=j.id and source='operator_reported') then
      raise exception 'job_economics_runtime_managed'; end if;
    if exists(select 1 from public.job_economics_executions where job_id=j.id and status in ('reserved','running')) then
      raise exception 'job_economics_concurrency_exceeded'; end if;
    charge := case when p_command->>'attribution'='normal' then maximum else 0 end;
    v_subcent_remainder:=0;
    select remainder_cents into v_subcent_remainder from public.work_provider_subcent_remainders
      where job_id=j.id for update;
    if not found then v_subcent_remainder:=0; end if;
    if charge::numeric>j.max_authorized_cents-j.reserved_cents-v_subcent_remainder then
      raise exception 'job_economics_reservation_exceeded';
    end if;
    insert into public.job_economics_executions(job_id,execution_key,maximum_cents,kind,attribution,created_by)
      values(j.id,k,maximum,p_command->>'kind',p_command->>'attribution',p_actor_id) returning * into e;
    insert into public.job_economics_reservations(job_id,idempotency_key,amount_cents,command_digest,created_by)
      values(j.id,'runtime:'||k,charge,md5(concat_ws('|','runtime',k,charge)),p_actor_id);
    update public.job_economics set reserved_cents=reserved_cents+charge,status='reserved',updated_at=clock_timestamp() where id=j.id;
    return jsonb_build_object('claimed',true,'execution',to_jsonb(e));
  elsif a='start' then
    if e.job_id is null or e.created_by<>p_actor_id or e.status<>'reserved' or j.status not in ('accepted','reserved') then
      raise exception 'job_economics_invalid_transition'; end if;
    update public.job_economics_executions set status='running',started_at=clock_timestamp()
      where job_id=j.id and execution_key=k returning * into e;
  else
    if v_effect is null or v_effect not in ('accepted','none','unknown') or not (p_command ? 'amountCents') then raise exception 'job_economics_command_invalid'; end if;
    if jsonb_typeof(p_command->'amountCents')='null' then amount:=null;
    elsif jsonb_typeof(p_command->'amountCents')='number' and p_command->>'amountCents' ~ '^[0-9]{1,7}$' then amount:=(p_command->>'amountCents')::integer;
    else raise exception 'job_economics_command_invalid'; end if;
    if amount>1000000 then raise exception 'job_economics_command_invalid'; end if;
    if a='reconcile' and (v_effect='unknown' or amount is null
      or p_command->>'evidenceReference' is null
      or char_length(p_command->>'evidenceReference') not between 1 and 256) then
      raise exception 'job_economics_command_invalid'; end if;
    if a='reconcile' and (p_command->>'maximumCents' is null
      or p_command->>'maximumCents' !~ '^[0-9]{1,7}$'
      or (p_command->>'maximumCents')::integer<>e.maximum_cents
      or p_command->>'kind' is distinct from e.kind
      or p_command->>'attribution' is distinct from e.attribution) then
      raise exception 'job_economics_idempotency_conflict'; end if;
    if e.status='finished' and (a<>'reconcile' or (e.amount_cents is not null and e.effect<>'unknown')) then
      if e.effect<>v_effect or e.amount_cents is distinct from amount
        or (a='reconcile' and e.reconciliation_reference is distinct from p_command->>'evidenceReference') then raise exception 'job_economics_idempotency_conflict'; end if;
      return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
    end if;
    if a='reconcile' and e.amount_cents is not null and e.amount_cents<>amount then raise exception 'job_economics_idempotency_conflict'; end if;
    if e.status='reserved' and (v_effect<>'none' or amount is distinct from 0) then raise exception 'job_economics_invalid_transition'; end if;
    billable := case when amount is null then null when e.attribution='strelva_retry' then 0 else least(amount,e.maximum_cents) end;
    retained := case when e.attribution='strelva_retry' then 0 else coalesce(billable,e.maximum_cents) end;
    charge := case when e.attribution='strelva_retry' then 0 when e.status='finished' then coalesce(e.billable_cents,e.maximum_cents) else e.maximum_cents end;
    previous_billable := coalesce(e.billable_cents,0);
    previous_retry := case when e.attribution='strelva_retry' then coalesce(e.amount_cents,0) else 0 end;
    retry_cost := case when e.attribution='strelva_retry' then coalesce(amount,0) else 0 end;
    update public.job_economics_executions set status='finished',effect=v_effect,
      amount_cents=amount,billable_cents=billable,finished_at=clock_timestamp(),
      reconciliation_reference=case when a='reconcile' then p_command->>'evidenceReference' else reconciliation_reference end
      where job_id=j.id and execution_key=k returning * into e;
    insert into public.job_economics_usage(job_id,idempotency_key,kind,attribution,amount_cents,source,command_digest,recorded_by)
      values(j.id,'runtime:'||k,e.kind,e.attribution,case when e.attribution='strelva_retry' then amount else billable end,
        'runtime_reported',md5(concat_ws('|',k,v_effect,coalesce(amount::text,'unknown'))),p_actor_id)
      on conflict (job_id,idempotency_key) do update set amount_cents=excluded.amount_cents,
        command_digest=excluded.command_digest,recorded_by=excluded.recorded_by
        where a='reconcile' and public.job_economics_usage.amount_cents is null;
    update public.job_economics set reserved_cents=reserved_cents-charge+retained,
      used_cents=used_cents+coalesce(billable,0)-previous_billable,strelva_retry_cents=strelva_retry_cents+retry_cost-previous_retry,updated_at=clock_timestamp()
      where id=j.id;
  end if;
  return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
end;
$$;
revoke all on function public.job_economics_execution_command(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.job_economics_execution_command(jsonb,uuid,text) to service_role;
