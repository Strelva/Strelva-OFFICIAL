-- Publishing at 1.0.0 (docs/capabilities/publishing/publishing-spec-2026-10-06.md):
-- the business-level Google grant, its Google locations, and a receipt for
-- every Google write.
--
-- Additive only. It does not alter tenants, Redis, /api/v1 or any existing
-- table. It replaces exactly one existing function, system_origin_kinds(), to
-- add two origins (`google_location`, `tenant_newsletter`); every existing
-- origin keeps its meaning and its derived System id.
--
-- workspace_account_bindings
--   One OAuth grant per (business, provider, origin tenant). A business can
--   hold several linked tenants, each with its own grant, so the origin tenant
--   is part of the key. Modeled on workspace_calendar_connections. A grant
--   gives access, never authority: nothing here approves a write.
--
--   Tokens are stored only as `enc:v1:` envelopes (src/lib/crypto/secrets.ts).
--   The CHECK below refuses plaintext even if a caller forgets the
--   SECRETS_ENC_KEY guard, because encryptSecret passes plaintext through
--   when no key is set.
--
--   `scopes` null means "connected before scope tracking": callers attempt
--   the write and let Google answer (connectionHasWriteScope). It is never
--   rewritten as an empty array.
--
-- workspace_google_locations
--   The Google account and location a binding manages, per listing System or
--   Version. Today this lives only in Redis `google-meta:{tenant}`, keyed by
--   slug; here it is keyed by the binding, so a slug rename can't strand it.
--
-- google_listing_receipts
--   One row per outside write to Google: what changed, before and after, the
--   authority that allowed it, the read-back, and how to undo it. A write
--   Google accepted is never made retryable again: posted, posted_unverified
--   and held_by_google can only move forward (AGENTS.md "Outside writes").
--   An auto-policy write is legal only for a review reply to a 3-star or
--   better review; 1 and 2 star replies always go to the owner.
--
-- Access. RLS on, every table privilege revoked. Service-role security-definer
-- functions only. The one actor-facing read (read_business_publishing)
-- rechecks the actor with system_actor_scope and never returns a token.

create table public.workspace_account_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('google')),
  subject text check (subject is null or char_length(btrim(subject)) between 1 and 255),
  origin_tenant_stable_id uuid references public.tenants(stable_id) on delete cascade,
  scopes text[] check (scopes is null or (cardinality(scopes) <= 40 and array_position(scopes, null) is null)),
  refresh_token_ciphertext text check (refresh_token_ciphertext is null
    or refresh_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  access_token_ciphertext text check (access_token_ciphertext is null
    or access_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'revoked', 'error')),
  last_checked_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  migrated_from text not null check (migrated_from in ('redis', 'oauth')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, provider, origin_tenant_stable_id)
);
-- A business-level grant with no origin tenant (a new business): one per provider.
create unique index workspace_account_bindings_no_origin_idx
  on public.workspace_account_bindings (workspace_id, provider) where origin_tenant_stable_id is null;
create index workspace_account_bindings_tenant_idx
  on public.workspace_account_bindings (origin_tenant_stable_id, provider) where origin_tenant_stable_id is not null;

create table public.workspace_google_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  binding_id uuid not null,
  account_id text not null check (account_id ~ '^accounts/[A-Za-z0-9_-]{1,64}$'),
  location_id text not null check (location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title text check (title is null or char_length(btrim(title)) between 1 and 200),
  is_primary boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (binding_id, workspace_id) references public.workspace_account_bindings(id, workspace_id) on delete cascade,
  unique (binding_id, location_id)
);
create unique index workspace_google_locations_primary_idx
  on public.workspace_google_locations (binding_id) where is_primary;

