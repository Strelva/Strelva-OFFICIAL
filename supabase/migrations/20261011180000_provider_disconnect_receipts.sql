begin;

-- A receipt records the provider response separately from local cleanup. It
-- contains no token, provider response body, or credential-bearing URL.
create table public.provider_disconnect_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid,
  workspace_id uuid,
  actor_user_id uuid,
  provider text not null check (provider in ('google', 'instagram', 'yelp', 'calendly', 'vegaro', 'outlook')),
  connection_source text not null check (connection_source in ('tenant_connection', 'calendar_connection')),
  revocation_outcome text not null check (revocation_outcome in (
    'revoked', 'already_revoked', 'failed', 'partial_failure', 'unsupported', 'consent_remains', 'no_token', 'not_attempted')),
  revocation_error_code text check (revocation_error_code is null or revocation_error_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  local_cleanup_status text not null check (local_cleanup_status in ('complete', 'partial')),
  cleared_stores text[] not null default '{}'::text[] check (
    cardinality(cleared_stores) <= 8 and array_position(cleared_stores, null) is null),
  created_at timestamptz not null default clock_timestamp(),
  check (tenant_stable_id is not null or workspace_id is not null)
);
create index provider_disconnect_receipts_tenant_idx
  on public.provider_disconnect_receipts (tenant_stable_id, created_at desc) where tenant_stable_id is not null;
create index provider_disconnect_receipts_workspace_idx
  on public.provider_disconnect_receipts (workspace_id, created_at desc) where workspace_id is not null;
alter table public.provider_disconnect_receipts enable row level security;
revoke all on table public.provider_disconnect_receipts from public, anon, authenticated, service_role;

