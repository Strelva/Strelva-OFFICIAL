-- Forward your inquiries (Getting started lane L5). Prepared only: no release
-- row, provider setting, DNS record or email gate is armed here.
--
-- A business keeps its own inbox and contact forms. It forwards (or BCCs, or
-- sets an auto-forward rule for) inquiry email to one unguessable Strelva
-- address. Each message that arrives there becomes an Inquiry in the one lead
-- store (tenant_leads), origin `forwarding_address_id`, recorded_via
-- `forwarded_email`. No mailbox login, no OAuth.
--
--   * One active address per business. It is revocable and rotatable; a
--     revoked address accepts nothing again. Issued by the business's owner or
--     admin, or by a staffed member of an agency that holds the inquiries
--     area (an active `agency_scope_grants` row at either level) or that added
--     the business and is still waiting for its owner's claim.
--   * Members read the address and whether anything has arrived.
--   * receive_forwarded_inquiry is service-role only. It dedupes on the
--     message key (one row per business and Message-ID) and on the same sender
--     and words within a day, and holds spam and unusual volume for review
--     with the existing held states. It never sends, replies or notifies.
--   * Gmail's forwarding confirmation is recorded on the address so the owner
--     can finish Gmail's own check; it is never an Inquiry.
-- Retention follows tenant_leads: rows stay with the business and are deleted
-- with it (the address cascades from the workspace, the rows from the address).
begin;
set local lock_timeout = '5s';

create table public.inquiry_forwarding_addresses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  local_part text not null unique check (local_part ~ '^fwd-[a-z0-9]{24}$'),
  status text not null default 'active' check (status in ('active','revoked')),
  issued_by uuid references public.users(id) on delete set null,
  issued_as text not null check (issued_as in ('owner','admin','agency')),
  agency_workspace_id uuid,
  issued_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or revoked_reason in ('revoked','rotated')),
  first_received_at timestamptz,
  last_received_at timestamptz,
  received_count integer not null default 0 check (received_count >= 0),
  provider_confirmation jsonb check (provider_confirmation is null
    or (jsonb_typeof(provider_confirmation) = 'object' and octet_length(provider_confirmation::text) <= 2000)),
  check ((status = 'revoked') = (revoked_at is not null and revoked_reason is not null)),
  check ((issued_as = 'agency') = (agency_workspace_id is not null))
);
create unique index inquiry_forwarding_one_active_idx on public.inquiry_forwarding_addresses(workspace_id) where status = 'active';
create index inquiry_forwarding_workspace_idx on public.inquiry_forwarding_addresses(workspace_id, issued_at desc);
alter table public.inquiry_forwarding_addresses enable row level security;
revoke all on public.inquiry_forwarding_addresses from public, anon, authenticated, service_role;

alter table public.tenant_leads add column forwarding_address_id uuid
  references public.inquiry_forwarding_addresses(id) on delete cascade;
alter table public.tenant_leads drop constraint tenant_leads_one_origin;
alter table public.tenant_leads add constraint tenant_leads_one_origin
  check(num_nonnulls(tenant_stable_id,connected_site_id,agent_workspace_id,forwarding_address_id)=1);
alter table public.tenant_leads drop constraint tenant_leads_recorded_via_check;
alter table public.tenant_leads add constraint tenant_leads_recorded_via_check
  check(recorded_via in ('dual_write','repair','backfill','connected_site','spam_hold','agent','forwarded_email'));
alter table public.tenant_leads add constraint tenant_leads_forwarded_shape
  check (forwarding_address_id is null or recorded_via = 'forwarded_email');
create unique index tenant_leads_forwarded_lead_idx on public.tenant_leads(workspace_id, lead_id)
  where forwarding_address_id is not null;
create index tenant_leads_forwarded_hash_idx on public.tenant_leads(workspace_id, submission_hash, captured_at)
  where forwarding_address_id is not null;