create table public.google_listing_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  binding_id uuid,
  location_id text not null check (location_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  action text not null check (action in (
    'reply_post', 'reply_update', 'reply_delete', 'hours_patch', 'info_patch', 'post_create', 'post_delete')),
  target_ref text check (target_ref is null or char_length(target_ref) between 1 and 300),
  status text not null default 'posting' check (status in (
    'posting', 'posted', 'posted_unverified', 'held_by_google', 'failed', 'undone')),
  authority jsonb not null check (jsonb_typeof(authority) = 'object'
    and authority->>'kind' in ('owner_approval', 'operator_instruction', 'auto_reply_policy', 'owner_undo', 'operator_undo')
    and octet_length(authority::text) <= 4000),
  before_state jsonb check (before_state is null or octet_length(before_state::text) <= 64000),
  after_state jsonb check (after_state is null or octet_length(after_state::text) <= 64000),
  readback text check (readback is null or readback in ('matched', 'differs', 'failed', 'held_by_google')),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 300),
  undo jsonb check (undo is null or (jsonb_typeof(undo) = 'object' and undo->>'kind' in ('delete_reply', 'restore_reply', 'delete_post', 'patch_snapshot'))),
  undoes_receipt_id uuid references public.google_listing_receipts(id) on delete set null,
  undone_by_receipt_id uuid references public.google_listing_receipts(id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 256),
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key),
  foreign key (binding_id, workspace_id) references public.workspace_account_bindings(id, workspace_id) on delete set null (binding_id),
  -- Only a review reply to a 3-star or better review may post on policy.
  check (authority->>'kind' <> 'auto_reply_policy' or (action = 'reply_post'
    and (authority->>'rating') ~ '^[3-5]$')),
  check ((status = 'undone') = (undone_by_receipt_id is not null))
);
create index google_listing_receipts_workspace_idx on public.google_listing_receipts (workspace_id, created_at desc, id);
create index google_listing_receipts_binding_idx on public.google_listing_receipts (binding_id, created_at desc) where binding_id is not null;

alter table public.workspace_account_bindings enable row level security;
alter table public.workspace_google_locations enable row level security;
alter table public.google_listing_receipts enable row level security;
revoke all on public.workspace_account_bindings, public.workspace_google_locations, public.google_listing_receipts
  from public, anon, authenticated, service_role;

-- A Google write that was accepted stays accepted. Only forward moves.
create function public.google_listing_receipt_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.workspace_id <> old.workspace_id or new.action <> old.action
    or new.idempotency_key <> old.idempotency_key or new.authority <> old.authority
    or new.location_id <> old.location_id or new.created_at <> old.created_at
    or new.undoes_receipt_id is distinct from old.undoes_receipt_id then
    raise exception 'google_receipt_immutable';
  end if;
  if old.status <> new.status and not (
    (old.status = 'posting' and new.status in ('posted', 'posted_unverified', 'held_by_google', 'failed'))
    or (old.status in ('posted_unverified', 'held_by_google') and new.status in ('posted', 'undone'))
    or (old.status = 'posted_unverified' and new.status = 'held_by_google')
    or (old.status = 'held_by_google' and new.status = 'posted_unverified')
    or (old.status = 'posted' and new.status = 'undone')
  ) then
    raise exception 'google_receipt_transition_invalid';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger google_listing_receipt_guard before update on public.google_listing_receipts
  for each row execute function public.google_listing_receipt_guard();

-- Two more ways an existing thing becomes a System. Same id rule
-- (system_origin_id); the earlier three are unchanged.
create or replace function public.system_origin_kinds() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['saved_work','tenant','inquiry_workspace','google_location','tenant_newsletter']::text[]
$$;

-- ---- helpers ----

create function public.account_binding_json(b public.workspace_account_bindings, p_with_secrets boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', b.id, 'workspaceId', b.workspace_id, 'provider', b.provider, 'subject', b.subject,
    'originTenantStableId', b.origin_tenant_stable_id,
    'originTenantId', (select t.id from public.tenants t where t.stable_id = b.origin_tenant_stable_id),
    'scopes', case when b.scopes is null then 'null'::jsonb else to_jsonb(b.scopes) end,
    'tokenExpiresAt', b.token_expires_at, 'status', b.status, 'lastCheckedAt', b.last_checked_at,
    'lastError', b.last_error, 'migratedFrom', b.migrated_from, 'createdAt', b.created_at, 'updatedAt', b.updated_at,
    'locations', coalesce((select jsonb_agg(jsonb_build_object('accountId', l.account_id, 'locationId', l.location_id,
        'title', l.title, 'isPrimary', l.is_primary) order by l.is_primary desc, l.created_at, l.id)
      from public.workspace_google_locations l where l.binding_id = b.id), '[]'::jsonb))
  || case when p_with_secrets then jsonb_build_object(
    'refreshTokenCiphertext', b.refresh_token_ciphertext, 'accessTokenCiphertext', b.access_token_ciphertext)
    else '{}'::jsonb end