-- Tenant-owned Redis credentials and any matching Google Business Profile
-- bindings are cleared in one trusted call; the receipt commits with them.
create function public.record_tenant_provider_disconnect(
  p_tenant_id text,
  p_provider text,
  p_actor_user_id uuid,
  p_revocation_outcome text,
  p_revocation_error_code text,
  p_local_cleanup_status text,
  p_cleared_stores text[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_workspace uuid;
  v_binding_count integer := 0;
  v_tenant_token_count integer := 0;
  v_provider_connection jsonb;
  v_receipt public.provider_disconnect_receipts%rowtype;
  v_stores text[] := coalesce(p_cleared_stores, '{}'::text[]);
  v_cleanup_status text := p_local_cleanup_status;
  v_connection_record_count integer := 0;
begin
  if p_provider is null or p_provider not in ('google', 'instagram', 'yelp', 'calendly', 'vegaro')
    or p_revocation_outcome is null or p_revocation_outcome not in (
      'revoked', 'already_revoked', 'failed', 'partial_failure', 'unsupported', 'consent_remains', 'no_token', 'not_attempted')
    or p_local_cleanup_status is null or p_local_cleanup_status not in ('complete', 'partial')
    or (p_revocation_error_code is not null and p_revocation_error_code !~ '^[a-z][a-z0-9_]{0,79}$')
    or cardinality(v_stores) > 8 or array_position(v_stores, null) is not null then
    raise exception 'provider_disconnect_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'provider_disconnect_tenant_not_found'; end if;
  select workspace_id into v_workspace from public.tenant_workspace_links where tenant_stable_id = v_stable;

  -- The client-record move mirrors encrypted provider credentials into
  -- tenant_client_records. Use its ordering-aware removal to stop delayed
  -- mirror repairs from restoring a disconnected grant, then scrub the
  -- ciphertext from the retained tombstone.
  v_provider_connection := public.record_tenant_client_record(
    p_tenant_id, 'provider_connections', p_provider, null, null, clock_timestamp(), 'dual_write', 'remove'
  );
  if v_provider_connection->>'status' = 'kept' then
    -- A newer provider connection landed after this disconnect began. Keep it
    -- intact and surface that local cleanup was incomplete.
    v_cleanup_status := 'partial';
  else
    update public.tenant_client_records set
      payload = '{}'::jsonb,
      payload_hash = repeat('0', 64),
      updated_at = clock_timestamp()
    where tenant_stable_id = v_stable and store = 'provider_connections' and record_id = p_provider
      and removed_at is not null;
    get diagnostics v_connection_record_count = row_count;
    if v_connection_record_count > 0 then
      v_stores := array_append(v_stores, 'provider_connections');
    end if;
  end if;

  if p_provider = 'google' then
    update public.workspace_account_bindings set
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      token_expires_at = null,
      status = 'revoked',
      last_error = null,
      updated_at = clock_timestamp()
    where provider = 'google'
      and (origin_tenant_stable_id = v_stable
        or (origin_tenant_stable_id is null and v_workspace is not null and workspace_id = v_workspace));
    get diagnostics v_binding_count = row_count;
    if v_binding_count > 0 then
      v_stores := array_append(v_stores, 'workspace_account_bindings');
    end if;
  elsif p_provider = 'instagram' then
    -- The older tenant model still has an independently encrypted Instagram
    -- token in Postgres, outside the Redis connection record.
    update public.tenants set instagram_access_token = null, updated_at = clock_timestamp()
    where id = p_tenant_id and instagram_access_token is not null;
    get diagnostics v_tenant_token_count = row_count;
    if v_tenant_token_count > 0 then
      v_stores := array_append(v_stores, 'tenant.instagram_access_token');
    end if;
  end if;

  insert into public.provider_disconnect_receipts (
    tenant_stable_id, workspace_id, actor_user_id, provider, connection_source,
    revocation_outcome, revocation_error_code, local_cleanup_status, cleared_stores
  ) values (
    v_stable, case when v_binding_count > 0 then v_workspace else null end, p_actor_user_id,
    p_provider, 'tenant_connection', p_revocation_outcome, p_revocation_error_code,
    v_cleanup_status, v_stores
  ) returning * into v_receipt;

  return jsonb_build_object(
    'id', v_receipt.id,
    'revocationOutcome', v_receipt.revocation_outcome,
    'revocationErrorCode', v_receipt.revocation_error_code,
    'localCleanupStatus', v_receipt.local_cleanup_status,
    'clearedStores', to_jsonb(v_receipt.cleared_stores)
  );
end;
$$;

revoke all on function public.record_tenant_provider_disconnect(text, text, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_tenant_provider_disconnect(text, text, uuid, text, text, text, text[]) to service_role;

-- Workspace calendar disconnect revokes remotely first on a best-effort basis,
-- then clears both local credentials and writes the receipt transactionally.
create function public.disconnect_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text,
  p_revocation_outcome text,
  p_revocation_error_code text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_changed integer;
  v_receipt public.provider_disconnect_receipts%rowtype;
  v_stores text[] := '{}'::text[];
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'manage_calendar');
  if p_provider is null or p_provider not in ('google', 'outlook')
    or p_revocation_outcome is null or p_revocation_outcome not in (
      'revoked', 'already_revoked', 'failed', 'partial_failure', 'unsupported', 'consent_remains', 'no_token', 'not_attempted')
    or (p_revocation_error_code is not null and p_revocation_error_code !~ '^[a-z][a-z0-9_]{0,79}$') then
    raise exception 'provider_disconnect_invalid';
  end if;
  update public.workspace_calendar_connections set
    status = 'revoked',
    access_token_ciphertext = null,
    refresh_token_ciphertext = null,
    token_expires_at = null,
    last_error = null,
    updated_at = clock_timestamp()
  where workspace_id = p_workspace_id and provider = p_provider;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then v_stores := array_append(v_stores, 'workspace_calendar_connections'); end if;

  insert into public.provider_disconnect_receipts (
    workspace_id, actor_user_id, provider, connection_source,
    revocation_outcome, revocation_error_code, local_cleanup_status, cleared_stores
  ) values (
    p_workspace_id, p_user_id, p_provider, 'calendar_connection', p_revocation_outcome,
    p_revocation_error_code, 'complete', v_stores
  ) returning * into v_receipt;

  return jsonb_build_object(
    'disconnected', v_changed > 0,
    'receiptId', v_receipt.id,
    'localCleanupStatus', v_receipt.local_cleanup_status,
    'clearedStores', to_jsonb(v_receipt.cleared_stores)
  );
end;
$$;

-- Keep older deployed app instances able to disconnect, while making their
-- missing provider result explicit instead of losing the token or audit trail.
create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.disconnect_workspace_calendar_connection(
    p_workspace_id, p_user_id, p_provider, 'not_attempted', 'revocation_not_requested');
  return coalesce((v_result->>'disconnected')::boolean, false);
end;
$$;

revoke all on function public.disconnect_workspace_calendar_connection(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.disconnect_workspace_calendar_connection(uuid, uuid, text, text, text) to service_role;
commit;