-- Forwarded and agent rows carry no inquiry_events rows: inquiry_events has
-- only tenant and connected-site origins, and its retention reads assume
-- those. Before this, releasing a held agent inquiry (agent_workspace_id,
-- 20261020090016) wrote a null-tenant event and failed
-- inquiry_events_one_origin. A held forwarded or agent row can still be
-- released, put back or confirmed as spam; intake_state_at is its record.
-- Tenant and connected-site origins are unchanged.
create or replace function public.inquiry_lead_event_write(p_lead public.tenant_leads, p_kind text, p_actor text,
  p_actor_id text, p_detail jsonb, p_dedupe text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_lead.forwarding_address_id is not null or p_lead.agent_workspace_id is not null then return false; end if;
  if p_lead.connected_site_id is null then
    return public.inquiry_event_write(p_lead.tenant_stable_id, p_lead.workspace_id, p_lead.lead_id,
      p_kind, p_actor, p_actor_id, p_detail, p_dedupe);
  end if;
  insert into public.inquiry_events(connected_site_id, workspace_id, lead_id, kind, actor, actor_id, detail, dedupe_key)
  values (p_lead.connected_site_id, p_lead.workspace_id, p_lead.lead_id, p_kind, p_actor, p_actor_id, coalesce(p_detail, '{}'::jsonb), p_dedupe)
  on conflict (connected_site_id, lead_id, dedupe_key) where connected_site_id is not null and dedupe_key is not null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Who may act on a business's forwarding address. Returns owner | admin |
-- member | agency. p_write: only owner, admin or an eligible agency member.
create function public.inquiry_forwarding_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_agency uuid;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_forwarding_access_denied';
  end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and kind = 'customer') then
    raise exception 'inquiry_forwarding_access_denied';
  end if;
  -- Reads take no row locks, so a READ ONLY reader can call this; writes
  -- lock the membership they rely on.
  if p_write then
    select m.role into v_role from public.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id for share of m;
  else
    select m.role into v_role from public.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  end if;
  if v_role in ('owner','admin') or (v_role = 'member' and not p_write) then return v_role; end if;
  -- A staffed member of an agency with an active seat that holds the
  -- inquiries area, or that added the business and still awaits the claim.
  select s.agency_workspace_id into v_agency from public.provider_seats s
    join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
    join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
    join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
      and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
    where s.customer_workspace_id = p_workspace_id and s.status = 'active'
      and (exists (select 1 from public.agency_scope_grants g where g.customer_workspace_id = s.customer_workspace_id
             and g.agency_workspace_id = s.agency_workspace_id and g.scope = 'inquiries' and g.status = 'active')
        or (s.granted_by_kind = 'agency_added'
          and not exists (select 1 from public.workspace_memberships o where o.workspace_id = p_workspace_id and o.role = 'owner')))
    limit 1;
  if v_agency is null then raise exception 'inquiry_forwarding_access_denied'; end if;
  return 'agency';
end;
$$;

create function public.inquiry_forwarding_json(a public.inquiry_forwarding_addresses, p_detail boolean) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', a.id, 'localPart', case when p_detail and a.status = 'active' then a.local_part end,
    'status', a.status, 'issuedAs', a.issued_as, 'issuedAt', a.issued_at, 'revokedAt', a.revoked_at,
    'revokedReason', a.revoked_reason, 'firstReceivedAt', a.first_received_at, 'lastReceivedAt', a.last_received_at,
    'receivedCount', a.received_count, 'providerConfirmation', case when p_detail then a.provider_confirmation end)
$$;

-- Issue the business's address, or return the active one. p_rotate replaces
-- the active address with p_local_part; the old one stops accepting mail.
create function public.issue_inquiry_forwarding_address(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_local_part text, p_rotate boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_as text; v_active public.inquiry_forwarding_addresses; v_new public.inquiry_forwarding_addresses; v_agency uuid;
begin
  v_as := public.inquiry_forwarding_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_local_part is null or p_local_part !~ '^fwd-[a-z0-9]{24}$' then raise exception 'inquiry_forwarding_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inquiry-forwarding:' || p_workspace_id::text, 2450));
  select * into v_active from public.inquiry_forwarding_addresses where workspace_id = p_workspace_id and status = 'active' for update;
  if found and not coalesce(p_rotate, false) then
    return jsonb_build_object('status', 'existing', 'address', public.inquiry_forwarding_json(v_active, true));
  end if;
  if found then
    update public.inquiry_forwarding_addresses set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp(), revoked_reason = 'rotated'
      where id = v_active.id;
  end if;
  if v_as = 'agency' then
    select s.agency_workspace_id into v_agency from public.provider_seats s
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id and st.customer_workspace_id = s.customer_workspace_id
        and st.user_id = p_user_id and st.status = 'active'
      where s.customer_workspace_id = p_workspace_id and s.status = 'active' order by s.granted_at limit 1;
  end if;
  insert into public.inquiry_forwarding_addresses(workspace_id, local_part, issued_by, issued_as, agency_workspace_id)
    values (p_workspace_id, p_local_part, p_user_id, v_as, v_agency) returning * into v_new;
  return jsonb_build_object('status', case when v_active.id is null then 'issued' else 'rotated' end,
    'address', public.inquiry_forwarding_json(v_new, true));
