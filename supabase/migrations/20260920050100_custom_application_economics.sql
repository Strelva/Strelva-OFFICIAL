-- Allow the bounded custom-application lifecycle to use the shared local
-- work-economics ledger. This remains local accounting and does not charge a
-- provider or create a public commercial offering.

alter table public.job_economics drop constraint if exists job_economics_product_id_check;
alter table public.job_economics drop constraint if exists job_economics_resource_kind_check;
alter table public.job_economics drop constraint if exists job_economics_native_pair_check;

alter table public.job_economics add constraint job_economics_product_id_check
  check (product_id in ('tracker','ai_visibility','inquiry','operations','work_plans','custom-applications'));
alter table public.job_economics add constraint job_economics_resource_kind_check
  check (resource_kind in ('tracker','private_ai_visibility_work','ai_visibility_assessment','inquiry_capability','responsibility','plan','custom-application'));
alter table public.job_economics add constraint job_economics_native_pair_check check (
  (product_id='tracker' and resource_kind='tracker' and workspace_id is not null)
  or (product_id='ai_visibility' and resource_kind in ('private_ai_visibility_work','ai_visibility_assessment') and workspace_id is not null)
  or (product_id='operations' and resource_kind='responsibility' and workspace_id is not null)
  or (product_id='work_plans' and resource_kind='plan' and workspace_id is not null and work_id is null)
  or (product_id='custom-applications' and resource_kind='custom-application' and workspace_id is not null and work_id is not null)
  or (product_id='inquiry' and resource_kind='inquiry_capability' and tenant_id is not null)
);

create or replace function public.job_economics_command(
  p_command jsonb,
  p_actor_id uuid,
  p_verified_email text
) returns setof public.job_economics
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text;
  v_actor_email text := lower(btrim(p_verified_email));
  v_job public.job_economics%rowtype;
  v_work public.saved_product_work%rowtype;
  v_workspace_id uuid;
  v_work_id uuid;
  v_payer_id uuid;
  v_job_id uuid;
  v_estimate bigint;
  v_max_authorized bigint;
  v_amount bigint;
  v_actual bigint;
  v_key text;
  v_kind text;
  v_attribution text;
  v_digest text;
  v_allowed text[];
  v_existing_usage public.job_economics_usage%rowtype;
  v_existing_reservation public.job_economics_reservations%rowtype;
  v_inserted integer := 0;
