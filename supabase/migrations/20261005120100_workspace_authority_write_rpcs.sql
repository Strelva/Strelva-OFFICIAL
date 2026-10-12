-- Close the six workspace writes that were gated only in TypeScript.
--
-- Each of these writes reached Postgres through the service-role client with
-- the role check in a separate statement. Every function below re-checks the
-- same rule with workspace_require(), which locks the actor's membership row
-- FOR SHARE until commit, so a removal or downgrade can no longer slip between
-- the check and the write. The TypeScript checks stay in place as the first
-- gate; these are the second.
--
--   write                                   permission                 tier
--   save_workspace_calendar_connection      manage_calendar            owner/admin
--   revoke_workspace_calendar_connection    manage_calendar            owner/admin
--   mark_workspace_calendar_connection_error manage_calendar           owner/admin
--   save_workspace_calendar_event_receipt   record_calendar_receipt    member
--   revoke_workspace_delegation             manage_delegations         owner/admin (customer workspace)
--   revoke_workspace_handoff                manage_handoffs            owner/admin (agency workspace)
--   create_workspace_handoff                create_handoff             member (agency workspace only)
--   save_workspace_work                     create_work                member
--
-- Additive only. Direct service_role insert/update grants on these tables are
-- unchanged here; revoking them is a separate, later migration once the app
-- that calls these functions is deployed everywhere.
set local lock_timeout = '3s';

-- 1. Calendar connection: bind or reconfigure (one row per workspace/provider).
create or replace function public.save_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text,
  p_calendar_id text,
  p_calendar_name text,
  p_time_zone text,
  p_status text,
  p_scopes text[],
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_token_expires_at timestamptz,
  p_reminder_policy jsonb
) returns setof public.workspace_calendar_connections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'manage_calendar');
  if public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if p_status not in ('authorized', 'connected') then
    raise exception 'calendar_connection_invalid';
  end if;
  if p_access_token_ciphertext is null or btrim(p_access_token_ciphertext) = '' then
    raise exception 'calendar_connection_invalid';
  end if;
  return query
  insert into public.workspace_calendar_connections as c (
    workspace_id, provider, calendar_id, calendar_name, time_zone, status, scopes,
    access_token_ciphertext, refresh_token_ciphertext, token_expires_at, reminder_policy,
    last_error, last_checked_at, created_by, updated_at
  ) values (
    p_workspace_id, p_provider, p_calendar_id, p_calendar_name, p_time_zone, p_status,
    coalesce(p_scopes, '{}'::text[]), p_access_token_ciphertext, p_refresh_token_ciphertext,
    p_token_expires_at, coalesce(p_reminder_policy, '{"mode":"off"}'::jsonb),
    null, null, p_user_id, now()
  )
  on conflict (workspace_id, provider) do update set
    calendar_id = excluded.calendar_id,
    calendar_name = excluded.calendar_name,
    time_zone = excluded.time_zone,
    status = excluded.status,
    scopes = excluded.scopes,
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    token_expires_at = excluded.token_expires_at,
    reminder_policy = excluded.reminder_policy,
    last_error = null,
    last_checked_at = null,
    created_by = excluded.created_by,
    updated_at = excluded.updated_at
  returning c.*;
end;
$$;

-- 2. Calendar connection: disconnect. Allowed after a workspace exit so a
-- business can always remove stored credentials.
create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed integer;
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'manage_calendar');
  update public.workspace_calendar_connections
  set status = 'revoked',
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      last_error = 'Disconnected by a workspace member.',
      updated_at = now()
  where workspace_id = p_workspace_id and provider = p_provider;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- 3. Calendar connection: record a provider failure seen by a manager.
create or replace function public.mark_workspace_calendar_connection_error(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'manage_calendar');
  update public.workspace_calendar_connections
  set status = 'error',
      last_error = left(coalesce(p_message, ''), 1000),
      updated_at = now()
  where workspace_id = p_workspace_id and provider = p_provider;
end;
$$;

-- 4. Calendar event receipt: any member operating the schedule records the
-- evidence of a provider write. One receipt per work/request/provider.
create or replace function public.save_workspace_calendar_event_receipt(
  p_user_id uuid,
  p_receipt jsonb
) returns setof public.workspace_calendar_event_receipts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_workspace uuid;
  supplied_id uuid;
begin
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'calendar_receipt_invalid';
  end if;
  target_workspace := (p_receipt->>'workspace_id')::uuid;
  perform public.workspace_require(target_workspace, p_user_id, 'record_calendar_receipt');
  supplied_id := nullif(p_receipt->>'id', '')::uuid;
  return query
  insert into public.workspace_calendar_event_receipts as r (
    id, workspace_id, work_id, request_id, provider, calendar_id, idempotency_key,
    external_event_id, operation, status, revision, title, start_at, end_at, time_zone,
    reminder_policy, last_error, attempted_at, observed_at, updated_at
  ) values (
    coalesce(supplied_id, gen_random_uuid()),
    target_workspace,
    (p_receipt->>'work_id')::uuid,
    p_receipt->>'request_id',
    p_receipt->>'provider',
    p_receipt->>'calendar_id',
    p_receipt->>'idempotency_key',
    p_receipt->>'external_event_id',
    p_receipt->>'operation',
    p_receipt->>'status',
    (p_receipt->>'revision')::integer,
    p_receipt->>'title',
    (p_receipt->>'start_at')::timestamptz,
    (p_receipt->>'end_at')::timestamptz,
    p_receipt->>'time_zone',
    coalesce(p_receipt->'reminder_policy', '{"mode":"off"}'::jsonb),
    p_receipt->>'last_error',
    (p_receipt->>'attempted_at')::timestamptz,
    (p_receipt->>'observed_at')::timestamptz,
    now()
  )
  on conflict (workspace_id, work_id, request_id, provider) do update set
    id = case when supplied_id is null then r.id else excluded.id end,
    calendar_id = excluded.calendar_id,
    idempotency_key = excluded.idempotency_key,
    external_event_id = excluded.external_event_id,
    operation = excluded.operation,
    status = excluded.status,
    revision = excluded.revision,
    title = excluded.title,
    start_at = excluded.start_at,
    end_at = excluded.end_at,
    time_zone = excluded.time_zone,
    reminder_policy = excluded.reminder_policy,
    last_error = excluded.last_error,
    attempted_at = excluded.attempted_at,
    observed_at = excluded.observed_at,
    updated_at = excluded.updated_at
  returning r.*;