exception when unique_violation then
  raise exception 'inquiry_forwarding_conflict';
end;
$$;

create function public.revoke_inquiry_forwarding_address(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_address_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.inquiry_forwarding_addresses;
begin
  perform public.inquiry_forwarding_actor(p_workspace_id, p_user_id, p_verified_email, true);
  perform pg_advisory_xact_lock(hashtextextended('inquiry-forwarding:' || p_workspace_id::text, 2450));
  select * into v_row from public.inquiry_forwarding_addresses where id = p_address_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'inquiry_forwarding_not_found'; end if;
  if v_row.status = 'active' then
    update public.inquiry_forwarding_addresses set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp(), revoked_reason = 'revoked'
      where id = v_row.id returning * into v_row;
  end if;
  return jsonb_build_object('status', 'revoked', 'address', public.inquiry_forwarding_json(v_row, false));
end;
$$;

-- The address, its arrivals and the latest forwarded inquiry (the "send a
-- test" check polls this). Members read; the address itself is shown to
-- everyone who may read the business's inquiries.
create function public.read_inquiry_forwarding(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_as text; v_active public.inquiry_forwarding_addresses; v_latest public.tenant_leads;
begin
  v_as := public.inquiry_forwarding_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select * into v_active from public.inquiry_forwarding_addresses where workspace_id = p_workspace_id and status = 'active';
  select l.* into v_latest from public.tenant_leads l
    where l.workspace_id = p_workspace_id and l.forwarding_address_id is not null
    order by l.captured_at desc, l.id desc limit 1;
  return jsonb_build_object(
    'canManage', v_as in ('owner','admin','agency'),
    'address', case when v_active.id is null then null else public.inquiry_forwarding_json(v_active, true) end,
    'latest', case when v_latest.id is null then null else jsonb_build_object('id', v_latest.id, 'name', v_latest.name,
      'subject', v_latest.fields->>'subject', 'capturedAt', v_latest.captured_at, 'intakeState', v_latest.intake_state,
      'format', v_latest.fields->>'format') end,
    'revoked', coalesce((select jsonb_agg(public.inquiry_forwarding_json(r, false) order by r.revoked_at desc)
      from (select * from public.inquiry_forwarding_addresses where workspace_id = p_workspace_id and status = 'revoked'
        order by revoked_at desc limit 5) r), '[]'::jsonb));
end;
$$;

-- Resolve the receiving address. Unknown or revoked addresses answer with a
-- status only; nothing about the business is returned.
create function public.resolve_inquiry_forwarding_address(p_local_part text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when a.id is null then jsonb_build_object('status', 'unknown')
    when a.status <> 'active' then jsonb_build_object('status', 'revoked')
    when public.workspace_exit_completed(a.workspace_id) then jsonb_build_object('status', 'closed')
    else jsonb_build_object('status', 'active', 'addressId', a.id, 'workspaceId', a.workspace_id) end
  from (select 1) one left join public.inquiry_forwarding_addresses a on a.local_part = lower(btrim(coalesce(p_local_part, '')))
$$;

-- One forwarded message. p_input: kind inquiry | provider_confirmation.
-- Service role only; the caller verified the provider signature, read the
-- message and scored it. Nothing here sends or notifies.
create function public.receive_forwarded_inquiry(p_local_part text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.inquiry_forwarding_addresses; l public.tenant_leads; t timestamptz := clock_timestamp();
  v_hold text; v_email text;
begin
  select * into a from public.inquiry_forwarding_addresses where local_part = lower(btrim(coalesce(p_local_part, ''))) for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'unknown'); end if;
  if a.status <> 'active' then return jsonb_build_object('status', 'refused', 'reason', 'revoked'); end if;
  if public.workspace_exit_completed(a.workspace_id) then return jsonb_build_object('status', 'refused', 'reason', 'closed'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 24000 then raise exception 'inquiry_forwarding_invalid'; end if;
  if p_input->>'kind' = 'provider_confirmation' then
    if p_input->>'provider' is distinct from 'gmail' or coalesce(p_input->>'code', '') !~ '^[0-9]{6,12}$'
      or (p_input->>'url' is not null and p_input->>'url' !~ '^https://mail(-settings)?\.google\.com/') then
      raise exception 'inquiry_forwarding_invalid';
    end if;
    update public.inquiry_forwarding_addresses set provider_confirmation = jsonb_build_object('provider', 'gmail', 'code', p_input->>'code',
      'url', p_input->>'url', 'requestedBy', left(p_input->>'requestedBy', 320), 'at', t) where id = a.id;
    return jsonb_build_object('status', 'confirmation', 'workspaceId', a.workspace_id);
  end if;
  v_email := nullif(lower(btrim(coalesce(p_input->>'email', ''))), '');
  if p_input->>'kind' is distinct from 'inquiry'
    or coalesce(p_input->>'leadId', '') !~ '^lead_fwd_[a-f0-9]{40}$'
    or coalesce(p_input->>'submissionHash', '') !~ '^[a-f0-9]{16}$'
    or char_length(btrim(coalesce(p_input->>'name', ''))) not between 1 and 200
    or (v_email is not null and (char_length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
    or char_length(coalesce(p_input->>'message', '')) > 5000
    or (p_input ? 'fields' and jsonb_typeof(p_input->'fields') <> 'object')
    or (p_input->>'spamReason' is not null and char_length(p_input->>'spamReason') not between 1 and 200) then
    raise exception 'inquiry_forwarding_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('inquiry-forwarding-receive:' || a.workspace_id::text, 2450));
  select * into l from public.tenant_leads where workspace_id = a.workspace_id and forwarding_address_id is not null
    and lead_id = p_input->>'leadId';
  if found then return jsonb_build_object('status', 'duplicate', 'id', l.id, 'workspaceId', a.workspace_id); end if;
  select * into l from public.tenant_leads where workspace_id = a.workspace_id and forwarding_address_id is not null
    and submission_hash = p_input->>'submissionHash' and captured_at > t - interval '1 day' order by captured_at desc limit 1;
  if found then return jsonb_build_object('status', 'duplicate', 'id', l.id, 'workspaceId', a.workspace_id); end if;
  v_hold := p_input->>'spamReason';
  if v_hold is null and (select count(*) from public.tenant_leads where workspace_id = a.workspace_id
      and forwarding_address_id is not null and captured_at > t - interval '1 hour') >= 120 then
    v_hold := 'volume';
  end if;
  insert into public.tenant_leads(forwarding_address_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash, name, email, message,
    fields, source, captured_at, recorded_via, intake_state, held_reason, intake_state_at)
  values (a.id, 'forwarded-email', a.workspace_id, p_input->>'leadId', p_input->>'submissionHash', btrim(p_input->>'name'), v_email,
    nullif(p_input->>'message', ''), coalesce(p_input->'fields', '{}'::jsonb), 'forwarded_email', t, 'forwarded_email',
    case when v_hold is null then 'kept' else 'held_as_spam' end, v_hold, case when v_hold is not null then t end)
  returning * into l;
  update public.inquiry_forwarding_addresses set first_received_at = coalesce(first_received_at, t), last_received_at = t,
    received_count = received_count + 1 where id = a.id;
  return jsonb_build_object('status', case when v_hold is null then 'recorded' else 'held' end, 'id', l.id, 'workspaceId', a.workspace_id);
end;
$$;

revoke all on function public.inquiry_forwarding_actor(uuid,uuid,text,boolean),
  public.inquiry_forwarding_json(public.inquiry_forwarding_addresses,boolean),
  public.issue_inquiry_forwarding_address(uuid,uuid,text,text,boolean),
  public.revoke_inquiry_forwarding_address(uuid,uuid,text,uuid),
  public.read_inquiry_forwarding(uuid,uuid,text),
  public.resolve_inquiry_forwarding_address(text),
  public.receive_forwarded_inquiry(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.issue_inquiry_forwarding_address(uuid,uuid,text,text,boolean),
  public.revoke_inquiry_forwarding_address(uuid,uuid,text,uuid),
  public.read_inquiry_forwarding(uuid,uuid,text),
  public.resolve_inquiry_forwarding_address(text),
  public.receive_forwarded_inquiry(text,jsonb) to service_role;
commit;