begin
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'job_economics_command_invalid';
  end if;
  v_action := p_command->>'action';
  if v_action not in ('create', 'accept', 'reserve', 'report_usage', 'settle', 'cancel') then
    raise exception 'job_economics_command_invalid';
  end if;

  perform 1 from public.users u
    where u.id = p_actor_id
      and lower(u.email) = v_actor_email
      and u.verified_at is not null
    for update;
  if not found then raise exception 'job_economics_identity_denied'; end if;

  if v_action = 'create' then
    v_allowed := array['action', 'productId', 'resourceKind', 'workspaceId', 'workId',
      'tenantId', 'businessId', 'requestId', 'capabilityId', 'payerId',
      'estimateCents', 'maxAuthorizedCents'];
    if exists (select 1 from jsonb_object_keys(p_command) as key(name) where not (key.name = any(v_allowed))) then
      raise exception 'job_economics_command_invalid';
    end if;
    if p_command->>'productId' not in ('tracker', 'ai_visibility', 'inquiry', 'operations', 'work_plans', 'custom-applications')
      or p_command->>'resourceKind' not in ('tracker', 'private_ai_visibility_work', 'ai_visibility_assessment', 'inquiry_capability', 'responsibility', 'plan', 'custom-application')
      or p_command->>'payerId' is null
      or p_command->>'maxAuthorizedCents' is null
      or p_command->>'maxAuthorizedCents' !~ '^[0-9]+$'
      or char_length(p_command->>'maxAuthorizedCents') > 10 then
      raise exception 'job_economics_command_invalid';
    end if;
    begin
      v_payer_id := (p_command->>'payerId')::uuid;
      v_max_authorized := (p_command->>'maxAuthorizedCents')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'job_economics_command_invalid';
    end;
    if v_max_authorized < 0 or v_max_authorized > 1000000 then raise exception 'job_economics_command_invalid'; end if;

    if p_command ? 'estimateCents' and jsonb_typeof(p_command->'estimateCents') = 'number' then
      if p_command->>'estimateCents' !~ '^[0-9]+$' or char_length(p_command->>'estimateCents') > 10 then
        raise exception 'job_economics_command_invalid';
      end if;
      v_estimate := (p_command->>'estimateCents')::bigint;
      if v_estimate > 1000000 or v_estimate > v_max_authorized then raise exception 'job_economics_command_invalid'; end if;
    elsif p_command ? 'estimateCents' and jsonb_typeof(p_command->'estimateCents') = 'null' then
      v_estimate := null;
    else
      raise exception 'job_economics_command_invalid';
    end if;

    if p_command->>'productId' in ('tracker', 'ai_visibility', 'operations', 'custom-applications') then
      if p_command->>'workspaceId' is null or p_command->>'workId' is null
        or p_command->>'tenantId' is not null or p_command->>'businessId' is not null
        or p_command->>'requestId' is not null or p_command->>'capabilityId' is not null then
        raise exception 'job_economics_command_invalid';
      end if;
      begin
        v_workspace_id := (p_command->>'workspaceId')::uuid;
        v_work_id := (p_command->>'workId')::uuid;
      exception when invalid_text_representation then
        raise exception 'job_economics_command_invalid';
      end;
      if p_command->>'productId' = 'operations' and p_command->>'resourceKind' <> 'responsibility' then
        raise exception 'job_economics_command_invalid';
      end if;
      if p_command->>'productId' = 'tracker' and p_command->>'resourceKind' <> 'tracker' then
        raise exception 'job_economics_command_invalid';
      end if;
      if p_command->>'productId' = 'ai_visibility'
        and p_command->>'resourceKind' not in ('private_ai_visibility_work', 'ai_visibility_assessment') then
        raise exception 'job_economics_command_invalid';
      end if;
      if p_command->>'productId' = 'custom-applications'
        and p_command->>'resourceKind' <> 'custom-application' then
        raise exception 'job_economics_command_invalid';
      end if;
      perform 1 from public.workspace_memberships
        where workspace_id = v_workspace_id and user_id = p_actor_id
        for share;
      if not found then raise exception 'job_economics_workspace_denied'; end if;
      perform 1 from public.workspace_memberships
        where workspace_id = v_workspace_id and user_id = v_payer_id
        for share;
      if not found then raise exception 'job_economics_payer_required'; end if;
      select * into v_work from public.saved_product_work
        where id = v_work_id and workspace_id = v_workspace_id
        for share;
      if not found or v_work.product_id <> p_command->>'productId'
        or v_work.resource_kind <> p_command->>'resourceKind' then
        raise exception 'job_economics_target_not_found';
      end if;
    elsif p_command->>'productId' = 'work_plans' then
      if p_command->>'resourceKind' <> 'plan'
        or p_command->>'workspaceId' is null or p_command->>'workId' is not null
        or p_command->>'tenantId' is not null or p_command->>'businessId' is not null
        or p_command->>'requestId' is not null or p_command->>'capabilityId' is not null then
        raise exception 'job_economics_command_invalid';
      end if;
      begin
        v_workspace_id := (p_command->>'workspaceId')::uuid;
        v_work_id := null;
      exception when invalid_text_representation then
        raise exception 'job_economics_command_invalid';
      end;
      perform 1 from public.workspace_memberships
        where workspace_id = v_workspace_id and user_id = p_actor_id
        for share;
      if not found then raise exception 'job_economics_workspace_denied'; end if;
      perform 1 from public.workspace_memberships
        where workspace_id = v_workspace_id and user_id = v_payer_id
        for share;
      if not found then raise exception 'job_economics_payer_required'; end if;
    else
      if p_command->>'resourceKind' <> 'inquiry_capability'
        or p_command->>'workspaceId' is not null or p_command->>'workId' is not null
        or p_command->>'tenantId' is null or p_command->>'businessId' is null
        or p_command->>'requestId' is null or p_command->>'capabilityId' is null
        or v_payer_id <> p_actor_id then
        raise exception 'job_economics_payer_required';
      end if;
    end if;

    -- A refresh or lost response must return the same active budget for one
    -- native target and payer. A changed estimate is a caller conflict.
    if v_workspace_id is not null then
      if p_command->>'productId' = 'work_plans' then
        select * into v_job from public.job_economics
          where workspace_id = v_workspace_id and work_id is null
            and product_id = 'work_plans' and resource_kind = 'plan'
            and payer_id = v_payer_id and status not in ('settled', 'cancelled')
          for update;
      else
        select * into v_job from public.job_economics
          where workspace_id = v_workspace_id and work_id = v_work_id
            and payer_id = v_payer_id and status not in ('settled', 'cancelled')
          for update;
      end if;
    else
      select * into v_job from public.job_economics
        where tenant_id = p_command->>'tenantId'
          and business_id = p_command->>'businessId'
          and request_id = p_command->>'requestId'
          and capability_id = p_command->>'capabilityId'
          and payer_id = v_payer_id and status not in ('settled', 'cancelled')
        for update;
    end if;
    if found then
      if v_job.product_id <> p_command->>'productId'
        or v_job.resource_kind <> p_command->>'resourceKind'
        or v_job.estimate_cents is distinct from v_estimate::integer
        or v_job.max_authorized_cents <> v_max_authorized::integer then
        raise exception 'job_economics_existing_conflict';
      end if;
      return next v_job;
      return;
    end if;

    begin
      insert into public.job_economics (
        workspace_id, work_id, product_id, resource_kind, tenant_id, business_id,
        request_id, capability_id, payer_id, estimate_cents, max_authorized_cents,
        created_by
      ) values (
        v_workspace_id, v_work_id, p_command->>'productId', p_command->>'resourceKind',
        nullif(p_command->>'tenantId', ''), nullif(p_command->>'businessId', ''),
        nullif(p_command->>'requestId', ''), nullif(p_command->>'capabilityId', ''),
        v_payer_id, v_estimate::integer, v_max_authorized::integer, p_actor_id
      ) returning * into v_job;
    exception when unique_violation then
      if v_workspace_id is not null then
        if p_command->>'productId' = 'work_plans' then
          select * into v_job from public.job_economics
            where workspace_id = v_workspace_id and work_id is null
              and product_id = 'work_plans' and resource_kind = 'plan'
              and payer_id = v_payer_id and status not in ('settled', 'cancelled')
            for update;
        else
          select * into v_job from public.job_economics
            where workspace_id = v_workspace_id and work_id = v_work_id
              and payer_id = v_payer_id and status not in ('settled', 'cancelled')
            for update;
        end if;
      else
        select * into v_job from public.job_economics
          where tenant_id = p_command->>'tenantId'
            and business_id = p_command->>'businessId'
            and request_id = p_command->>'requestId'
            and capability_id = p_command->>'capabilityId'
            and payer_id = v_payer_id and status not in ('settled', 'cancelled')
          for update;
      end if;
      if not found then raise exception 'job_economics_existing_conflict'; end if;
      if v_job.product_id <> p_command->>'productId'
        or v_job.resource_kind <> p_command->>'resourceKind'
        or v_job.estimate_cents is distinct from v_estimate::integer
        or v_job.max_authorized_cents <> v_max_authorized::integer then
        raise exception 'job_economics_existing_conflict';
      end if;
    end;
    return next v_job;
    return;
  end if;

  if v_action = 'accept' or v_action = 'reserve' or v_action = 'settle' or v_action = 'cancel' then
    v_allowed := case v_action
      when 'accept' then array['action', 'jobId']
      when 'reserve' then array['action', 'jobId', 'idempotencyKey', 'amountCents']
      when 'settle' then array['action', 'jobId', 'actualCents']
      else array['action', 'jobId']
    end;
  else
    v_allowed := array['action', 'jobId', 'idempotencyKey', 'kind', 'attribution', 'amountCents'];
  end if;
  if exists (select 1 from jsonb_object_keys(p_command) as key(name) where not (key.name = any(v_allowed))) then
    raise exception 'job_economics_command_invalid';
  end if;
  if p_command->>'jobId' is null then raise exception 'job_economics_command_invalid'; end if;
  begin
    v_job_id := (p_command->>'jobId')::uuid;
  exception when invalid_text_representation then
    raise exception 'job_economics_command_invalid';
  end;
  select * into v_job from public.job_economics where id = v_job_id for update;
  if not found then raise exception 'job_economics_not_found'; end if;

  -- Existing-job mutations require a direct workspace member. Inquiry tenant
  -- access is rechecked by the server native adapter before this RPC.
  if v_job.workspace_id is not null then
    perform 1 from public.workspace_memberships
      where workspace_id = v_job.workspace_id and user_id = p_actor_id
      for share;
    if not found then raise exception 'job_economics_workspace_denied'; end if;
  end if;

  -- Runtime and operator-reported reservations cannot borrow each other's balance.
  if v_action in ('reserve','report_usage') and (
    p_command->>'idempotencyKey' like 'runtime:%'
    or exists(select 1 from public.job_economics_executions where job_id=v_job.id)
  ) then raise exception 'job_economics_runtime_managed'; end if;
  if v_action='settle' and exists(select 1 from public.job_economics_executions
    where job_id=v_job.id and status in ('reserved','running')) then
    raise exception 'job_economics_execution_unresolved'; end if;

  if v_action = 'accept' then
    if v_job.payer_id <> p_actor_id then raise exception 'job_economics_payer_required'; end if;
    if v_job.status = 'draft' then
      update public.job_economics set status = 'accepted', accepted_by = p_actor_id,
        accepted_at = clock_timestamp(), updated_at = clock_timestamp()
        where id = v_job.id returning * into v_job;
    elsif v_job.status in ('accepted', 'reserved', 'settled') then
      null;
    else
      raise exception 'job_economics_invalid_transition';
    end if;
  elsif v_action = 'reserve' then
    v_key := p_command->>'idempotencyKey';
    if v_key is null or char_length(v_key) not between 1 and 128
      or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
      or p_command->>'amountCents' is null or p_command->>'amountCents' !~ '^[0-9]+$'
      or char_length(p_command->>'amountCents') > 10 then raise exception 'job_economics_command_invalid'; end if;
    v_amount := (p_command->>'amountCents')::bigint;
    v_digest := md5(concat_ws('|', v_key, v_amount::text));
    select * into v_existing_reservation from public.job_economics_reservations
      where job_id = v_job.id and idempotency_key = v_key;
    if found then
      if v_existing_reservation.command_digest <> v_digest then raise exception 'job_economics_idempotency_conflict'; end if;
      return next v_job;
      return;
    end if;
    if v_job.status not in ('accepted', 'reserved') then raise exception 'job_economics_invalid_transition'; end if;
    if v_amount < 0 or v_amount > v_job.max_authorized_cents - v_job.reserved_cents then
      raise exception 'job_economics_reservation_exceeded';
    end if;
    insert into public.job_economics_reservations (
      job_id, idempotency_key, amount_cents, command_digest, created_by
    ) values (
      v_job.id, v_key, v_amount::integer, v_digest, p_actor_id
    ) on conflict (job_id, idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      select * into v_existing_reservation from public.job_economics_reservations
        where job_id = v_job.id and idempotency_key = v_key;
      if v_existing_reservation.command_digest <> v_digest then raise exception 'job_economics_idempotency_conflict'; end if;
      return next v_job;
      return;
    end if;
    update public.job_economics set reserved_cents = reserved_cents + v_amount::integer,
      status = 'reserved', updated_at = clock_timestamp()
      where id = v_job.id returning * into v_job;
  elsif v_action = 'report_usage' then
    v_key := p_command->>'idempotencyKey';
    v_kind := p_command->>'kind';
    v_attribution := p_command->>'attribution';
    if v_key is null or char_length(v_key) not between 1 and 128
      or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
      or v_kind not in ('provider', 'model', 'tool', 'human')
      or v_attribution not in ('normal', 'strelva_retry')
      or not (p_command ? 'amountCents') then raise exception 'job_economics_command_invalid'; end if;
    if jsonb_typeof(p_command->'amountCents') = 'number' then
      if p_command->>'amountCents' !~ '^[0-9]+$' or char_length(p_command->>'amountCents') > 10 then raise exception 'job_economics_command_invalid'; end if;
      v_amount := (p_command->>'amountCents')::bigint;
    elsif jsonb_typeof(p_command->'amountCents') = 'null' then
      v_amount := null;
    else
      raise exception 'job_economics_command_invalid';
    end if;
    v_digest := md5(concat_ws('|', v_key, v_kind, v_attribution, coalesce(v_amount::text, 'unknown')));
    select * into v_existing_usage from public.job_economics_usage
      where job_id = v_job.id and idempotency_key = v_key;
    if found then
      if v_existing_usage.command_digest <> v_digest then raise exception 'job_economics_idempotency_conflict'; end if;
      return next v_job;
      return;
    end if;
    if v_job.status not in ('accepted', 'reserved') then raise exception 'job_economics_invalid_transition'; end if;
    -- Check the budget only after the idempotency lookup. A lost response may
    -- replay a usage row after its original amount has consumed the balance.
    if v_amount is not null and v_attribution = 'normal'
      and (v_amount > v_job.max_authorized_cents - v_job.used_cents
        or v_amount > v_job.reserved_cents - v_job.used_cents) then
      raise exception 'job_economics_usage_exceeded';
    end if;
    insert into public.job_economics_usage (
      job_id, idempotency_key, kind, attribution, amount_cents, command_digest, recorded_by
    ) values (
      v_job.id, v_key, v_kind, v_attribution, v_amount::integer, v_digest, p_actor_id
    ) on conflict (job_id, idempotency_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      if v_amount is not null and v_attribution = 'normal' then
        update public.job_economics set used_cents = used_cents + v_amount::integer,
          updated_at = clock_timestamp() where id = v_job.id returning * into v_job;
      elsif v_amount is not null and v_attribution = 'strelva_retry' then
        update public.job_economics set strelva_retry_cents = strelva_retry_cents + v_amount::integer,
          updated_at = clock_timestamp() where id = v_job.id returning * into v_job;
      end if;
    else
      select * into v_existing_usage from public.job_economics_usage
        where job_id = v_job.id and idempotency_key = v_key;
      if v_existing_usage.command_digest <> v_digest then raise exception 'job_economics_idempotency_conflict'; end if;
    end if;
  elsif v_action = 'settle' then
    if v_job.status = 'settled' then
      if p_command->>'actualCents' is null or p_command->>'actualCents' !~ '^[0-9]+$'
        or char_length(p_command->>'actualCents') > 10
        or (p_command->>'actualCents')::integer <> v_job.actual_cents then
        raise exception 'job_economics_invalid_transition';
      end if;
    elsif v_job.status not in ('accepted', 'reserved') then
      raise exception 'job_economics_invalid_transition';
    else
      if p_command->>'actualCents' is null or p_command->>'actualCents' !~ '^[0-9]+$'
        or char_length(p_command->>'actualCents') > 10 then raise exception 'job_economics_command_invalid'; end if;
      v_actual := (p_command->>'actualCents')::bigint;
      if v_actual > v_job.max_authorized_cents then raise exception 'job_economics_overage'; end if;
      if exists (select 1 from public.job_economics_usage where job_id = v_job.id and amount_cents is null) then
        raise exception 'job_economics_unknown_settlement';
      end if;
      if v_actual <> v_job.used_cents then raise exception 'job_economics_settlement_mismatch'; end if;
      update public.job_economics set actual_cents = v_actual::integer, actual_known = true,
        status = 'settled', reserved_cents = used_cents, updated_at = clock_timestamp() where id = v_job.id returning * into v_job;
    end if;
  else
    -- The sponsor may stop funding for their already-cancelled native work.
    -- This grants no spending authority and never cancels an unrelated payer budget.
    if v_job.payer_id <> p_actor_id and not (
      v_job.product_id='operations' and exists(select 1 from public.saved_product_work
        where id=v_job.work_id and workspace_id=v_job.workspace_id
          and payload->>'ownerId'=p_actor_id::text and payload->>'status'='cancelled')
    ) then raise exception 'job_economics_payer_required'; end if;
    if v_job.status in ('settled', 'cancelled') then
      null;
    elsif v_job.status in ('draft', 'accepted', 'reserved') then
      -- Reserved work has not begun. Running and ambiguous completed work retain
      -- funds until factual reconciliation; cancellation is not proof of no effect.
      update public.job_economics_executions set status='finished',effect='none',
        amount_cents=0,billable_cents=0,finished_at=clock_timestamp()
        where job_id=v_job.id and status='reserved';
      update public.job_economics set reserved_cents = used_cents + coalesce((
        select sum(maximum_cents) from public.job_economics_executions
        where job_id=v_job.id and attribution='normal'
          and (status='running' or (status='finished' and amount_cents is null))
      ),0), status = 'cancelled', updated_at = clock_timestamp()
        where id = v_job.id returning * into v_job;
    else
      raise exception 'job_economics_invalid_transition';
    end if;
  end if;
  return next v_job;
end;
$$;
revoke all on function public.job_economics_command(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.job_economics_command(jsonb,uuid,text) to service_role;
