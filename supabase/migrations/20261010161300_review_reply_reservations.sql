-- Review replies use the same durable Google dispatch reservation.
set lock_timeout = '3s';
alter table public.operator_google_write_attempts drop constraint operator_google_write_attempts_write_kind_check;
alter table public.operator_google_write_attempts add constraint operator_google_write_attempts_write_kind_check check (write_kind in ('gbp_hours','gbp_post','gbp_photo','review_reply')) not valid;
alter table public.operator_google_write_attempts validate constraint operator_google_write_attempts_write_kind_check;
create or replace function public.begin_operator_google_write(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row public.operator_google_write_attempts%rowtype; acquired boolean := false;
begin
  if p_command->>'commandKey' is null or p_command->>'tenantId' is null
    or p_command->>'writeKind' not in ('gbp_hours','gbp_post','gbp_photo','review_reply')
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

