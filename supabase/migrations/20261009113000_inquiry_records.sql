-- Inquiries at 1.0.0: the record pieces section 6 left (inquiry delta spec,
-- docs/capabilities/inquiries/inquiry-1.0-delta-2026-10-06.md, C8, C9, §4, §5).
--
--   * Spam held for review lives in `tenant_leads`. A new `intake_state`
--     says what the row is: `kept` (every lead so far), `held_as_spam`
--     (caught by the spam gate, kept for review), `released` (a held item the
--     owner or Strelva let through; a normal record from then on) and
--     `confirmed_spam` (the owner or Strelva agreed it is spam; kept as
--     evidence, never deleted). The Redis spam pit (`reb:spam-pit:*`) is
--     unchanged and keeps its 30-day TTL.
--   * `inquiry_events`: one append-only row per thing that happened to an
--     inquiry (captured, held, released, confirmed spam, put back, contact
--     linked, delivery, reply, timeline). Delivery and reply events are a
--     best-effort copy of the Redis delivery and timeline keys.
--   * Every inquiry points at a business contact (C9). After capture in a
--     converted business, the sender is added to or merged into
--     `business_contacts` (source `inquiry`), matched by email first, then
--     phone, the same rule the booking store uses. A contact that can't be
--     matched never loses the lead.
--   * A workspace-scoped read by business, paged with p_before, checked
--     against a direct membership inside the function as well as in the app.
--
-- Spam rows never disturb the lead reads the cutover depends on:
-- read_tenant_leads, read_tenant_lead and read_tenant_lead_digests are
-- replaced to skip held and confirmed spam (digests also skip released rows,
-- which Redis never held, so parity is unchanged). A held row's submission
-- hash is 16 characters (`s` + 15 hex), longer than any hash the capture path
-- makes (at most 7), so the double-submit window can never treat a real
-- lead as a duplicate of spam.
--
-- Additive: new columns with defaults, a widened recorded_via check, a new
-- table and functions, and three read functions replaced with the same
-- signatures and shapes (plus `intakeState`). RLS stays on; every table
-- privilege is revoked; service-role functions only.

set local lock_timeout = '3s';

alter table public.tenant_leads
  add column intake_state text not null default 'kept'
    check (intake_state in ('kept', 'held_as_spam', 'released', 'confirmed_spam')),
  add column held_reason text check (held_reason is null or char_length(held_reason) between 1 and 200),
  add column intake_state_at timestamptz,
  add column contact_id uuid references public.business_contacts(id) on delete set null;
alter table public.tenant_leads drop constraint tenant_leads_recorded_via_check;
alter table public.tenant_leads add constraint tenant_leads_recorded_via_check
  check (recorded_via in ('dual_write', 'repair', 'backfill', 'connected_site', 'spam_hold'));
alter table public.tenant_leads add constraint tenant_leads_spam_hold_held
  check (recorded_via <> 'spam_hold' or held_reason is not null);
create index tenant_leads_workspace_state_idx on public.tenant_leads(workspace_id, intake_state, captured_at desc)
  where workspace_id is not null;

create table public.inquiry_events (
  id uuid primary key default gen_random_uuid(),
  -- No foreign key, like tenant_leads: an inquiry's history outlives a
  -- deprovisioned tenant row.
  tenant_stable_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  lead_id text not null check (lead_id ~ '^lead_[A-Za-z0-9_-]{1,100}$'),
  kind text not null check (kind in ('captured', 'held_as_spam', 'released', 'confirmed_spam', 'reheld',
    'contact_linked', 'delivery', 'reply', 'timeline')),
  actor text not null check (actor in ('visitor', 'owner', 'operator', 'strelva', 'system')),
  actor_id text check (actor_id is null or char_length(actor_id) between 1 and 200),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 8000),
  -- Makes a replayed write a no-op (one `captured` per lead, one copy of a delivery checkpoint).
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) between 1 and 200),
  at timestamptz not null default clock_timestamp()
);
create unique index inquiry_events_dedupe_idx on public.inquiry_events(tenant_stable_id, lead_id, dedupe_key) where dedupe_key is not null;
create index inquiry_events_lead_idx on public.inquiry_events(tenant_stable_id, lead_id, at, id);
create index inquiry_events_workspace_idx on public.inquiry_events(workspace_id, at desc) where workspace_id is not null;

