-- Reserve a legacy Google effect before dispatch. No provider call is allowed
-- when this boundary is unavailable. Accepted/uncertain attempts never retry;
-- a provider rejection may be retried, keeping each rejected receipt.
set lock_timeout = '3s';
create table public.operator_google_write_attempts (
  command_key text primary key check (char_length(command_key) between 1 and 200),
  tenant_id text not null,
  write_kind text not null check (write_kind in ('gbp_hours','gbp_post','gbp_photo')),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  attempt_id uuid not null unique default gen_random_uuid(),
  acceptance text not null default 'pending' check (acceptance in ('pending','accepted','rejected','unknown')),
  receipt_id uuid references public.outside_write_receipts(id) on delete restrict,
  started_at timestamptz not null default clock_timestamp()
);
alter table public.operator_google_write_attempts enable row level security;
revoke all on public.operator_google_write_attempts from public, anon, authenticated, service_role;

create function public.begin_operator_google_write(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.operator_google_write_attempts%rowtype; acquired boolean := false;
begin
  if p_command->>'commandKey' is null or p_command->>'tenantId' is null
    or p_command->>'writeKind' not in ('gbp_hours','gbp_post','gbp_photo')
    or jsonb_typeof(p_command->'request') is distinct from 'object' then
    raise exception 'outside_write_receipt_invalid';
  end if;
  perform 1 from public.tenants where id = p_command->>'tenantId' for key share;
  if not found then raise exception 'outside_write_receipt_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('operator-google:' || (p_command->>'commandKey'), 0));
  select * into row from public.operator_google_write_attempts where command_key = p_command->>'commandKey' for update;
  if found then
    if row.tenant_id <> p_command->>'tenantId' or row.write_kind <> p_command->>'writeKind'
      or row.request <> p_command->'request' then raise exception 'outside_write_receipt_conflict'; end if;
    if row.acceptance = 'rejected' then
      update public.operator_google_write_attempts set attempt_id = gen_random_uuid(), acceptance = 'pending',
        receipt_id = null, started_at = clock_timestamp() where command_key = row.command_key returning * into row;
      acquired := true;
    end if;
  else
    insert into public.operator_google_write_attempts(command_key, tenant_id, write_kind, request)
      values (p_command->>'commandKey', p_command->>'tenantId', p_command->>'writeKind', p_command->'request') returning * into row;
    acquired := true;
  end if;
  return jsonb_build_object('claimed', acquired, 'attemptId', row.attempt_id, 'acceptance', row.acceptance,
    'receipt', case when row.receipt_id is null then null else public.outside_write_receipt_row(row.receipt_id) end);
end;
$$;

create function public.complete_operator_google_write(p_attempt_id uuid, p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.operator_google_write_attempts%rowtype; receipt jsonb;
begin
  select * into row from public.operator_google_write_attempts where attempt_id = p_attempt_id for update;
  if not found then raise exception 'outside_write_receipt_invalid'; end if;
  if row.tenant_id is distinct from p_receipt->>'tenantId' or row.write_kind is distinct from p_receipt->>'writeKind'
    or p_receipt->>'provider' is distinct from 'google_business'
    or p_receipt->>'acceptance' is null or p_receipt->>'acceptance' not in ('accepted','rejected','unknown') then
    raise exception 'outside_write_receipt_conflict';
  end if;
  if row.receipt_id is not null then return public.outside_write_receipt_row(row.receipt_id); end if;
  receipt := public.record_outside_write_receipt(p_receipt || jsonb_build_object('commandKey', 'google-attempt:' || p_attempt_id::text));
  update public.operator_google_write_attempts set acceptance = p_receipt->>'acceptance', receipt_id = (receipt->>'id')::uuid
    where attempt_id = p_attempt_id;
  return receipt;
end;
$$;

-- Uncertain dispatches and accepted-but-unverified effects are P1 evidence,
-- including a process crash or receipt settlement failure after provider accept.
create function public.read_operator_google_uncertainty(p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', a.attempt_id, 'tenantId', a.tenant_id, 'writeKind', a.write_kind,
    'acceptance', a.acceptance, 'startedAt', a.started_at, 'receiptId', a.receipt_id,
    'readback', r.readback
  ) order by a.started_at) from public.operator_google_write_attempts a
    left join public.outside_write_receipts r on r.id = a.receipt_id
    where a.acceptance in ('pending','unknown') or (a.acceptance = 'accepted' and r.readback in ('pending','not_possible'))), '[]'::jsonb);
end;
$$;
revoke all on function public.begin_operator_google_write(jsonb) from public, anon, authenticated;
revoke all on function public.complete_operator_google_write(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.read_operator_google_uncertainty(uuid,text) from public, anon, authenticated;
grant execute on function public.begin_operator_google_write(jsonb) to service_role;
grant execute on function public.complete_operator_google_write(uuid,jsonb) to service_role;
grant execute on function public.read_operator_google_uncertainty(uuid,text) to service_role;
