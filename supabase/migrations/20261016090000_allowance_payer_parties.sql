-- Canonical party keys for allowances; payer_id retains the historical signer.
-- No prices, grants, invoices or provider effects are inferred.
create function public.work_payer_can_sign(p_kind text,p_party uuid,p_business uuid,p_signer uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select case when p_kind='agency' then exists(select 1 from public.workspace_memberships m
 join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
 where m.workspace_id=p_party and m.user_id=p_actor and m.role in ('owner','admin'))
else exists(select 1 from public.workspace_memberships m where m.workspace_id=p_business and m.user_id=p_actor
 and (m.role='owner' or m.user_id=p_signer)) end
$$;
revoke all on function public.work_payer_can_sign(text,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create index work_allowances_party_period_idx on public.work_allowances(workspace_id,payer_kind,payer_workspace_id,period_start,period_end);


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
  v_kind text;
  v_party uuid;
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
      ('action','workspaceId','payerId','payerKind','payerWorkspaceId','periodStart','periodEnd','spendingCapCents','grants','idempotencyKey'))
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
      v_kind:=coalesce(p_command->>'payerKind','business');
      v_party:=(p_command->>'payerWorkspaceId')::uuid;
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
    if v_kind not in ('business','agency') or (v_kind='business')<>(v_party is null) then raise exception 'work_allowance_command_invalid'; end if;
    if not public.work_payer_can_sign(v_kind,v_party,v_workspace_id,v_payer_id,v_payer_id) then raise exception 'work_allowance_payer_required'; end if;
    if v_kind='agency' and not exists(select 1 from public.accounts where workspace_id=v_workspace_id and payer_kind='agency' and payer_workspace_id=v_party) then raise exception 'work_allowance_payer_required'; end if;
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
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text||':'||v_kind||':'||coalesce(v_party::text,v_workspace_id::text),0));
    if exists(select 1 from public.work_allowances where workspace_id=v_workspace_id and payer_kind=v_kind and payer_workspace_id is not distinct from v_party
      and status<>'closed' and tstzrange(period_start,period_end,'[)') && tstzrange(v_start,v_end,'[)')) then
      raise exception 'work_allowance_period_overlap';
    end if;
    insert into public.work_allowances(workspace_id,payer_id,payer_kind,payer_workspace_id,period_start,period_end,spending_cap_cents,
      award_key,award_digest,created_by)
    values(v_workspace_id,v_payer_id,v_kind,v_party,v_start,v_end,v_cap::integer,v_key,v_digest,p_actor_id)
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
  if not public.work_payer_can_sign(v_allowance.payer_kind,v_allowance.payer_workspace_id,v_allowance.workspace_id,v_allowance.payer_id,p_actor_id) then raise exception 'work_allowance_payer_required'; end if;
  if v_allowance.status='pending_cap_acceptance' and v_allowance.period_end>clock_timestamp() then
    update public.work_allowances set status='active',cap_accepted_by=p_actor_id,
      cap_accepted_at=clock_timestamp(),updated_at=clock_timestamp() where id=v_allowance.id;
  elsif v_allowance.status<>'active' then raise exception 'work_allowance_invalid_transition'; end if;
  return v_allowance.id;