alter table public.inquiry_events enable row level security;
revoke all on public.inquiry_events from public, anon, authenticated, service_role;

create function public.inquiry_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A workspace deletion may clear the reference (on delete set null); nothing else changes.
  if tg_op = 'UPDATE' and new.workspace_id is null and old.workspace_id is not null
    and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then
    return new;
  end if;
  raise exception 'inquiry_events_immutable';
end;
$$;
create trigger inquiry_events_immutable before update or delete on public.inquiry_events
  for each row execute function public.inquiry_events_immutable();

-- One event row. Internal: callers have already resolved the tenant.
create function public.inquiry_event_write(p_stable uuid, p_workspace uuid, p_lead_id text, p_kind text, p_actor text,
  p_actor_id text, p_detail jsonb, p_dedupe text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.inquiry_events(tenant_stable_id, workspace_id, lead_id, kind, actor, actor_id, detail, dedupe_key)
  values (p_stable, p_workspace, p_lead_id, p_kind, p_actor, p_actor_id, coalesce(p_detail, '{}'::jsonb), p_dedupe)
  on conflict (tenant_stable_id, lead_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Record one inquiry event from the app (delivery, reply, timeline copies).
-- Returns {status: recorded|exists}. Raises inquiry_record_invalid or
-- inquiry_record_unknown_tenant; callers never fail a send or a capture on it.
create function public.record_inquiry_event(p_tenant_id text, p_lead_id text, p_kind text, p_actor text,
  p_actor_id text, p_detail jsonb, p_dedupe_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_written boolean;
begin
  if p_lead_id is null or p_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$'
    or p_kind is null or p_kind not in ('delivery', 'reply', 'timeline')
    or p_actor is null or p_actor not in ('owner', 'operator', 'strelva', 'system')
    or (p_detail is not null and (jsonb_typeof(p_detail) <> 'object' or octet_length(p_detail::text) > 8000))
    or (p_dedupe_key is not null and char_length(p_dedupe_key) not between 1 and 200)
    or (p_actor_id is not null and char_length(p_actor_id) not between 1 and 200) then
    raise exception 'inquiry_record_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'inquiry_record_unknown_tenant'; end if;
  v_written := public.inquiry_event_write(v_stable, public.tenant_lead_workspace(v_stable), p_lead_id, p_kind, p_actor,
    p_actor_id, p_detail, p_dedupe_key);
  return jsonb_build_object('status', case when v_written then 'recorded' else 'exists' end);
end;
$$;

-- Hold one caught submission for review. `p_spam` is the spam pit record:
-- {id: "spam_…", reason, source?, name?, email?, message?, fields?, createdAt}.
-- Idempotent on the spam id. Returns {status: recorded|exists, id, workspaceId}.
create function public.hold_tenant_lead_as_spam(p_tenant_id text, p_spam jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_workspace uuid;
  v_spam_id text;
  v_lead_id text;
  v_captured timestamptz;
  v_existing public.tenant_leads%rowtype;
  v_id uuid;
begin
  if p_spam is null or jsonb_typeof(p_spam) <> 'object' or octet_length(p_spam::text) > 120000 then
    raise exception 'inquiry_record_invalid';
  end if;
  v_spam_id := p_spam->>'id';
  if v_spam_id is null or v_spam_id !~ '^spam_[A-Za-z0-9_-]{1,90}$'
    or jsonb_typeof(p_spam->'reason') is distinct from 'string' or char_length(p_spam->>'reason') not between 1 and 200
    or (p_spam ? 'name' and (jsonb_typeof(p_spam->'name') <> 'string' or char_length(p_spam->>'name') > 200))
    or (p_spam ? 'email' and (jsonb_typeof(p_spam->'email') <> 'string' or char_length(p_spam->>'email') > 320))
    or (p_spam ? 'message' and (jsonb_typeof(p_spam->'message') <> 'string' or char_length(p_spam->>'message') > 5000))
    or (p_spam ? 'source' and (jsonb_typeof(p_spam->'source') <> 'string' or char_length(p_spam->>'source') > 80))
    or (p_spam ? 'fields' and (jsonb_typeof(p_spam->'fields') <> 'object' or octet_length((p_spam->'fields')::text) > 100000))
    or jsonb_typeof(p_spam->'createdAt') is distinct from 'string' then
    raise exception 'inquiry_record_invalid';
  end if;
  begin
    v_captured := (p_spam->>'createdAt')::timestamptz;
  exception when others then
    raise exception 'inquiry_record_invalid';
  end;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'inquiry_record_unknown_tenant'; end if;
  v_lead_id := 'lead_' || v_spam_id;

  select * into v_existing from public.tenant_leads where tenant_stable_id = v_stable and lead_id = v_lead_id;
  if found then
    return jsonb_build_object('status', 'exists', 'id', v_existing.id, 'workspaceId', v_existing.workspace_id);
  end if;
  v_workspace := public.tenant_lead_workspace(v_stable);
  insert into public.tenant_leads(tenant_stable_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash,
    name, email, message, source, fields, captured_at, recorded_via, intake_state, held_reason, intake_state_at)
  values (v_stable, p_tenant_id, v_workspace, v_lead_id,
    's' || left(md5(v_spam_id), 15),
    coalesce(p_spam->>'name', ''), p_spam->>'email', p_spam->>'message', p_spam->>'source', p_spam->'fields',
    v_captured, 'spam_hold', 'held_as_spam', p_spam->>'reason', clock_timestamp())
  on conflict (tenant_stable_id, lead_id) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_existing from public.tenant_leads where tenant_stable_id = v_stable and lead_id = v_lead_id;
    return jsonb_build_object('status', 'exists', 'id', v_existing.id, 'workspaceId', v_existing.workspace_id);
  end if;
  perform public.inquiry_event_write(v_stable, v_workspace, v_lead_id, 'held_as_spam', 'system', null,
    jsonb_build_object('reason', p_spam->>'reason'), 'held');
  return jsonb_build_object('status', 'recorded', 'id', v_id, 'workspaceId', v_workspace);
exception
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'inquiry_record_invalid';
end;
$$;

-- After a lead is kept: write its `captured` event and, in a converted
-- business, add the sender to the business's contacts (source `inquiry`),
-- matched by email, then phone (fields.phone). A contact that can't be
-- written is skipped, never fatal. Idempotent. Returns
-- {status: recorded|missing, contactId, contact: created|merged|skipped|none}.
create function public.after_tenant_lead_capture(p_tenant_id text, p_lead_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_lead public.tenant_leads%rowtype;
  v_email text;
  v_phone text;
  v_key text;
  v_contact uuid;
  v_outcome text := 'none';
  v_name text;
begin
  if p_lead_id is null or p_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$' then raise exception 'inquiry_record_invalid'; end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'inquiry_record_unknown_tenant'; end if;
  select * into v_lead from public.tenant_leads where tenant_stable_id = v_stable and lead_id = p_lead_id for update;
  if not found then return jsonb_build_object('status', 'missing', 'contactId', null, 'contact', 'none'); end if;
  if v_lead.intake_state in ('held_as_spam', 'confirmed_spam') then
    -- Spam never becomes a contact.
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'none');
  end if;
  perform public.inquiry_event_write(v_stable, v_lead.workspace_id, p_lead_id, 'captured', 'visitor', null,
    jsonb_strip_nulls(jsonb_build_object('source', v_lead.source, 'capabilityId', v_lead.capability_id)), 'captured');

  if v_lead.contact_id is not null then
    return jsonb_build_object('status', 'recorded', 'contactId', v_lead.contact_id, 'contact', 'none');
  end if;
  if v_lead.workspace_id is null
    or not exists (select 1 from public.business_records r where r.workspace_id = v_lead.workspace_id) then
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'none');
  end if;

  v_email := lower(nullif(btrim(coalesce(v_lead.email, '')), ''));
  if v_email is not null and not public.business_record_email_valid(v_email) then v_email := null; end if;
  v_phone := nullif(btrim(coalesce(v_lead.fields->>'phone', v_lead.fields->>'tel', '')), '');
  if v_phone is not null and (char_length(v_phone) not between 3 and 40 or public.business_contact_phone_key(v_phone) is null) then
    v_phone := null;
  end if;
  v_key := public.business_contact_phone_key(v_phone);
  v_name := left(nullif(btrim(v_lead.name), ''), 160);
  if v_email is null and v_phone is null then
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'skipped');
  end if;

  begin
    if v_email is not null then
      select id into v_contact from public.business_contacts where workspace_id = v_lead.workspace_id and email = v_email for update;
    end if;
    if v_contact is null and v_key is not null then
      select id into v_contact from public.business_contacts where workspace_id = v_lead.workspace_id and phone_key = v_key for update;
    end if;
    if v_contact is null then
      insert into public.business_contacts(workspace_id, name, email, phone, sources, first_seen_at, last_seen_at)
        values (v_lead.workspace_id, v_name, v_email, v_phone, array['inquiry'], v_lead.captured_at, v_lead.captured_at)
        returning id into v_contact;
      v_outcome := 'created';
    else
      -- Fill only what is missing; never take an identifier another contact holds.
      update public.business_contacts c set
          name = coalesce(c.name, v_name),
          email = coalesce(c.email, case when v_email is not null and not exists (
            select 1 from public.business_contacts o where o.workspace_id = c.workspace_id and o.email = v_email) then v_email end),
          phone = coalesce(c.phone, case when v_key is not null and not exists (
            select 1 from public.business_contacts o where o.workspace_id = c.workspace_id and o.phone_key = v_key) then v_phone end),
          sources = case when 'inquiry' = any(c.sources) then c.sources else c.sources || array['inquiry'] end,
          first_seen_at = least(c.first_seen_at, v_lead.captured_at),
          last_seen_at = greatest(c.last_seen_at, v_lead.captured_at),
          updated_at = clock_timestamp()
        where c.id = v_contact;
      v_outcome := 'merged';
    end if;
  exception when others then
    -- A contact that can't be matched never loses the lead or its event.
    return jsonb_build_object('status', 'recorded', 'contactId', null, 'contact', 'skipped');
  end;
  update public.tenant_leads set contact_id = v_contact where id = v_lead.id;
  perform public.inquiry_event_write(v_stable, v_lead.workspace_id, p_lead_id, 'contact_linked', 'system', null,
    jsonb_build_object('contactId', v_contact, 'outcome', v_outcome), 'contact_linked');
  return jsonb_build_object('status', 'recorded', 'contactId', v_contact, 'contact', v_outcome);
end;
$$;

-- A direct member of this business, with a verified email. Returns the role.
create function public.inquiry_assert_member(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_access_denied';
  end if;
  select m.role into v_role from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.kind = 'customer'
    for share of m;
  if v_role is null then raise exception 'inquiry_access_denied'; end if;
  return v_role;
end;
$$;

create function public.inquiry_lead_json(l public.tenant_leads) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', l.id,
    'tenantId', coalesce((select t.id from public.tenants t where t.stable_id = l.tenant_stable_id), l.tenant_slug_at_capture),
    'tenantStableId', l.tenant_stable_id,
    'connectedSiteId', l.connected_site_id,
    'workspaceId', l.workspace_id,
    'leadId', l.lead_id,
    'name', l.name,
    'email', l.email,
    'message', l.message,
    'source', l.source,
    'fields', l.fields,
    'capabilityId', l.capability_id,
    'capabilityVersion', l.capability_version,
    'intakeState', l.intake_state,
    'heldReason', l.held_reason,
    'intakeStateAt', case when l.intake_state_at is null then null
      else to_char(l.intake_state_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'contactId', l.contact_id,
    'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'recordedVia', l.recorded_via)
$$;

-- The business's inquiries, newest first, for a direct member. `p_states`
-- filters by intake state (null: kept and released, the normal records).
-- Pages with p_before. Nothing of another business is returned.
create function public.read_workspace_leads(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_states text[], p_limit integer, p_before timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_states text[] := coalesce(p_states, array['kept', 'released']);
begin
  if not (v_states <@ array['kept', 'held_as_spam', 'released', 'confirmed_spam']) then raise exception 'inquiry_record_invalid'; end if;
  perform public.inquiry_assert_member(p_workspace_id, p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(public.inquiry_lead_json(page) order by page.captured_at desc, page.id desc)
    from (
      select l.* from public.tenant_leads l
      where l.workspace_id = p_workspace_id and l.intake_state = any(v_states)
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$$;

-- One inquiry's events, oldest first, for a direct member of its business.
create function public.read_workspace_inquiry_events(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_lead_row_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead public.tenant_leads%rowtype;
begin
  perform public.inquiry_assert_member(p_workspace_id, p_user_id, p_verified_email);
  select * into v_lead from public.tenant_leads where id = p_lead_row_id and workspace_id = p_workspace_id;
  if not found then raise exception 'inquiry_not_found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'actor', e.actor, 'detail', e.detail,
      'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by e.at, e.id)
    from public.inquiry_events e where e.tenant_stable_id = v_lead.tenant_stable_id and e.lead_id = v_lead.lead_id), '[]'::jsonb);
end;
$$;

-- The owner's (or Strelva's) review of one held item. `release` makes it a
-- normal record (no customer email until routed); `confirm_spam` keeps it as
-- spam evidence; `hold` puts a released or confirmed item back under review.
-- Owner: a direct member with role owner. Strelva: an active super admin,
-- with a receipt (the event row). Members and admins are refused (§4).
-- Returns {status: decided|unchanged, lead}.
create function public.decide_held_workspace_lead(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_lead_row_id uuid, p_decision text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor text;
  v_role text;
  v_lead public.tenant_leads%rowtype;
  v_to text;
  v_event text;
begin
  if p_decision is null or p_decision not in ('release', 'confirm_spam', 'hold') then raise exception 'inquiry_record_invalid'; end if;
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_access_denied';
  end if;
  select m.role into v_role from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.kind = 'customer' for share of m;
  if v_role = 'owner' then
    v_actor := 'owner';
  elsif exists (select 1 from public.super_admins sa where sa.user_id = p_user_id and sa.revoked_at is null) then
    v_actor := 'operator';
  else
    raise exception 'inquiry_access_denied';
  end if;
  select * into v_lead from public.tenant_leads where id = p_lead_row_id for update;
  if not found or v_lead.workspace_id is distinct from p_workspace_id then raise exception 'inquiry_not_found'; end if;
  if v_lead.intake_state = 'kept' then raise exception 'inquiry_not_held'; end if;
  v_to := case p_decision when 'release' then 'released' when 'confirm_spam' then 'confirmed_spam' else 'held_as_spam' end;
  if v_lead.intake_state = v_to then
    return jsonb_build_object('status', 'unchanged', 'lead', public.inquiry_lead_json(v_lead));
  end if;
  update public.tenant_leads set intake_state = v_to, intake_state_at = clock_timestamp()
    where id = v_lead.id returning * into v_lead;
  v_event := case v_to when 'released' then 'released' when 'confirmed_spam' then 'confirmed_spam' else 'reheld' end;
  perform public.inquiry_event_write(v_lead.tenant_stable_id, v_lead.workspace_id, v_lead.lead_id, v_event, v_actor,
    p_user_id::text, '{}'::jsonb, null);
  return jsonb_build_object('status', 'decided', 'lead', public.inquiry_lead_json(v_lead));
end;
$$;

-- The three lead reads skip spam. Same signatures and shapes as before.
create or replace function public.read_tenant_leads(p_tenant_id text, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_tenant_id is not null then
    select stable_id into v_stable from public.tenants where id = p_tenant_id;
    if v_stable is null then return '[]'::jsonb; end if;
  end if;
  return coalesce((
    select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'tenantId', coalesce(t.id, l.tenant_slug_at_capture),
        'tenantStableId', l.tenant_stable_id,
        'siteName', coalesce(t.site_name, l.site_name_at_delete),
        'tenantSlugAtCapture', l.tenant_slug_at_capture,
        'workspaceId', l.workspace_id,
        'leadId', l.lead_id,
        'name', l.name,
        'email', l.email,
        'message', l.message,
        'source', l.source,
        'fields', l.fields,
        'capabilityId', l.capability_id,
        'capabilityVersion', l.capability_version,
        'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedAt', to_char(l.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedVia', l.recorded_via,
        'intakeState', l.intake_state,
        'tenantDeletedAt', case when l.tenant_deleted_at is null then null
          else to_char(l.tenant_deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'retainUntil', case when l.retain_until is null then null
          else to_char(l.retain_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) as item
      from public.tenant_leads l
      left join public.tenants t on t.stable_id = l.tenant_stable_id
      where (v_stable is null or l.tenant_stable_id = v_stable)
        and l.intake_state in ('kept', 'released')
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$$;

create or replace function public.read_tenant_lead(p_tenant_id text, p_lead_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_item jsonb;
begin
  if p_tenant_id is null or p_lead_id is null or p_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$' then
    return null;
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return null; end if;
  select jsonb_build_object(
      'id', l.id,
      'tenantId', p_tenant_id,
      'tenantStableId', l.tenant_stable_id,
      'tenantSlugAtCapture', l.tenant_slug_at_capture,
      'workspaceId', l.workspace_id,
      'leadId', l.lead_id,
      'submissionHash', l.submission_hash,
      'name', l.name,
      'email', l.email,
      'message', l.message,
      'source', l.source,
      'fields', l.fields,
      'capabilityId', l.capability_id,
      'capabilityVersion', l.capability_version,
      'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recordedVia', l.recorded_via,
      'intakeState', l.intake_state)
    into v_item
    from public.tenant_leads l
    where l.tenant_stable_id = v_stable and l.lead_id = p_lead_id and l.intake_state in ('kept', 'released');
  return v_item;
end;
$$;

create or replace function public.read_tenant_lead_digests(p_tenant_id text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid;
begin
  if p_tenant_id is null then return '{}'::jsonb; end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return '{}'::jsonb; end if;
  -- Only what the capture path wrote: Redis never held spam or released items.
  return coalesce((
    select jsonb_object_agg(l.lead_id, l.submission_hash)
    from public.tenant_leads l
    where l.tenant_stable_id = v_stable
      and l.intake_state = 'kept'
      and (p_since is null or l.captured_at >= p_since)
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.inquiry_events_immutable() from public, anon, authenticated;
revoke all on function public.inquiry_event_write(uuid, uuid, text, text, text, text, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.inquiry_assert_member(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.inquiry_lead_json(public.tenant_leads) from public, anon, authenticated, service_role;
revoke all on function public.record_inquiry_event(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.hold_tenant_lead_as_spam(text, jsonb) from public, anon, authenticated;
revoke all on function public.after_tenant_lead_capture(text, text) from public, anon, authenticated;
revoke all on function public.read_workspace_leads(uuid, uuid, text, text[], integer, timestamptz) from public, anon, authenticated;
revoke all on function public.read_workspace_inquiry_events(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.decide_held_workspace_lead(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.read_tenant_leads(text, integer, timestamptz) from public, anon, authenticated;
revoke all on function public.read_tenant_lead(text, text) from public, anon, authenticated;
revoke all on function public.read_tenant_lead_digests(text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_inquiry_event(text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.hold_tenant_lead_as_spam(text, jsonb) to service_role;
grant execute on function public.after_tenant_lead_capture(text, text) to service_role;
grant execute on function public.read_workspace_leads(uuid, uuid, text, text[], integer, timestamptz) to service_role;
grant execute on function public.read_workspace_inquiry_events(uuid, uuid, text, uuid) to service_role;
grant execute on function public.decide_held_workspace_lead(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.read_tenant_leads(text, integer, timestamptz) to service_role;
grant execute on function public.read_tenant_lead(text, text) to service_role;
grant execute on function public.read_tenant_lead_digests(text, timestamptz) to service_role;
