-- BILL-03: durable provider billing evidence for one already-admitted work
-- execution. This table is written only by a trusted server/provider adapter;
-- browser usage reports remain in job_economics_usage and never become a bill.

create table public.work_provider_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider = btrim(provider)
      and char_length(provider) between 1 and 96
      and provider ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
  request_id text not null
    check (request_id = btrim(request_id)
      and char_length(request_id) between 1 and 256),
  job_id uuid not null references public.job_economics(id) on delete cascade,
  execution_key text not null
    check (execution_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
  kind text not null check (kind in ('provider', 'model', 'tool', 'human')),
  attribution text not null check (attribution in ('normal', 'strelva_retry')),
  maximum_cents integer not null check (maximum_cents between 0 and 1000000),
  billable_cents integer not null check (billable_cents between 0 and maximum_cents),
  evidence_reference text not null
    check (char_length(btrim(evidence_reference)) between 1 and 256),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (provider, request_id),
  unique (job_id, execution_key),
  foreign key (job_id, execution_key)
    references public.job_economics_executions(job_id, execution_key)
    on delete cascade
);

create index work_provider_receipts_execution_idx
  on public.work_provider_receipts (job_id, execution_key, recorded_at desc);

alter table public.work_provider_receipts enable row level security;
revoke all on public.work_provider_receipts from public, anon, authenticated;
grant select, insert on public.work_provider_receipts to service_role;

-- The caller is a server-side provider adapter. It supplies a complete receipt
-- returned by that provider, never an amount entered in the customer UI. The
-- function binds the receipt to the existing execution, stores it once, and
-- delegates settlement to the existing execution command so reservation and
-- customer usage counters retain one source of truth.
create or replace function public.record_work_provider_receipt(p_receipt jsonb)
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
  v_billable integer;
  v_reference text;
  v_execution public.job_economics_executions%rowtype;
  v_existing public.work_provider_receipts%rowtype;
  v_user_email text;
  v_result jsonb;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_receipt) key(name)
      where key.name not in ('provider','requestId','jobId','executionKey','kind',
        'attribution','maximumCents','billableCents','evidenceReference')
    )
    or p_receipt->>'provider' is null
    or p_receipt->>'requestId' is null
    or p_receipt->>'jobId' is null
    or p_receipt->>'executionKey' is null
    or p_receipt->>'kind' not in ('provider','model','tool','human')
    or p_receipt->>'attribution' not in ('normal','strelva_retry')
    or p_receipt->>'maximumCents' !~ '^[0-9]+$'
    or p_receipt->>'billableCents' !~ '^[0-9]+$'
    or p_receipt->>'evidenceReference' is null then
    raise exception 'provider_receipt_invalid';
  end if;

  begin
    v_job_id := (p_receipt->>'jobId')::uuid;
    v_maximum := (p_receipt->>'maximumCents')::integer;
    v_billable := (p_receipt->>'billableCents')::integer;
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
    or v_billable not between 0 and v_maximum then
    raise exception 'provider_receipt_invalid';
  end if;

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
      or v_existing.billable_cents <> v_billable
      or v_existing.evidence_reference <> v_reference then
      raise exception 'provider_receipt_mismatch';
    end if;
    select to_jsonb(e) into v_result
      from public.job_economics_executions e
     where e.job_id = v_job_id and e.execution_key = v_execution_key;
    if v_result is null then raise exception 'provider_receipt_target_not_found'; end if;
    return jsonb_build_object('receiptId', v_existing.id, 'replayed', true, 'execution', v_result);
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

  -- The receipt is only valid for a started execution. An unresolved receipt
  -- keeps its maximum held; an accepted known execution may be replayed safely.
  if v_execution.status = 'reserved' then raise exception 'provider_receipt_target_not_started'; end if;

  insert into public.work_provider_receipts (
    provider, request_id, job_id, execution_key, kind, attribution,
    maximum_cents, billable_cents, evidence_reference
  ) values (
    v_provider, v_request_id, v_job_id, v_execution_key, v_kind, v_attribution,
    v_maximum, v_billable, v_reference
  ) returning * into v_existing;

  -- Reuse the execution creator as the reconciler identity. The existing RPC
  -- rechecks that person's verified identity, workspace membership, and exact
  -- execution key before changing the hold.
  select lower(email) into v_user_email from public.users where id = v_execution.created_by;
  if v_user_email is null then raise exception 'provider_receipt_identity_denied'; end if;
  select public.job_economics_execution_command(jsonb_build_object(
    'action','reconcile', 'jobId',v_job_id, 'executionKey',v_execution_key,
    'maximumCents',v_maximum, 'kind',v_kind, 'attribution',v_attribution,
    'effect','accepted', 'amountCents',v_billable, 'evidenceReference',v_reference
  ), v_execution.created_by, v_user_email) into v_result;

  return jsonb_build_object('receiptId', v_existing.id, 'replayed', false, 'execution', v_result->'execution');
exception
  when unique_violation then
    raise exception 'provider_receipt_conflict';
end;
$$;

revoke all on function public.record_work_provider_receipt(jsonb) from public, anon, authenticated;
grant execute on function public.record_work_provider_receipt(jsonb) to service_role;
