-- Wave 6: finish the Redis exit using the existing stable-id home and adapters.
set lock_timeout = '3s';
-- NOT VALID avoids validating a hot table while taking the DDL lock.
alter table public.tenant_client_records drop constraint tenant_client_records_store_check;
alter table public.tenant_client_records add constraint tenant_client_records_store_check check (store in (
  'spam_held','inquiry_timeline','inquiry_reply','booking_config','account_grouping',
  'orders','provider_connections','provider_metadata','reward_members','reward_transactions','threads','tenant_settings'
)) not valid;

-- Encryption is enforced by Postgres too. NOT VALID permits the additive
-- deploy without scanning the hot table; every new secret-bearing row must
-- carry the existing AES-GCM envelope from crypto/secrets.ts.
alter table public.tenant_client_records add constraint tenant_client_records_provider_ciphertext check (
  store<>'provider_connections' or (
    (coalesce(payload->>'accessToken','')='' or payload->>'accessToken' like 'enc:v1:%') and
    (coalesce(payload->>'refreshToken','')='' or payload->>'refreshToken' like 'enc:v1:%') and
    (coalesce(payload->>'apiKey','')='' or payload->>'apiKey' like 'enc:v1:%')
  )
) not valid;

-- Keyset pagination retains sub-millisecond timestamps and the record-id tie
-- breaker, so even >1000 records captured together survive cache expiry.
create function public.read_tenant_client_records_page(
  p_tenant_id text, p_store text, p_limit integer, p_before timestamptz, p_after_record_id text
) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(item order by captured_at desc, record_id desc), '[]'::jsonb) from (
    select r.captured_at, r.record_id, jsonb_build_object('recordId',r.record_id,'payload',r.payload,
      'capturedAt',r.captured_at::text) as item
    from public.tenant_client_records r join public.tenants t on t.stable_id=r.tenant_stable_id
    where t.id=p_tenant_id and r.store=p_store and r.removed_at is null
      and (p_before is null or (r.captured_at,r.record_id)<(p_before,p_after_record_id))
    order by r.captured_at desc,r.record_id desc limit least(greatest(coalesce(p_limit,1000),1),1000)
  ) page
$$;
revoke all on function public.read_tenant_client_records_page(text,text,integer,timestamptz,text) from public,anon,authenticated;
grant execute on function public.read_tenant_client_records_page(text,text,integer,timestamptz,text) to service_role;

-- Parity covers every current tenant, not a green subset of tenants. A newly
-- added tenant requires its own seven daily samples before this store flips.
create or replace function public.client_record_parity_streak(p_store text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date := (clock_timestamp() at time zone 'UTC')::date; v_days integer := 0; v_ok boolean;
begin
  select not exists(select 1 from public.tenants t where not exists(select 1 from public.tenant_client_record_parity p
    where p.tenant_stable_id=t.stable_id and p.store=p_store and p.checked_on=v_day and p.ok))
    and exists(select 1 from public.tenants) into v_ok;
  if not v_ok then
    if exists(select 1 from public.tenant_client_record_parity where store=p_store and checked_on=v_day) then
      return jsonb_build_object('store',p_store,'days',0);
    end if;
    v_day := v_day-1;
  end if;
  loop
    select not exists(select 1 from public.tenants t where not exists(select 1 from public.tenant_client_record_parity p
      where p.tenant_stable_id=t.stable_id and p.store=p_store and p.checked_on=v_day and p.ok))
      and exists(select 1 from public.tenants) into v_ok;
    exit when not v_ok;
    v_days := v_days+1; v_day := v_day-1;
    exit when v_days>=366;
  end loop;
  return jsonb_build_object('store',p_store,'days',v_days);
end $$;

-- Calendly reverse keys are rebuildable caches. A flipped metadata store can
-- resolve the webhook even after the reverse key and original meta expire.
create function public.find_client_calendly_tenant(p_user_uri text) returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select t.id from public.tenant_client_records r join public.tenants t on t.stable_id=r.tenant_stable_id
    where r.store='provider_metadata' and r.record_id='calendly' and r.removed_at is null
      and r.payload->'value'->>'userUri'=p_user_uri
    order by r.updated_at desc limit 1
$$;
revoke all on function public.find_client_calendly_tenant(text) from public,anon,authenticated;
grant execute on function public.find_client_calendly_tenant(text) to service_role;

-- An older failed dual write/backfill cannot replay over a newer update.
create or replace function public.record_tenant_client_record(
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
  if p_captured_at < v_row.captured_at and p_mode = 'replace' then
    return jsonb_build_object('status','kept','id',v_row.id,'workspaceId',v_row.workspace_id);
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
