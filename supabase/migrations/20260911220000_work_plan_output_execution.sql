-- A plan output is accepted only through one of the bounded native product
-- engines. This receipt and native saved-work insert commit together, so a
-- retry cannot create a second private document or empty tracker.
create table public.work_plan_output_executions (
  id uuid primary key default gen_random_uuid(),
  plan_work_id uuid not null,
  workspace_id uuid not null,
  plan_revision integer not null check (plan_revision > 0),
  output_id text not null check (output_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$'),
  operation_id text not null check (operation_id ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 256),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'completed' check (status = 'completed'),
  actor_id uuid not null references public.users(id) on delete restrict,
  native_work_id uuid not null,
  native_product_id text not null check (native_product_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  native_resource_kind text not null check (native_resource_kind ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  foreign key (native_work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete restrict,
  unique (plan_work_id, output_id, plan_revision),
  unique (idempotency_key)
);
create index work_plan_output_executions_plan_idx
  on public.work_plan_output_executions (plan_work_id, created_at);

alter table public.work_plan_output_executions enable row level security;
revoke all on table public.work_plan_output_executions from public, anon, authenticated;
grant select, insert, update on table public.work_plan_output_executions to service_role;

create or replace function public.execute_work_plan_output(
  p_plan_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_plan_revision integer,
  p_output_id text,
  p_operation_id text,
  p_idempotency_key text,
  p_input_digest text,
  p_native_product_id text,
  p_native_resource_kind text,
  p_native_title text,
  p_native_payload jsonb,
  p_native_input jsonb,
  p_source_references jsonb
) returns table (
  execution_id uuid,
  plan_work_id uuid,
  output_id text,
  plan_revision integer,
  status text,
  replayed boolean,
  native_work_id uuid,
  native_product_id text,
  native_resource_kind text,
  receipt jsonb,
  created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.work_plan_output_executions%rowtype;
  plan public.saved_product_work%rowtype;
  source_work public.saved_product_work%rowtype;
  source_reference jsonb;
  created_work_id uuid;
  created_execution_id uuid;
  completed_at timestamptz := clock_timestamp();
begin
  perform 1 from public.users
  where id = p_user_id
    and lower(email) = lower(p_verified_email)
    and verified_at is not null
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships
  where workspace_id = p_workspace_id and user_id = p_user_id
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;

  if p_plan_revision is null or p_plan_revision <= 0
    or p_output_id is null or p_output_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$'
    or p_operation_id is null or p_operation_id !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$'
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 256
    or p_input_digest is null or p_input_digest !~ '^[a-f0-9]{64}$'
    or p_native_title is null or char_length(btrim(p_native_title)) not between 1 and 160
    or p_native_payload is null or jsonb_typeof(p_native_payload) <> 'object'
    or p_native_input is null or jsonb_typeof(p_native_input) <> 'object'
    or p_source_references is null or jsonb_typeof(p_source_references) <> 'array'
    or jsonb_array_length(p_source_references) > 6 then
    raise exception 'work_plan_output_invalid';
  end if;

  -- Serialize one output acceptance. This also turns the unique key into a
  -- deterministic replay path when two browser retries arrive together.
  perform pg_advisory_xact_lock(hashtextextended(
    'work-plan-output:' || p_plan_work_id::text || ':' || p_output_id || ':' || p_plan_revision::text,
    91
  ));

  select * into existing
  from public.work_plan_output_executions execution
  where execution.plan_work_id = p_plan_work_id
    and execution.output_id = p_output_id
    and execution.plan_revision = p_plan_revision
  for update;
  if found then
    if existing.idempotency_key is distinct from p_idempotency_key
      or existing.input_digest is distinct from p_input_digest
      or existing.operation_id is distinct from p_operation_id
      or existing.native_product_id is distinct from p_native_product_id
      or existing.native_resource_kind is distinct from p_native_resource_kind then
      raise exception 'work_plan_output_idempotency_conflict';
    end if;
    return query select existing.id, existing.plan_work_id, existing.output_id,
      existing.plan_revision, existing.status, true, existing.native_work_id,
      existing.native_product_id, existing.native_resource_kind, existing.receipt,
      existing.created_at;
    return;
  end if;

  select * into plan
  from public.saved_product_work
  where id = p_plan_work_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'workspace_access_denied'; end if;
  if plan.product_id <> 'work_plans' or plan.resource_kind <> 'plan'
    or plan.payload is null or jsonb_typeof(plan.payload) <> 'object'
    or plan.payload->>'version' <> '1'
    or plan.payload->'metadata'->>'workspaceId' is distinct from p_workspace_id::text
    or plan.payload->'metadata'->>'revision' is distinct from p_plan_revision::text
    or jsonb_typeof(plan.payload->'proposedOutputs') <> 'array' then
    raise exception 'work_plan_output_invalid';
  end if;

  if jsonb_typeof(plan.payload->'context'->'sources') = 'array' then
    if jsonb_array_length(plan.payload->'context'->'sources') <> jsonb_array_length(p_source_references)
      or exists(
        select 1
        from jsonb_array_elements(plan.payload->'context'->'sources') as planned(value)
        where not exists(
          select 1 from jsonb_array_elements(p_source_references) as supplied(value)
          where supplied.value->>'workId' = planned.value->>'workId'
            and supplied.value->>'productId' = planned.value->>'productId'
            and supplied.value->>'resourceKind' = planned.value->>'resourceKind'
            and supplied.value->>'updatedAt' = planned.value->>'updatedAt'
            and supplied.value->>'revision' is not distinct from planned.value->>'revision'
        )
      ) then
      raise exception 'work_plan_output_invalid';
    end if;
  elsif jsonb_array_length(p_source_references) <> 0 then
    raise exception 'work_plan_output_invalid';
  end if;

  if not exists(
    select 1
    from jsonb_array_elements(plan.payload->'proposedOutputs') as proposed(value)
    where proposed.value->>'id' = p_output_id
      and jsonb_typeof(proposed.value->'nativeOperationIds') = 'array'
      and exists(
        select 1 from jsonb_array_elements_text(proposed.value->'nativeOperationIds') as operation(id)
        where operation.id = p_operation_id
      )
  ) then
    raise exception 'work_plan_output_unsupported';
  end if;

  -- Lock every selected source while the native output is committed. The
  -- application performs the same check for a useful error before this call;
  -- this transaction closes the edit-versus-accept race at the write boundary.
  for source_reference in
    select value from jsonb_array_elements(p_source_references)
  loop
    if jsonb_typeof(source_reference) <> 'object'
      or source_reference->>'workId' is null
      or source_reference->>'workId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or source_reference->>'productId' is null
      or source_reference->>'resourceKind' is null
      or source_reference->>'updatedAt' is null then
      raise exception 'work_plan_output_invalid';
    end if;
    select * into source_work
    from public.saved_product_work
    where id = (source_reference->>'workId')::uuid
      and workspace_id = p_workspace_id
    for share;
    if not found
      or source_work.product_id is distinct from source_reference->>'productId'
      or source_work.resource_kind is distinct from source_reference->>'resourceKind'
      or source_work.updated_at is distinct from (source_reference->>'updatedAt')::timestamptz then
      raise exception 'work_plan_revision_conflict';
    end if;
    if source_reference->>'revision' is not null then
      if source_work.product_id = 'documents'
        and (source_work.payload->>'revision') is distinct from source_reference->>'revision' then
        raise exception 'work_plan_revision_conflict';
      elsif source_work.product_id = 'tracker'
        and (source_work.payload->'tracker'->>'revision') is distinct from source_reference->>'revision' then
        raise exception 'work_plan_revision_conflict';
      end if;
    end if;
  end loop;

  -- This is the complete execution catalog for this bounded slice. The model
  -- and client cannot widen it by supplying a product or operation string.
  if p_operation_id = 'create_document' then
    if p_native_product_id <> 'documents' or p_native_resource_kind <> 'document'
      or p_native_payload->>'version' <> '1'
      or p_native_payload->>'revision' <> '0'
      or p_native_payload->>'createdBy' is distinct from p_user_id::text
      or jsonb_typeof(p_native_payload->'history') <> 'array' then
      raise exception 'work_plan_output_invalid';
    end if;
  elsif p_operation_id = 'create_tracker' then
    if p_native_product_id <> 'tracker' or p_native_resource_kind <> 'tracker'
      or jsonb_typeof(p_native_payload->'tracker') <> 'object'
      or p_native_payload->'tracker'->>'revision' <> '0'
      or jsonb_typeof(p_native_payload->'tracker'->'rows') <> 'array'
      or jsonb_typeof(p_native_payload->'tracker'->'history') <> 'array' then
      raise exception 'work_plan_output_invalid';
    end if;
  else
    raise exception 'work_plan_output_unsupported';
  end if;

  insert into public.saved_product_work (
    workspace_id, product_id, resource_kind, title, payload, input, source_work_id, created_by
  ) values (
    p_workspace_id, p_native_product_id, p_native_resource_kind,
    left(btrim(p_native_title), 160), p_native_payload, p_native_input, p_plan_work_id, p_user_id
  ) returning id into created_work_id;

  insert into public.work_plan_output_executions (
    plan_work_id, workspace_id, plan_revision, output_id, operation_id,
    idempotency_key, input_digest, actor_id, native_work_id,
    native_product_id, native_resource_kind, receipt, created_at, updated_at
  ) values (
    p_plan_work_id, p_workspace_id, p_plan_revision, p_output_id, p_operation_id,
    p_idempotency_key, p_input_digest, p_user_id, created_work_id,
    p_native_product_id, p_native_resource_kind,
    jsonb_build_object(
      'version', 1,
      'kind', 'work_plan_output',
      'planWorkId', p_plan_work_id,
      'outputId', p_output_id,
      'planRevision', p_plan_revision,
      'operationId', p_operation_id,
      'actorId', p_user_id,
      'nativeWorkId', created_work_id,
      'completedAt', completed_at
    ),
    completed_at, completed_at
  ) returning id into created_execution_id;
  return query
    select execution.id, execution.plan_work_id, execution.output_id,
      execution.plan_revision, execution.status, false, execution.native_work_id,
      execution.native_product_id, execution.native_resource_kind,
      execution.receipt, execution.created_at
    from public.work_plan_output_executions execution
    where execution.id = created_execution_id;
end;
$$;

create or replace function public.read_work_plan_output(
  p_plan_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_plan_revision integer,
  p_output_id text,
  p_operation_id text,
  p_idempotency_key text,
  p_input_digest text
) returns table (
  execution_id uuid,
  plan_work_id uuid,
  output_id text,
  plan_revision integer,
  status text,
  replayed boolean,
  native_work_id uuid,
  native_product_id text,
  native_resource_kind text,
  receipt jsonb,
  created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.work_plan_output_executions%rowtype;
begin
  perform 1 from public.users
  where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships
  where workspace_id = p_workspace_id and user_id = p_user_id
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.work_plan_output_executions execution
  where execution.plan_work_id = p_plan_work_id and execution.workspace_id = p_workspace_id
    and execution.plan_revision = p_plan_revision and execution.output_id = p_output_id
  for share;
  if not found then return; end if;
  if existing.idempotency_key is distinct from p_idempotency_key
    or existing.input_digest is distinct from p_input_digest
    or existing.operation_id is distinct from p_operation_id then
    raise exception 'work_plan_output_idempotency_conflict';
  end if;
  return query select existing.id, existing.plan_work_id, existing.output_id,
    existing.plan_revision, existing.status, true, existing.native_work_id,
    existing.native_product_id, existing.native_resource_kind, existing.receipt,
    existing.created_at;
end;
$$;

create or replace function public.list_work_plan_outputs(
  p_plan_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns table (
  execution_id uuid,
  plan_work_id uuid,
  output_id text,
  plan_revision integer,
  status text,
  replayed boolean,
  native_work_id uuid,
  native_product_id text,
  native_resource_kind text,
  receipt jsonb,
  created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users
  where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships
  where workspace_id = p_workspace_id and user_id = p_user_id
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  if not exists(
    select 1 from public.saved_product_work
    where id = p_plan_work_id and workspace_id = p_workspace_id
      and product_id = 'work_plans' and resource_kind = 'plan'
  ) then raise exception 'workspace_access_denied'; end if;
  return query
    select execution.id, execution.plan_work_id, execution.output_id,
      execution.plan_revision, execution.status, false, execution.native_work_id,
      execution.native_product_id, execution.native_resource_kind,
      execution.receipt, execution.created_at
    from public.work_plan_output_executions execution
    where execution.plan_work_id = p_plan_work_id
      and execution.workspace_id = p_workspace_id
    order by execution.created_at;
end;
$$;

revoke all on function public.execute_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.execute_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function public.read_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.read_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text) to service_role;
revoke all on function public.list_work_plan_outputs(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.list_work_plan_outputs(uuid,uuid,uuid,text) to service_role;
