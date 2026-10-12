-- Money and the client's data, part (b): no client data held only in Redis.
--
-- One Postgres home for the client stores that today live only in Redis and
-- are small enough to share a shape: submissions held as spam, inquiry
-- delivery timelines, the first reply to each inquiry, booking hours and
-- closures, and the multi-site account grouping. Leads already have
-- `tenant_leads`; analytics property and report markers have
-- `tenant_analytics_config` / `tenant_report_state` (20261007194000), so they
-- are deliberately not stored here a second time; orders and rewards are counted
-- first (scripts/count-client-redis-keys.ts) and are not moved here.
--
-- The move pattern (src/platform/client-records): dual-write behind a flag
-- (a failed Postgres write never fails the client's request; it is queued and
-- retried), a backfill per store that is a dry run by default, a parity check
-- per store and tenant comparing Redis and Postgres record hashes, and a read
-- flag per store that only takes effect after 7 consecutive days of parity.
--
-- Identity. Rows key on the tenant's `stable_id`, so a slug rename moves
-- nothing. `workspace_id` is filled when the tenant is converted and cleared
-- when it is unlinked, by triggers on `tenant_workspace_links`. It has no
-- foreign key on purpose: unlinking counts every foreign key to `workspaces`
-- as use (see 20261002120000_business_record.sql), and a copy of client data
-- must not keep a reverted conversion's workspace alive.
--
-- Records are never deleted by the move. A removal in Redis (an account that
-- drops a site) sets `removed_at`; deprovision deletes the tenant row and its
-- records cascade (unlike `tenant_leads`, which decision 5 now retains).
--
-- Access. RLS on, every table privilege revoked, service-role functions only.

create table public.tenant_client_records (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  workspace_id uuid,
  store text not null check (store in ('spam_held','inquiry_timeline','inquiry_reply','booking_config',
    'account_grouping')),
  record_id text not null check (char_length(record_id) between 1 and 300),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 256000),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  removed_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  recorded_via text not null check (recorded_via in ('dual_write','repair','backfill')),
  unique (tenant_stable_id, store, record_id)
);
create index tenant_client_records_store_idx on public.tenant_client_records(tenant_stable_id, store, captured_at desc, id);
create index tenant_client_records_workspace_idx on public.tenant_client_records(workspace_id, store, captured_at desc)
  where workspace_id is not null;

-- One row per store, tenant and day: the last parity result that day.
create table public.tenant_client_record_parity (
  store text not null,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  checked_on date not null,
  checked_at timestamptz not null default clock_timestamp(),
  ok boolean not null,
  redis_count integer not null check (redis_count >= 0),
  postgres_count integer not null check (postgres_count >= 0),
  missing integer not null check (missing >= 0),
  mismatched integer not null check (mismatched >= 0),
  primary key (store, tenant_stable_id, checked_on)
);

alter table public.tenant_client_records enable row level security;
alter table public.tenant_client_record_parity enable row level security;
revoke all on public.tenant_client_records, public.tenant_client_record_parity
  from public, anon, authenticated, service_role;

