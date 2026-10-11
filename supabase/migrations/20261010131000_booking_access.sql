-- Agent confirmation and native (including legacy widget) manage links.
-- Hashes authorize, encrypted tokens exist only for customer mail. No sends.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.business_booking_access (
  booking_id uuid primary key references public.business_bookings(id) on delete cascade,
  manage_hash text not null unique check (manage_hash ~ '^[a-f0-9]{64}$'),
  manage_ciphertext text not null,
  confirm_hash text unique check (confirm_hash ~ '^[a-f0-9]{64}$'),
  confirm_ciphertext text,
  status_hash text unique check (status_hash ~ '^[a-f0-9]{64}$'),
  status_ciphertext text,
  confirm_until timestamptz,
  confirmed_at timestamptz,
  agent_name text check (agent_name is null or char_length(agent_name) between 1 and 120),
  check ((confirm_hash is null) = (confirm_ciphertext is null)),
  check ((status_hash is null) = (status_ciphertext is null))
);
alter table public.business_booking_access enable row level security;
revoke all on public.business_booking_access from public, anon, authenticated, service_role;

create function public.issue_booking_access(p_tenant_id text, p_ref text, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_a public.business_booking_access;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  select * into v_b from public.business_bookings where calendar_key = v.tenant_stable_id and (id::text = p_ref or legacy_id = p_ref) for update;
  if not found then raise exception 'booking_not_found'; end if;
  insert into public.business_booking_access(booking_id, manage_hash, manage_ciphertext, confirm_hash, confirm_ciphertext,
    status_hash, status_ciphertext, confirm_until, agent_name)
  values (v_b.id, p_access->>'manageHash', p_access->>'manageCiphertext', p_access->>'confirmHash', p_access->>'confirmCiphertext',
    p_access->>'statusHash', p_access->>'statusCiphertext', case when v_b.origin = 'agent' then v_b.created_at + interval '15 minutes' end, p_access->>'agentName')
  on conflict (booking_id) do nothing;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  return to_jsonb(v_a);
end;
$$;

-- Repeated request ids return the original hold, never recreate/reopen it.
-- Hourly cap is durable and tenant-scoped. All holds share the same exclusion.
create function public.hold_agent_booking(p_tenant_id text, p_booking jsonb, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_result jsonb; v_access jsonb;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if v.tenant_stable_id is null then raise exception 'booking_unknown_tenant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text, 9106));
  select * into v_b from public.business_bookings where calendar_key = v.tenant_stable_id and legacy_id = p_booking->>'legacyId';
  if found then
    if v_b.origin <> 'agent' or v_b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
      raise exception 'booking_request_conflict';
    end if;
    return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_b),
      'access', (select to_jsonb(a) from public.business_booking_access a where a.booking_id = v_b.id));
  end if;
  if (select count(*) from public.business_bookings where calendar_key = v.tenant_stable_id and origin = 'agent'
    and created_at > clock_timestamp() - interval '1 hour') >= 10 then raise exception 'booking_agent_limit'; end if;
  if (public.read_tenant_booking_context(p_tenant_id)->>'paused')::boolean then raise exception 'booking_paused'; end if;
  if p_booking->>'status' <> 'held' or p_booking->>'origin' <> 'agent' then raise exception 'booking_invalid'; end if;
  v_result := public.record_tenant_booking(p_tenant_id, p_booking, 'native');
  if v_result->>'status' = 'conflict' then return v_result; end if;
  v_access := public.issue_booking_access(p_tenant_id, v_result#>>'{booking,id}', p_access);
  return v_result || jsonb_build_object('access', v_access);
end;
$$;

create function public.read_native_booking_access(p_hash text, p_kind text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.booking_json(b) || jsonb_build_object('siteName', t.site_name,
    'confirmationRequired', b.status = 'held' and a.confirm_hash = p_hash,
    'confirmUntil', a.confirm_until, 'agentName', a.agent_name)
  from public.business_booking_access a join public.business_bookings b on b.id = a.booking_id
  join public.tenants t on t.stable_id = b.tenant_stable_id
  where (p_kind = 'manage' and a.manage_hash = p_hash)
    or (p_kind = 'confirm' and a.confirm_hash = p_hash)
    or (p_kind = 'status' and a.status_hash = p_hash)
$$;

-- The confirmation link is only consumed by POST. A mail scanner's GET
-- cannot place a booking. Serializes with the sweep on the booking row.
create function public.confirm_agent_booking(p_hash text, p_force_request boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_a public.business_booking_access; v_to text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.confirm_hash = p_hash for update of b;
  if not found then raise exception 'booking_not_found'; end if;
  select * into v_a from public.business_booking_access where booking_id = v_b.id;
  if v_a.confirmed_at is not null then return jsonb_build_object('status','unchanged','booking',public.booking_json(v_b)); end if;
  if v_b.status <> 'held' or v_a.confirm_until <= clock_timestamp() or v_b.start_at <= clock_timestamp() then raise exception 'booking_hold_expired'; end if;
  v_to := case when p_force_request or coalesce((select mode from public.booking_settings where calendar_key = v_b.calendar_key), 'request') = 'request'
    then 'requested' else 'confirmed' end;
  update public.business_bookings set status = v_to, updated_at = clock_timestamp() where id = v_b.id returning * into v_b;
  update public.business_booking_access set confirmed_at = clock_timestamp() where booking_id = v_b.id;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id, 'visitor', 'held', v_to, 'Customer confirmed agent request');
  return jsonb_build_object('status','updated','booking',public.booking_json(v_b));
end;
$$;

create function public.change_native_booking(p_hash text, p_change jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_b public.business_bookings; v_before public.business_bookings; v_ctx jsonb; v_status text;
begin
  select b.* into v_b from public.business_bookings b join public.business_booking_access a on a.booking_id = b.id
    where a.manage_hash = p_hash for update of b;
  if not found or v_b.end_at <= clock_timestamp() then raise exception 'booking_not_found'; end if;
  v_before := v_b;
  if p_change->>'action' = 'cancel' then
    if v_b.status = 'cancelled' then return public.booking_json(v_b); end if;
    update public.business_bookings set status='cancelled', cancelled_at=clock_timestamp(), updated_at=clock_timestamp()
      where id=v_b.id returning * into v_b;
  elsif p_change->>'action' = 'reschedule' then
    if v_b.status not in ('requested','confirmed') then raise exception 'booking_not_found'; end if;
    v_ctx := public.read_tenant_booking_context((select id from public.tenants where stable_id=v_b.tenant_stable_id));
    if (v_ctx->>'paused')::boolean then raise exception 'booking_paused'; end if;
    v_status := case when coalesce(v_ctx#>>'{settings,mode}','request')='request' or (p_change->>'forceRequest')::boolean
      then 'requested' else 'confirmed' end;
    begin
      update public.business_bookings set start_at=(p_change->>'start')::timestamptz, end_at=(p_change->>'end')::timestamptz,
        buffer_minutes=coalesce((v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes),
        block_end_at=(p_change->>'end')::timestamptz + make_interval(mins=>coalesce((v_ctx#>>'{settings,bufferMinutes}')::integer,buffer_minutes)),
        status=v_status, updated_at=clock_timestamp()
        where id=v_b.id returning * into v_b;
    exception when exclusion_violation then raise exception 'booking_slot_taken'; end;
  else raise exception 'booking_invalid'; end if;
  insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
    values(v_b.id,'visitor',v_before.status,v_b.status,case when p_change->>'action'='cancel' then
      case when v_before.start_at < clock_timestamp()+make_interval(hours=>coalesce((select (to_jsonb(s)->>'cancellation_cutoff_hours')::integer from public.booking_settings s where calendar_key=v_b.calendar_key),24))
        then 'Customer cancelled after the cancellation cutoff' else 'Customer cancelled' end
      else 'Customer rescheduled' end);
  return public.booking_json(v_b);
end;
$$;
revoke all on function public.issue_booking_access(text,text,jsonb), public.hold_agent_booking(text,jsonb,jsonb),
  public.read_native_booking_access(text,text), public.confirm_agent_booking(text,boolean), public.change_native_booking(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.issue_booking_access(text,text,jsonb), public.hold_agent_booking(text,jsonb,jsonb),
  public.read_native_booking_access(text,text), public.confirm_agent_booking(text,boolean), public.change_native_booking(text,jsonb) to service_role;
commit;
