-- One notice per Google outage and single-use, browser-bound reconnect grants.
-- No change to token reads, live writes or existing owner decisions.
begin;
set local lock_timeout = '2s';
create table public.publishing_google_outages (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.workspace_account_bindings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient text not null,
  opened_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '14 days',
  restored_at timestamptz,
  browser_hash text check (browser_hash ~ '^[a-f0-9]{64}$'),
  state_hash text check (state_hash ~ '^[a-f0-9]{64}$'),
  initiated_at timestamptz,
  consumed_at timestamptz,
  notice_status text not null default 'not_sent' check (notice_status in ('not_sent','sending','accepted','suppressed','failed')),
  provider_message_id text,
  notice_accepted_at timestamptz
);
create unique index publishing_google_outage_open_idx on public.publishing_google_outages(binding_id) where restored_at is null;
alter table public.publishing_google_outages enable row level security;
revoke all on public.publishing_google_outages from public, anon, authenticated, service_role;

create function public.publishing_google_reconnect(p_action text, p_id uuid default null, p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.workspace_account_bindings%rowtype; o public.publishing_google_outages%rowtype;
  owner jsonb; tenant text; target jsonb;
begin
  if p_action = 'list' then
    -- Close outage episodes restored by the existing session-based callback too.
    update public.publishing_google_outages x set restored_at = clock_timestamp()
      from public.workspace_account_bindings y where x.binding_id = y.id and x.restored_at is null and y.status = 'connected';
    return coalesce((select jsonb_agg(id) from (select id from public.workspace_account_bindings
      where status in ('needs_reauth','revoked') order by updated_at limit 200) q), '[]'::jsonb);
  end if;
  if p_action = 'prepare' then
    select * into b from public.workspace_account_bindings where id = p_id for update;
    if not found or b.status not in ('needs_reauth','revoked') then return null; end if;
    owner := public.resolve_business_owner_recipient(b.workspace_id);
    if owner is null or nullif(btrim(owner->>'email'),'') is null then return null; end if;
    insert into public.publishing_google_outages(binding_id, workspace_id, recipient)
      values (b.id, b.workspace_id, lower(btrim(owner->>'email')))
      on conflict (binding_id) where restored_at is null do nothing;
    select * into o from public.publishing_google_outages where binding_id = b.id and restored_at is null for update;
  else
    select * into o from public.publishing_google_outages where id = p_id;
    if not found then return null; end if;
    select * into b from public.workspace_account_bindings where id = o.binding_id for update;
    if not found then return null; end if;
    select * into o from public.publishing_google_outages where id = p_id for update;
    if not found then return null; end if;
    owner := public.resolve_business_owner_recipient(b.workspace_id);
  end if;
  if p_action = 'restored' then
    if b.status <> 'connected' or o.consumed_at is null then return null; end if;
    update public.publishing_google_outages set restored_at = clock_timestamp() where id = o.id;
    return jsonb_build_object('restored', true);
  end if;
  if o.restored_at is not null or o.expires_at <= clock_timestamp() or b.status not in ('needs_reauth','revoked')
    or owner is null or lower(btrim(owner->>'email')) is distinct from o.recipient then return null; end if;
  select id into tenant from public.tenants where stable_id = b.origin_tenant_stable_id;
  target := jsonb_build_object('id',o.id,'bindingId',b.id,'workspaceId',b.workspace_id,
    'tenantId',tenant,'tenantStableId',b.origin_tenant_stable_id,'recipient',o.recipient,
    'openedAt',o.opened_at,'expiresAt',o.expires_at,'noticeStatus',o.notice_status);
  if p_action in ('prepare','read') then return target; end if;
  if p_action = 'begin' then
    if o.initiated_at is not null or o.consumed_at is not null then return null; end if;
    if coalesce(p_input->>'browserHash','') !~ '^[a-f0-9]{64}$' or coalesce(p_input->>'stateHash','') !~ '^[a-f0-9]{64}$' then raise exception 'publishing_reconnect_invalid'; end if;
    update public.publishing_google_outages set browser_hash = p_input->>'browserHash', state_hash = p_input->>'stateHash', initiated_at = clock_timestamp() where id = o.id;
    return target;
  end if;
  if p_action = 'consume' then
    if o.consumed_at is not null or o.initiated_at is null or o.initiated_at < clock_timestamp() - interval '10 minutes'
      or o.browser_hash is distinct from p_input->>'browserHash' or o.state_hash is distinct from p_input->>'stateHash' then return null; end if;
    update public.publishing_google_outages set consumed_at = clock_timestamp() where id = o.id;
    return target;
  end if;
  if p_action = 'notice_claim' then
    if o.notice_status not in ('not_sent','suppressed') then return null; end if;
    update public.publishing_google_outages set notice_status = 'sending' where id = o.id;
    return target;
  end if;
  if p_action = 'notice' then
    if o.notice_status = 'accepted' then return target; end if;
    update public.publishing_google_outages set notice_status = p_input->>'status',
      provider_message_id = p_input->>'providerMessageId',
      notice_accepted_at = case when p_input->>'status' = 'accepted' then clock_timestamp() else null end
      where id = o.id;
    return target;
  end if;
  raise exception 'publishing_reconnect_invalid';
end;
$$;
revoke all on function public.publishing_google_reconnect(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.publishing_google_reconnect(text,uuid,jsonb) to service_role;
commit;