create function public.tenant_client_record_workspace(p_tenant_stable_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select workspace_id from public.tenant_workspace_links where tenant_stable_id = p_tenant_stable_id
$$;

-- Record one Redis record's copy. Modes:
--   replace     the newest Redis value wins (config, settings, spam items)
--   keep_first  the first value is kept (the time of an inquiry's first reply)
--   remove      the record left Redis; it is kept and marked removed
-- Returns {status, id, workspaceId}; status is recorded, updated, unchanged,
-- kept or removed. Raises client_record_unknown_tenant or client_record_invalid.
create function public.record_tenant_client_record(
  p_tenant_id text, p_store text, p_record_id text, p_payload jsonb, p_payload_hash text,
  p_captured_at timestamptz, p_via text, p_mode text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_row public.tenant_client_records%rowtype; v_exists boolean; v_workspace uuid; v_id uuid;
begin
  if p_via is null or p_via not in ('dual_write','repair','backfill')
    or p_mode is null or p_mode not in ('replace','keep_first','remove')
    or p_store is null or p_record_id is null or char_length(p_record_id) not between 1 and 300
    or p_captured_at is null then
    raise exception 'client_record_invalid';
  end if;
  if p_mode <> 'remove' and (p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 256000 or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'client_record_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'client_record_unknown_tenant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_stable::text || ':' || p_store || ':' || p_record_id, 9106));
  select * into v_row from public.tenant_client_records
    where tenant_stable_id = v_stable and store = p_store and record_id = p_record_id;
  v_exists := found;

  if p_mode = 'remove' then
    if not v_exists then return jsonb_build_object('status', 'unchanged', 'id', null, 'workspaceId', null); end if;
    update public.tenant_client_records set removed_at = coalesce(removed_at, clock_timestamp()), updated_at = clock_timestamp()
      where id = v_row.id;
    return jsonb_build_object('status', 'removed', 'id', v_row.id, 'workspaceId', v_row.workspace_id);
  end if;

  v_workspace := public.tenant_client_record_workspace(v_stable);
  if not v_exists then
    begin
      insert into public.tenant_client_records(tenant_stable_id, workspace_id, store, record_id, payload, payload_hash,
          captured_at, recorded_via)
        values (v_stable, v_workspace, p_store, p_record_id, p_payload, p_payload_hash, p_captured_at, p_via)
        returning id into v_id;
    exception when check_violation then raise exception 'client_record_invalid';
    end;
    return jsonb_build_object('status', 'recorded', 'id', v_id, 'workspaceId', v_workspace);
  end if;
  if p_mode = 'keep_first' and v_row.removed_at is null then
    -- An earlier time still wins: a repair may arrive after a later write.
    if p_captured_at < v_row.captured_at then
      update public.tenant_client_records set payload = p_payload, payload_hash = p_payload_hash, captured_at = p_captured_at,
          updated_at = clock_timestamp() where id = v_row.id;
      return jsonb_build_object('status', 'updated', 'id', v_row.id, 'workspaceId', v_row.workspace_id);
    end if;
    return jsonb_build_object('status', 'kept', 'id', v_row.id, 'workspaceId', v_row.workspace_id);
  end if;
  if v_row.payload_hash = p_payload_hash and v_row.removed_at is null then
    return jsonb_build_object('status', 'unchanged', 'id', v_row.id, 'workspaceId', v_row.workspace_id);
  end if;
  update public.tenant_client_records set payload = p_payload, payload_hash = p_payload_hash,
      captured_at = greatest(captured_at, p_captured_at), removed_at = null, updated_at = clock_timestamp(),
      workspace_id = coalesce(workspace_id, v_workspace)
    where id = v_row.id;
  return jsonb_build_object('status', 'updated', 'id', v_row.id, 'workspaceId', coalesce(v_row.workspace_id, v_workspace));
end;
$$;

-- Read a store for one tenant (current slug), newest first, without removed.
create function public.read_tenant_client_records(p_tenant_id text, p_store text, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 1000);
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(item order by item->>'capturedAt' desc, item->>'recordId' desc) from (
    select jsonb_build_object('recordId', r.record_id, 'payload', r.payload, 'payloadHash', r.payload_hash,
      'capturedAt', to_char(r.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'workspaceId', r.workspace_id, 'recordedVia', r.recorded_via) as item
    from public.tenant_client_records r
    where r.tenant_stable_id = v_stable and r.store = p_store and r.removed_at is null
      and (p_before is null or r.captured_at < p_before)
    order by r.captured_at desc, r.record_id desc limit v_limit) page), '[]'::jsonb);
end;
$$;

-- Every live record id and hash for one store and tenant, for parity.
create function public.read_tenant_client_record_digests(p_tenant_id text, p_store text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'client_record_unknown_tenant'; end if;
  return coalesce((select jsonb_object_agg(record_id, payload_hash) from public.tenant_client_records
    where tenant_stable_id = v_stable and store = p_store and removed_at is null), '{}'::jsonb);
end;
$$;

create function public.record_client_record_parity(
  p_store text, p_tenant_id text, p_redis_count integer, p_postgres_count integer, p_missing integer, p_mismatched integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_ok boolean;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'client_record_unknown_tenant'; end if;
  if least(p_redis_count, p_postgres_count, p_missing, p_mismatched) < 0 then raise exception 'client_record_invalid'; end if;
  v_ok := p_missing = 0 and p_mismatched = 0;
  insert into public.tenant_client_record_parity(store, tenant_stable_id, checked_on, ok, redis_count, postgres_count, missing, mismatched)
    values (p_store, v_stable, (clock_timestamp() at time zone 'UTC')::date, v_ok, p_redis_count, p_postgres_count, p_missing, p_mismatched)
    on conflict (store, tenant_stable_id, checked_on) do update set checked_at = clock_timestamp(), ok = excluded.ok,
      redis_count = excluded.redis_count, postgres_count = excluded.postgres_count,
      missing = excluded.missing, mismatched = excluded.mismatched;
  return jsonb_build_object('ok', v_ok, 'checkedOn', (clock_timestamp() at time zone 'UTC')::date);
end;
$$;

-- Consecutive UTC days, ending today or yesterday, on which the store was
-- checked and every tenant checked that day was in parity. A read flips only
-- at 7 or more.
create function public.client_record_parity_streak(p_store text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_day date := (clock_timestamp() at time zone 'UTC')::date; v_days integer := 0; v_ok boolean; v_last_failure date;
begin
  select max(checked_on) into v_last_failure from public.tenant_client_record_parity where store = p_store and not ok;
  select bool_and(ok) into v_ok from public.tenant_client_record_parity where store = p_store and checked_on = v_day;
  if v_ok is null then v_day := v_day - 1; end if;
  loop
    select bool_and(ok) into v_ok from public.tenant_client_record_parity where store = p_store and checked_on = v_day;
    exit when v_ok is distinct from true;
    v_days := v_days + 1;
    v_day := v_day - 1;
    exit when v_days >= 366;
  end loop;
  return jsonb_build_object('store', p_store, 'days', v_days, 'lastFailureOn', v_last_failure);
end;
$$;

create function public.tenant_client_records_on_link() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.tenant_stable_id is not null then
    update public.tenant_client_records set workspace_id = new.workspace_id
      where tenant_stable_id = new.tenant_stable_id and workspace_id is distinct from new.workspace_id;
  end if;
  return new;
end;
$$;

create function public.tenant_client_records_on_unlink() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.tenant_stable_id is not null then
    update public.tenant_client_records set workspace_id = null
      where tenant_stable_id = old.tenant_stable_id and workspace_id = old.workspace_id;
  end if;
  return old;
end;
$$;

create trigger tenant_workspace_links_client_records after insert on public.tenant_workspace_links
  for each row execute function public.tenant_client_records_on_link();
create trigger tenant_workspace_links_client_records_unlink after delete on public.tenant_workspace_links
  for each row execute function public.tenant_client_records_on_unlink();

revoke all on function public.tenant_client_record_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function public.tenant_client_records_on_link() from public, anon, authenticated, service_role;
revoke all on function public.tenant_client_records_on_unlink() from public, anon, authenticated, service_role;
revoke all on function public.record_tenant_client_record(text, text, text, jsonb, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.read_tenant_client_records(text, text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.read_tenant_client_record_digests(text, text) from public, anon, authenticated;
revoke all on function public.record_client_record_parity(text, text, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.client_record_parity_streak(text) from public, anon, authenticated;
grant execute on function public.record_tenant_client_record(text, text, text, jsonb, text, timestamptz, text, text) to service_role;
grant execute on function public.read_tenant_client_records(text, text, integer, timestamptz) to service_role;
grant execute on function public.read_tenant_client_record_digests(text, text) to service_role;
grant execute on function public.record_client_record_parity(text, text, integer, integer, integer, integer) to service_role;
grant execute on function public.client_record_parity_streak(text) to service_role;