$$;

create function public.google_listing_receipt_json(r public.google_listing_receipts) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', r.id, 'workspaceId', r.workspace_id, 'bindingId', r.binding_id,
    'locationId', r.location_id, 'action', r.action, 'targetRef', r.target_ref, 'status', r.status,
    'authority', r.authority, 'before', r.before_state, 'after', r.after_state, 'readback', r.readback,
    'providerRef', r.provider_ref, 'undo', r.undo, 'undoesReceiptId', r.undoes_receipt_id,
    'undoneByReceiptId', r.undone_by_receipt_id, 'idempotencyKey', r.idempotency_key, 'error', r.error,
    'createdAt', r.created_at, 'updatedAt', r.updated_at, 'completedAt', r.completed_at)
$$;

create function public.account_binding_ciphertext_valid(p_value text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_value is null or p_value ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
$$;

-- ---- service-role writes ----

-- Record a Google grant for a business. p_mode:
--   'copy'  the Redis copy: inserts when missing, and never overwrites a row
--           that already exists (a reconnect may have written fresher tokens).
--   'oauth' a (re)connect: inserts or replaces the tokens, scopes and status.
-- The origin tenant must be linked to this business (tenant_workspace_links);
-- a grant is never filed under another business.
create function public.upsert_workspace_account_binding(p_input jsonb, p_mode text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace uuid;
  v_tenant uuid;
  v_linked uuid;
  v_scopes text[];
  v_existing public.workspace_account_bindings%rowtype;
  v_row public.workspace_account_bindings%rowtype;
begin
  if p_mode is null or p_mode not in ('copy', 'oauth') then raise exception 'account_binding_invalid'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','provider','originTenantStableId','subject','scopes','refreshTokenCiphertext',
      'accessTokenCiphertext','tokenExpiresAt','status','lastError']::text[]) <> '{}'::jsonb
    or p_input->>'provider' is distinct from 'google'
    or jsonb_typeof(p_input->'workspaceId') is distinct from 'string'
    or (p_input ? 'scopes' and jsonb_typeof(p_input->'scopes') not in ('array', 'null'))
    or (p_input->>'status') not in ('connected', 'needs_reauth', 'revoked', 'error') then
    raise exception 'account_binding_invalid';
  end if;
  if not public.account_binding_ciphertext_valid(p_input->>'refreshTokenCiphertext')
    or not public.account_binding_ciphertext_valid(p_input->>'accessTokenCiphertext') then
    raise exception 'account_binding_plaintext_refused';
  end if;
  begin
    v_workspace := (p_input->>'workspaceId')::uuid;
    v_tenant := (p_input->>'originTenantStableId')::uuid;
  exception when others then
    raise exception 'account_binding_invalid';
  end;
  if not exists (select 1 from public.workspaces w where w.id = v_workspace and w.kind = 'customer') then
    raise exception 'account_binding_workspace_unknown';
  end if;
  if v_tenant is not null then
    select workspace_id into v_linked from public.tenant_workspace_links where tenant_stable_id = v_tenant;
    if v_linked is distinct from v_workspace then raise exception 'account_binding_tenant_not_linked'; end if;
  end if;
  if jsonb_typeof(p_input->'scopes') = 'array' then
    select coalesce(array_agg(value order by ordinality), '{}') into v_scopes
      from jsonb_array_elements_text(p_input->'scopes') with ordinality;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ':google:' || coalesce(v_tenant::text, '-'), 9107));
  select * into v_existing from public.workspace_account_bindings
    where workspace_id = v_workspace and provider = 'google' and origin_tenant_stable_id is not distinct from v_tenant;
  if found and p_mode = 'copy' then
    return jsonb_build_object('status', 'exists', 'id', v_existing.id);
  end if;
  if found then
    update public.workspace_account_bindings set
      subject = coalesce(p_input->>'subject', subject),
      scopes = v_scopes,
      refresh_token_ciphertext = coalesce(p_input->>'refreshTokenCiphertext', refresh_token_ciphertext),
      access_token_ciphertext = p_input->>'accessTokenCiphertext',
      token_expires_at = (p_input->>'tokenExpiresAt')::timestamptz,
      status = p_input->>'status',
      last_error = left(p_input->>'lastError', 500),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
    where id = v_existing.id returning * into v_row;
    return jsonb_build_object('status', 'updated', 'id', v_row.id);
  end if;
  insert into public.workspace_account_bindings(workspace_id, provider, subject, origin_tenant_stable_id, scopes,
    refresh_token_ciphertext, access_token_ciphertext, token_expires_at, status, last_error, migrated_from)
  values (v_workspace, 'google', p_input->>'subject', v_tenant, v_scopes,
    p_input->>'refreshTokenCiphertext', p_input->>'accessTokenCiphertext', (p_input->>'tokenExpiresAt')::timestamptz,
    p_input->>'status', left(p_input->>'lastError', 500), case when p_mode = 'copy' then 'redis' else 'oauth' end)
  returning * into v_row;
  return jsonb_build_object('status', 'created', 'id', v_row.id);