end;
$$;
revoke all on function public.work_allowance_accept_cap(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.work_allowance_accept_cap(uuid,text,uuid) to service_role;

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
    if not exists(select 1 from public.job_economics j join public.workspace_memberships m on m.workspace_id=j.workspace_id and m.user_id=p_actor_id where j.id=v_job_id) then raise exception 'work_allowance_access_denied'; end if;
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
      where a.workspace_id=v_job.workspace_id and a.payer_kind=v_job.payer_kind and a.payer_workspace_id is not distinct from v_job.payer_workspace_id
        and a.status<>'closed' and clock_timestamp()>=a.period_start and clock_timestamp()<a.period_end
        and exists(select 1 from public.work_allowance_ledger l where l.allowance_id=a.id
          and l.unit_kind=v_unit and l.event_kind in ('grant','contribution_credit'));
    if v_allowance_count=0 then return null; end if;
    if v_allowance_count<>1 then raise exception 'work_allowance_ambiguous'; end if;
    select * into v_allowance from public.work_allowances a
      where a.workspace_id=v_job.workspace_id and a.payer_kind=v_job.payer_kind and a.payer_workspace_id is not distinct from v_job.payer_workspace_id
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

create or replace function public.sync_subscription_allowance_entitlement(
  p_entitlement jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_existing public.work_allowance_subscription_entitlements%rowtype;
  v_allowance public.work_allowances%rowtype;
  v_workspace_id uuid;
  v_payer_id uuid;
  v_kind text;
  v_party uuid;
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
    ('version','eventId','eventCreated','subscriptionId','customerId','workspaceId','payerId','payerKind','payerWorkspaceId',
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
    v_kind:=coalesce(p_entitlement->>'payerKind','business');
    v_party:=(p_entitlement->>'payerWorkspaceId')::uuid;
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
    v_workspace_id::text, v_kind, coalesce(v_party::text,v_workspace_id::text), v_subscription_id,
    coalesce(v_customer_id,''), v_config_key,
    v_period_start::text, v_period_end::text));

  perform 1 from public.workspaces where id=v_workspace_id and kind='customer' for share;
  if not found then raise exception 'subscription_allowance_target_not_found'; end if;
  if v_kind not in ('business','agency') or (v_kind='business')<>(v_party is null) then raise exception 'subscription_allowance_command_invalid'; end if;
  -- Subscription renewal needs a current party authority, not the historical signer.
  if not exists(select 1 from public.workspace_memberships m where public.work_payer_can_sign(v_kind,v_party,v_workspace_id,v_payer_id,m.user_id)) then raise exception 'subscription_allowance_payer_required'; end if;
  if v_status in ('active','trialing') and v_kind='agency' and not exists(select 1 from public.accounts where workspace_id=v_workspace_id and payer_kind='agency' and payer_workspace_id=v_party) then raise exception 'subscription_allowance_payer_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('subscription-allowance:'||v_workspace_id::text||':'||v_subscription_id,0));
  select * into v_existing from public.work_allowance_subscription_entitlements
    where workspace_id=v_workspace_id and stripe_subscription_id=v_subscription_id for update;
  if found then
    if v_existing.last_event_id=v_event_id then
      if v_existing.terms_digest<>v_terms_digest or v_existing.status<>v_status
        or v_existing.payer_kind<>v_kind or v_existing.payer_workspace_id is distinct from v_party
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
        workspace_id,payer_id,payer_kind,payer_workspace_id,period_start,period_end,spending_cap_cents,source,
        status,award_key,award_digest,created_by
      ) values (
        v_workspace_id,v_payer_id,v_kind,v_party,v_period_start,v_period_end,v_cap::integer,'subscription_configured',
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
      workspace_id,payer_id,payer_kind,payer_workspace_id,stripe_subscription_id,stripe_customer_id,config_key,status,
      period_start,period_end,spending_cap_cents,grants,last_event_id,last_event_created,
      terms_digest,allowance_id
    ) values (
      v_workspace_id,v_payer_id,v_kind,v_party,v_subscription_id,v_customer_id,v_config_key,v_status,
      v_period_start,v_period_end,v_cap,v_grants,v_event_id,v_event_created,
      v_terms_digest,v_allowance_id
    ) returning * into v_existing;
  else
    update public.work_allowance_subscription_entitlements set
      payer_id=v_payer_id,payer_kind=v_kind,payer_workspace_id=v_party,stripe_customer_id=v_customer_id,config_key=v_config_key,status=v_status,
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
    and not exists(select 1 from public.workspace_memberships where workspace_id=v_target_workspace and user_id=p_actor_id)
    and not exists(select 1 from public.work_allowances a where a.workspace_id=v_target_workspace and (p_allowance_id is null or a.id=p_allowance_id)
      and a.payer_kind='agency' and public.work_payer_can_sign(a.payer_kind,a.payer_workspace_id,a.workspace_id,a.payer_id,p_actor_id))
    and not exists(select 1 from public.accounts a where a.workspace_id=v_target_workspace and a.payer_kind='agency'
      and public.work_payer_can_sign(a.payer_kind,a.payer_workspace_id,a.workspace_id,null,p_actor_id)) then
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
  where e.workspace_id=v_target_workspace and (exists(select 1 from public.super_admins where user_id=p_actor_id and revoked_at is null)
    or exists(select 1 from public.workspace_memberships where workspace_id=e.workspace_id and user_id=p_actor_id)
    or public.work_payer_can_sign(e.payer_kind,e.payer_workspace_id,e.workspace_id,e.payer_id,p_actor_id))
  order by e.last_event_created desc,e.updated_at desc
  limit 1;
  select jsonb_build_object('allowances',coalesce(jsonb_agg(item order by item->>'periodStart' desc),'[]'::jsonb),
    'subscription',v_subscription) into v_result
  from (
    select jsonb_build_object(
      'id',a.id,'workspaceId',a.workspace_id,'businessName',w.name,'payerId',a.payer_id,'payerKind',a.payer_kind,'payerWorkspaceId',coalesce(a.payer_workspace_id,a.workspace_id),'canAccept',public.work_payer_can_sign(a.payer_kind,a.payer_workspace_id,a.workspace_id,a.payer_id,p_actor_id),
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
        or exists(select 1 from public.workspace_memberships m where m.workspace_id=a.workspace_id and m.user_id=p_actor_id) or public.work_payer_can_sign(a.payer_kind,a.payer_workspace_id,a.workspace_id,a.payer_id,p_actor_id))
  ) records;
  return coalesce(v_result,jsonb_build_object('allowances','[]'::jsonb,'subscription',v_subscription));
end;
$$;
revoke all on function public.read_work_allowances(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_work_allowances(uuid,text,uuid,uuid) to service_role;