end;
$$;

-- 5. Delegated read: the customer workspace's owner or admin withdraws an
-- agency's read access to one copy of work. Returns false when the delegation
-- does not exist or is no longer active.
create or replace function public.revoke_workspace_delegation(
  p_delegation_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_workspace uuid;
  changed integer;
begin
  select d.customer_workspace_id into target_workspace
  from public.workspace_delegations d where d.id = p_delegation_id;
  if target_workspace is null then return false; end if;
  perform public.workspace_require(target_workspace, p_user_id, 'manage_delegations');
  update public.workspace_delegations
  set status = 'revoked', revoked_at = now(), revoked_by = p_user_id
  where id = p_delegation_id and status = 'active';
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- 6. Handoff: the agency workspace's owner or admin cancels a pending handoff.
create or replace function public.revoke_workspace_handoff(
  p_handoff_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_workspace uuid;
  changed integer;
begin
  select h.agency_workspace_id into target_workspace
  from public.workspace_handoffs h where h.id = p_handoff_id;
  if target_workspace is null then return false; end if;
  perform public.workspace_require(target_workspace, p_user_id, 'manage_handoffs');
  update public.workspace_handoffs
  set status = 'revoked', revoked_at = now(), revoked_by = p_user_id
  where id = p_handoff_id and status = 'pending';
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- 7. Handoff: any member of an agency workspace offers a copy of its work to
-- a recipient. The pending-handoff cap trigger still applies.
create or replace function public.create_workspace_handoff(
  p_user_id uuid,
  p_source_work_id uuid,
  p_recipient_email text,
  p_token_hash text,
  p_expires_at timestamptz
) returns setof public.workspace_handoffs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_work public.saved_product_work%rowtype;
  workspace_kind text;
begin
  select * into source_work from public.saved_product_work where id = p_source_work_id;
  if not found then raise exception 'workspace_membership_required'; end if;
  perform public.workspace_require(source_work.workspace_id, p_user_id, 'create_handoff');
  select w.kind into workspace_kind from public.workspaces w where w.id = source_work.workspace_id;
  if workspace_kind is distinct from 'agency' then raise exception 'handoff_agency_only'; end if;
  if source_work.product_id = 'applications' or source_work.resource_kind = 'application' then
    raise exception 'handoff_product_unsupported';
  end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'handoff_expired'; end if;
  return query
  insert into public.workspace_handoffs as h (
    agency_workspace_id, source_work_id, recipient_email, token_hash, status, expires_at, created_by
  ) values (
    source_work.workspace_id, source_work.id, lower(btrim(p_recipient_email)), p_token_hash,
    'pending', p_expires_at, p_user_id
  )
  returning h.*;
end;
$$;

-- 8. Saved work: any member saves new work into their workspace. The cap and
-- workspace-exit triggers on saved_product_work still apply. Other RPCs that
-- insert saved work (handoff acceptance, imports, standing work) keep their
-- own authority checks; this function covers the direct app path only.
create or replace function public.save_workspace_work(
  p_workspace_id uuid,
  p_user_id uuid,
  p_product_id text,
  p_resource_kind text,
  p_title text,
  p_payload jsonb,
  p_input jsonb,
  p_source_work_id uuid
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'create_work');
  if p_payload is null then raise exception 'saved_work_invalid'; end if;
  return query
  insert into public.saved_product_work as w (
    workspace_id, product_id, resource_kind, title, payload, input, source_work_id, created_by
  ) values (
    p_workspace_id, p_product_id, p_resource_kind, p_title, p_payload, p_input, p_source_work_id, p_user_id
  )
  returning w.*;
end;
$$;

revoke all on function public.save_workspace_calendar_connection(uuid, uuid, text, text, text, text, text, text[], text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.revoke_workspace_calendar_connection(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_workspace_calendar_connection_error(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.save_workspace_calendar_event_receipt(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.revoke_workspace_delegation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_workspace_handoff(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_workspace_handoff(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.save_workspace_work(uuid, uuid, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.save_workspace_calendar_connection(uuid, uuid, text, text, text, text, text, text[], text, text, timestamptz, jsonb) to service_role;
grant execute on function public.revoke_workspace_calendar_connection(uuid, uuid, text) to service_role;
grant execute on function public.mark_workspace_calendar_connection_error(uuid, uuid, text, text) to service_role;
grant execute on function public.save_workspace_calendar_event_receipt(uuid, jsonb) to service_role;
grant execute on function public.revoke_workspace_delegation(uuid, uuid) to service_role;
grant execute on function public.revoke_workspace_handoff(uuid, uuid) to service_role;
grant execute on function public.create_workspace_handoff(uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.save_workspace_work(uuid, uuid, text, text, text, jsonb, jsonb, uuid) to service_role;