end;
$$;

-- Store a freshly minted access token (and a rotated refresh token, when
-- Google sends one). Never clears the refresh token.
create function public.update_workspace_account_binding_tokens(
  p_binding_id uuid, p_access_ciphertext text, p_expires_at timestamptz, p_refresh_ciphertext text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.account_binding_ciphertext_valid(p_access_ciphertext)
    or not public.account_binding_ciphertext_valid(p_refresh_ciphertext) then
    raise exception 'account_binding_plaintext_refused';
  end if;
  update public.workspace_account_bindings set
    access_token_ciphertext = p_access_ciphertext,
    token_expires_at = p_expires_at,
    refresh_token_ciphertext = coalesce(p_refresh_ciphertext, refresh_token_ciphertext),
    updated_at = clock_timestamp()
  where id = p_binding_id;
  if not found then raise exception 'account_binding_not_found'; end if;
end;
$$;

-- Health of the grant: connected after a good read, needs_reauth after a dead
-- refresh token, revoked, or error. Never touches tokens.
create function public.set_workspace_account_binding_status(
  p_binding_id uuid, p_status text, p_error text, p_checked_at timestamptz
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status is null or p_status not in ('connected', 'needs_reauth', 'revoked', 'error') then
    raise exception 'account_binding_invalid';
  end if;
  update public.workspace_account_bindings set status = p_status, last_error = left(p_error, 500),
    last_checked_at = coalesce(p_checked_at, clock_timestamp()), updated_at = clock_timestamp()
  where id = p_binding_id;
  if not found then raise exception 'account_binding_not_found'; end if;
end;
$$;

-- The Google location a binding manages. The newest selection is primary.
create function public.upsert_workspace_google_location(
  p_binding_id uuid, p_account_id text, p_location_id text, p_title text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_binding public.workspace_account_bindings%rowtype; v_id uuid;
begin
  select * into v_binding from public.workspace_account_bindings where id = p_binding_id for update;
  if not found then raise exception 'account_binding_not_found'; end if;
  if p_account_id is null or p_account_id !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
    or p_location_id is null or p_location_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'account_binding_invalid';
  end if;
  update public.workspace_google_locations set is_primary = false, updated_at = clock_timestamp()
    where binding_id = p_binding_id and location_id <> p_location_id and is_primary;
  insert into public.workspace_google_locations(workspace_id, binding_id, account_id, location_id, title, is_primary)
  values (v_binding.workspace_id, p_binding_id, p_account_id, p_location_id, nullif(btrim(left(p_title, 200)), ''), true)
  on conflict (binding_id, location_id) do update set account_id = excluded.account_id,
    title = coalesce(excluded.title, workspace_google_locations.title), is_primary = true, updated_at = clock_timestamp()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'bindingId', p_binding_id, 'workspaceId', v_binding.workspace_id);
end;
$$;

-- The grant for one tenant (by current slug), with its tokens. Service only:
-- the token adapter reads this before falling back to Redis.
create function public.read_google_binding_for_tenant(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_workspace uuid; b public.workspace_account_bindings%rowtype;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return null; end if;
  select workspace_id into v_workspace from public.tenant_workspace_links where tenant_stable_id = v_stable;
  if v_workspace is null then return null; end if;
  select * into b from public.workspace_account_bindings
    where workspace_id = v_workspace and provider = 'google' and origin_tenant_stable_id = v_stable;
  if not found then return null; end if;
  return public.account_binding_json(b, true);
end;
$$;

-- Where a tenant's Google grant would be filed: its workspace and stable id.
-- Null when the tenant is not linked to a business yet.
create function public.read_tenant_binding_target(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('tenantStableId', t.stable_id, 'workspaceId', l.workspace_id)
  from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
  where t.id = p_tenant_id
$$;

-- Record one Google write before it is sent. Idempotent by key: a replay
-- returns the existing receipt and never a second write.
create function public.record_google_listing_receipt(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype; v_workspace uuid; v_binding uuid; v_undoes uuid;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['workspaceId','bindingId','locationId','action','targetRef','authority','before','after',
      'undo','undoesReceiptId','idempotencyKey']::text[]) <> '{}'::jsonb then
    raise exception 'google_receipt_invalid';
  end if;
  begin
    v_workspace := (p_input->>'workspaceId')::uuid;
    v_binding := (p_input->>'bindingId')::uuid;
    v_undoes := (p_input->>'undoesReceiptId')::uuid;
  exception when others then raise exception 'google_receipt_invalid';
  end;
  if v_binding is not null and not exists (select 1 from public.workspace_account_bindings
      where id = v_binding and workspace_id = v_workspace) then
    raise exception 'account_binding_not_found';
  end if;
  if v_undoes is not null and not exists (select 1 from public.google_listing_receipts
      where id = v_undoes and workspace_id = v_workspace) then
    raise exception 'google_receipt_not_found';
  end if;
  select * into r from public.google_listing_receipts
    where workspace_id = v_workspace and idempotency_key = p_input->>'idempotencyKey';
  if found then
    return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', true);
  end if;
  insert into public.google_listing_receipts(workspace_id, binding_id, location_id, action, target_ref, authority,
    before_state, after_state, undo, undoes_receipt_id, idempotency_key)
  values (v_workspace, v_binding, p_input->>'locationId', p_input->>'action', p_input->>'targetRef', p_input->'authority',
    p_input->'before', p_input->'after', case when jsonb_typeof(p_input->'undo') = 'object' then p_input->'undo' end,
    v_undoes, p_input->>'idempotencyKey')
  returning * into r;
  return public.google_listing_receipt_json(r) || jsonb_build_object('replayed', false);
end;
$$;

-- Settle a receipt: the provider's answer and the read-back. When it settles
-- an undo, the receipt it undoes is marked undone in the same transaction.
create function public.settle_google_listing_receipt(p_receipt_id uuid, p_workspace_id uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['status','readback','after','providerRef','error','undo']::text[]) <> '{}'::jsonb
    or (p_input->>'status') not in ('posted', 'posted_unverified', 'held_by_google', 'failed') then
    raise exception 'google_receipt_invalid';
  end if;
  select * into r from public.google_listing_receipts where id = p_receipt_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'google_receipt_not_found'; end if;
  update public.google_listing_receipts set
    status = p_input->>'status',
    readback = p_input->>'readback',
    after_state = coalesce(p_input->'after', after_state),
    provider_ref = coalesce(p_input->>'providerRef', provider_ref),
    error = left(p_input->>'error', 500),
    undo = case when p_input ? 'undo' then
      case when jsonb_typeof(p_input->'undo') = 'object' then p_input->'undo' end else undo end,
    completed_at = clock_timestamp()
  where id = r.id returning * into r;
  if r.undoes_receipt_id is not null and r.status in ('posted', 'posted_unverified', 'held_by_google') then
    update public.google_listing_receipts set status = 'undone', undone_by_receipt_id = r.id
      where id = r.undoes_receipt_id and status in ('posted', 'posted_unverified', 'held_by_google');
  end if;
  return public.google_listing_receipt_json(r);
end;
$$;

-- A later read-back that confirms or reveals what Google holds. Forward only.
create function public.confirm_google_listing_receipt(p_receipt_id uuid, p_workspace_id uuid, p_status text, p_readback text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.google_listing_receipts%rowtype;
begin
  if p_status not in ('posted', 'posted_unverified', 'held_by_google')
    or p_readback not in ('matched', 'differs', 'failed', 'held_by_google') then
    raise exception 'google_receipt_invalid';
  end if;
  update public.google_listing_receipts set status = p_status, readback = p_readback
    where id = p_receipt_id and workspace_id = p_workspace_id returning * into r;
  if not found then raise exception 'google_receipt_not_found'; end if;
  return public.google_listing_receipt_json(r);
end;
$$;

create function public.read_google_listing_receipt(p_receipt_id uuid, p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.google_listing_receipt_json(r) from public.google_listing_receipts r
  where r.id = p_receipt_id and r.workspace_id = p_workspace_id
$$;

-- ---- actor-facing read ----

-- What a business's publishing looks like, for the listing System and the
-- Strelva handled feed. A direct member of the business reads it; an agency
-- (assigned work only) reads nothing here, because the Google grant belongs
-- to the business, not to a piece of work. Never returns a token.
create function public.read_business_publishing(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  if v.work_ids is not null then
    return jsonb_build_object('businessId', p_workspace_id, 'scope', 'assigned', 'bindings', '[]'::jsonb, 'receipts', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'scope', 'business',
    'bindings', coalesce((select jsonb_agg(public.account_binding_json(b, false) order by b.created_at, b.id)
      from public.workspace_account_bindings b where b.workspace_id = p_workspace_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(public.google_listing_receipt_json(r) order by r.created_at desc, r.id)
      from (select * from public.google_listing_receipts where workspace_id = p_workspace_id
        order by created_at desc, id limit v_limit) r), '[]'::jsonb));
end;
$$;

revoke all on function public.google_listing_receipt_guard() from public, anon, authenticated;
revoke all on function public.account_binding_json(public.workspace_account_bindings, boolean) from public, anon, authenticated, service_role;
revoke all on function public.google_listing_receipt_json(public.google_listing_receipts) from public, anon, authenticated, service_role;
revoke all on function public.account_binding_ciphertext_valid(text) from public, anon, authenticated;
revoke all on function public.upsert_workspace_account_binding(jsonb, text) from public, anon, authenticated;
revoke all on function public.update_workspace_account_binding_tokens(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.set_workspace_account_binding_status(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_workspace_google_location(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.read_google_binding_for_tenant(text) from public, anon, authenticated;
revoke all on function public.read_tenant_binding_target(text) from public, anon, authenticated;
revoke all on function public.record_google_listing_receipt(jsonb) from public, anon, authenticated;
revoke all on function public.settle_google_listing_receipt(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_google_listing_receipt(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.read_google_listing_receipt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.read_business_publishing(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.upsert_workspace_account_binding(jsonb, text) to service_role;
grant execute on function public.update_workspace_account_binding_tokens(uuid, text, timestamptz, text) to service_role;
grant execute on function public.set_workspace_account_binding_status(uuid, text, text, timestamptz) to service_role;
grant execute on function public.upsert_workspace_google_location(uuid, text, text, text) to service_role;
grant execute on function public.read_google_binding_for_tenant(text) to service_role;
grant execute on function public.read_tenant_binding_target(text) to service_role;
grant execute on function public.record_google_listing_receipt(jsonb) to service_role;
grant execute on function public.settle_google_listing_receipt(uuid, uuid, jsonb) to service_role;
grant execute on function public.confirm_google_listing_receipt(uuid, uuid, text, text) to service_role;
grant execute on function public.read_google_listing_receipt(uuid, uuid) to service_role;
grant execute on function public.read_business_publishing(uuid, uuid, text, integer) to service_role;
