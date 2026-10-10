-- One place to operate (docs/product/specs/operator.md).
--
-- The operator queue is a read projection over existing sources; each source
-- keeps its authority and nothing is copied here. This migration adds the
-- only new queue state, plus the receipt ledger for outside writes that have
-- no receipt store today:
--
--   operator_queue_marks         current claim, pin, snooze, closure and
--                                owner-told state per (source, source_ref).
--   operator_queue_mark_events   append-only history of every mark change
--                                and every note. Retries are idempotent by
--                                command id.
--   outside_write_receipts       one row per outside write (Google review
--                                reply, GBP hours/post/photo, domain add and
--                                claim removal, tenant content publish). The
--                                provider's acceptance is fixed at insert; the
--                                read-back is recorded once, separately, and
--                                a failed read-back is never retried here.
--
-- Access. Tables: RLS on, every grant revoked, service_role included. Reads
-- and mark writes run through security-definer functions that re-check a
-- verified user with an active super_admins row on every call. Receipt
-- inserts and read-backs are server-side writes (cron and approval paths have
-- no signed-in user), exposed to service_role only.

create table public.operator_queue_marks (
  source text not null check (source ~ '^[a-z][a-z_]{1,39}$'),
  source_ref text not null check (char_length(source_ref) between 1 and 300),
  assignee_user_id uuid references public.users(id) on delete set null,
  pinned_until timestamptz,
  snoozed_until timestamptz,
  snooze_reason text check (snooze_reason is null or char_length(btrim(snooze_reason)) between 1 and 280),
  closed_state text check (closed_state is null or closed_state in ('done','dismissed')),
  closed_reason text check (closed_reason is null or char_length(btrim(closed_reason)) between 1 and 280),
  closed_receipt_id uuid,
  closed_at timestamptz,
  owner_told_via text check (owner_told_via is null or owner_told_via in ('email','approve_link')),
  owner_told_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (source, source_ref),
  check ((snoozed_until is null) = (snooze_reason is null)),
  check ((closed_state is null) = (closed_at is null)),
  check (closed_state is null or closed_reason is not null or closed_receipt_id is not null),
  check ((owner_told_via is null) = (owner_told_at is null))
);
create index operator_queue_marks_assignee_idx on public.operator_queue_marks(assignee_user_id) where assignee_user_id is not null;

create table public.operator_queue_mark_events (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  source text not null,
  source_ref text not null,
  action text not null check (action in ('take','hand_off','release','pin','unpin','snooze','unsnooze','note','owner_told','close','reopen')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4000),
  actor_user_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create index operator_queue_mark_events_ref_idx on public.operator_queue_mark_events(source, source_ref, created_at);

create table public.outside_write_receipts (
  id uuid primary key default gen_random_uuid(),
  -- The caller's idempotency key: a lost response retried with the same key
  -- returns the first receipt and never records the write twice.
  command_key text not null unique check (char_length(command_key) between 8 and 200),
  tenant_id text check (tenant_id is null or char_length(tenant_id) between 1 and 120),
  tenant_stable_id uuid,
  workspace_id uuid references public.workspaces(id) on delete set null,
  system_id uuid,
  provider text not null check (provider in ('google_business','vercel','strelva_routing','strelva_content')),
  write_kind text not null check (write_kind in ('review_reply','gbp_hours','gbp_post','gbp_photo','domain_add','domain_claim_removal','content_publish')),
  subject text not null check (char_length(btrim(subject)) between 1 and 300),
  request jsonb not null check (jsonb_typeof(request) = 'object' and octet_length(request::text) <= 16000),
  before_state jsonb check (before_state is null or octet_length(before_state::text) <= 16000),
  acceptance text not null check (acceptance in ('accepted','rejected','unknown')),
  acceptance_detail text check (acceptance_detail is null or char_length(acceptance_detail) <= 1000),
  provider_ref text check (provider_ref is null or char_length(provider_ref) <= 500),
  accepted_at timestamptz,
  readback text not null check (readback in ('pending','matched','differs','failed','not_possible')),
  readback_detail text check (readback_detail is null or char_length(readback_detail) <= 1000),
  readback_at timestamptz,
  undo text not null check (undo in ('available','claim_only','put_back_draft','not_available')),
  undo_label text not null check (char_length(btrim(undo_label)) between 1 and 300),
  actor text not null check (char_length(btrim(actor)) between 1 and 200),
  created_at timestamptz not null default clock_timestamp(),
  check ((acceptance = 'accepted') = (accepted_at is not null)),
  -- Nothing to read back from a write the provider did not accept.
  check (acceptance = 'accepted' or readback = 'not_possible'),
  check ((readback in ('pending','not_possible')) or readback_at is not null),
  -- A Vercel domain is never removed by Strelva: the only undo for a domain
  -- add is dropping Strelva's own claim.
  check (write_kind <> 'domain_add' or undo = 'claim_only'),
  check (write_kind <> 'domain_claim_removal' or (undo = 'not_available' and provider = 'strelva_routing'))
);
create index outside_write_receipts_tenant_idx on public.outside_write_receipts(tenant_id, created_at desc) where tenant_id is not null;
create index outside_write_receipts_workspace_idx on public.outside_write_receipts(workspace_id, created_at desc) where workspace_id is not null;
create index outside_write_receipts_readback_idx on public.outside_write_receipts(created_at desc) where readback in ('failed','differs','pending');

alter table public.operator_queue_marks enable row level security;
alter table public.operator_queue_mark_events enable row level security;
alter table public.outside_write_receipts enable row level security;
revoke all on public.operator_queue_marks, public.operator_queue_mark_events, public.outside_write_receipts
  from public, anon, authenticated, service_role;

-- Mark history and receipts never change, except the one read-back step.
create function public.operator_queue_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'outside_write_receipts' and tg_op = 'UPDATE' then
    -- A deleted workspace clears the reference through its foreign key; the
    -- receipt itself is kept.
    if pg_trigger_depth() > 1 and new.workspace_id is null
      and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then
      return new;
    end if;
    if old.readback = 'pending' and new.readback <> 'pending'
      and (to_jsonb(new) - array['readback','readback_detail','readback_at'])
        = (to_jsonb(old) - array['readback','readback_detail','readback_at']) then
      return new;
    end if;
    raise exception 'outside_write_receipt_immutable';
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'operator_queue_append_only';
end;
$$;
create trigger operator_queue_mark_events_append_only
  before update or delete on public.operator_queue_mark_events
  for each row execute function public.operator_queue_append_only();
create trigger outside_write_receipts_append_only
  before update or delete on public.outside_write_receipts
  for each row execute function public.operator_queue_append_only();

create function public.operator_queue_assert_operator(p_user_id uuid, p_verified_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'operator_queue_access_denied'; end if;
  perform 1 from public.super_admins where user_id = p_user_id and revoked_at is null for share;
  if not found then raise exception 'operator_queue_access_denied'; end if;
end;
$$;

create function public.operator_queue_mark_row(p_source text, p_source_ref text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'source', m.source, 'sourceRef', m.source_ref, 'assigneeUserId', m.assignee_user_id,
    'assigneeEmail', (select u.email from public.users u where u.id = m.assignee_user_id),
    'pinnedUntil', m.pinned_until, 'snoozedUntil', m.snoozed_until, 'snoozeReason', m.snooze_reason,
    'closedState', m.closed_state, 'closedReason', m.closed_reason, 'closedReceiptId', m.closed_receipt_id,
    'closedAt', m.closed_at, 'ownerToldVia', m.owner_told_via, 'ownerToldAt', m.owner_told_at,
    'revision', m.revision, 'updatedBy', m.updated_by, 'updatedAt', m.updated_at,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'body', e.payload->>'body',
        'by', (select u.email from public.users u where u.id = e.actor_user_id), 'at', e.created_at) order by e.created_at)
      from public.operator_queue_mark_events e
      where e.source = m.source and e.source_ref = m.source_ref and e.action = 'note'), '[]'::jsonb))
  from public.operator_queue_marks m
  where m.source = p_source and m.source_ref = p_source_ref;
$$;

-- One mark command. p_priority is the projection's computed priority for the
-- item, supplied by the server action that just read it; P1 refuses snooze.
create function public.write_operator_queue_mark(
  p_user_id uuid, p_verified_email text, p_command_id uuid,
  p_source text, p_source_ref text, p_action text, p_payload jsonb, p_priority text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_event public.operator_queue_mark_events%rowtype;
  mark public.operator_queue_marks%rowtype;
  payload jsonb := coalesce(p_payload, '{}'::jsonb);
  target uuid;
  until_at timestamptz;
  text_value text;
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  if p_command_id is null or p_source is null or p_source !~ '^[a-z][a-z_]{1,39}$'
    or p_source_ref is null or char_length(p_source_ref) not between 1 and 300
    or p_action is null or p_priority is null or p_priority not in ('P1','P2','P3','P4')
    or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 4000 then
    raise exception 'operator_queue_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('operator-queue:' || p_source || ':' || p_source_ref, 0));

  select * into existing_event from public.operator_queue_mark_events where command_id = p_command_id;
  if found then
    if existing_event.source <> p_source or existing_event.source_ref <> p_source_ref
      or existing_event.action <> p_action or existing_event.actor_user_id <> p_user_id then
      raise exception 'operator_queue_conflict';
    end if;
    return public.operator_queue_mark_row(p_source, p_source_ref);
  end if;

  insert into public.operator_queue_marks(source, source_ref, updated_by)
    values (p_source, p_source_ref, p_user_id) on conflict do nothing;
  select * into mark from public.operator_queue_marks where source = p_source and source_ref = p_source_ref for update;

  case p_action
    when 'take' then
      mark.assignee_user_id := p_user_id;
    when 'hand_off' then
      begin target := (payload->>'assigneeUserId')::uuid; exception when others then raise exception 'operator_queue_invalid'; end;
      -- Assignment is a claim, not an authority, but it only goes to someone
      -- who could work the item: an active, verified super admin.
      perform 1 from public.super_admins s join public.users u on u.id = s.user_id
        where s.user_id = target and s.revoked_at is null and u.verified_at is not null;
      if not found then raise exception 'operator_queue_assignee_invalid'; end if;
      mark.assignee_user_id := target;
    when 'release' then
      mark.assignee_user_id := null;
    when 'pin' then
      mark.pinned_until := clock_timestamp() + interval '1 day';
    when 'unpin' then
      mark.pinned_until := null;
    when 'snooze' then
      if p_priority = 'P1' then raise exception 'operator_queue_snooze_refused'; end if;
      begin until_at := (payload->>'until')::timestamptz; exception when others then raise exception 'operator_queue_invalid'; end;
      text_value := nullif(btrim(coalesce(payload->>'reason', '')), '');
      if until_at is null or until_at <= clock_timestamp() or until_at > clock_timestamp() + interval '7 days'
        or text_value is null or char_length(text_value) > 280 then
        raise exception 'operator_queue_invalid';
      end if;
      mark.snoozed_until := until_at; mark.snooze_reason := text_value;
    when 'unsnooze' then
      mark.snoozed_until := null; mark.snooze_reason := null;
    when 'note' then
      text_value := nullif(btrim(coalesce(payload->>'body', '')), '');
      if text_value is null or char_length(text_value) > 1000 then raise exception 'operator_queue_invalid'; end if;
      payload := jsonb_build_object('body', text_value);
    when 'owner_told' then
      if payload->>'via' is null or payload->>'via' not in ('email','approve_link') then raise exception 'operator_queue_invalid'; end if;
      mark.owner_told_via := payload->>'via'; mark.owner_told_at := clock_timestamp();
    when 'close' then
      text_value := nullif(btrim(coalesce(payload->>'reason', '')), '');
      if payload->>'state' is null or payload->>'state' not in ('done','dismissed')
        or (text_value is null and payload->>'receiptId' is null)
        or (text_value is not null and char_length(text_value) > 280) then
        raise exception 'operator_queue_invalid';
      end if;
      if payload->>'receiptId' is not null then
        begin target := (payload->>'receiptId')::uuid; exception when others then raise exception 'operator_queue_invalid'; end;
        perform 1 from public.outside_write_receipts where id = target;
        if not found then raise exception 'operator_queue_receipt_not_found'; end if;
      else
        target := null;
      end if;
      mark.closed_state := payload->>'state'; mark.closed_reason := text_value;
      mark.closed_receipt_id := target; mark.closed_at := clock_timestamp();
    when 'reopen' then
      mark.closed_state := null; mark.closed_reason := null; mark.closed_receipt_id := null; mark.closed_at := null;
    else
      raise exception 'operator_queue_invalid';
  end case;

  update public.operator_queue_marks set
    assignee_user_id = mark.assignee_user_id, pinned_until = mark.pinned_until,
    snoozed_until = mark.snoozed_until, snooze_reason = mark.snooze_reason,
    closed_state = mark.closed_state, closed_reason = mark.closed_reason,
    closed_receipt_id = mark.closed_receipt_id, closed_at = mark.closed_at,
    owner_told_via = mark.owner_told_via, owner_told_at = mark.owner_told_at,
    revision = case when p_action = 'note' then mark.revision else mark.revision + 1 end,
    updated_by = p_user_id, updated_at = clock_timestamp()
  where source = p_source and source_ref = p_source_ref;
  insert into public.operator_queue_mark_events(command_id, source, source_ref, action, payload, actor_user_id)
    values (p_command_id, p_source, p_source_ref, p_action, payload, p_user_id);
  return public.operator_queue_mark_row(p_source, p_source_ref);
end;
$$;

-- Everything the projection needs from Postgres that has no operator read
-- today: tenant -> business links (with the tenant's adopted System), customer
-- businesses, agency delegations, the latest hosted read-back per website,
-- operators to hand items to, every mark, and receipts whose read-back did
-- not match.
create function public.read_operator_queue_context(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  return jsonb_build_object(
    'links', coalesce((select jsonb_agg(jsonb_build_object(
        'tenantId', t.id, 'tenantStableId', l.tenant_stable_id, 'workspaceId', l.workspace_id, 'workspaceName', w.name,
        'systemId', (select s.id from public.systems s where s.business_workspace_id = l.workspace_id
          and s.origin_kind = 'tenant' and s.origin_ref = l.tenant_stable_id::text))
        order by t.id)
      from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      join public.workspaces w on w.id = l.workspace_id), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by lower(w.name), w.id)
      from (select * from public.workspaces where kind = 'customer' order by lower(name), id limit 2000) w), '[]'::jsonb),
    'delegations', coalesce((select jsonb_agg(distinct jsonb_build_object('agencyWorkspaceId', d.agency_workspace_id, 'customerWorkspaceId', d.customer_workspace_id))
      from public.workspace_delegations d where d.status = 'active'), '[]'::jsonb),
    'documentHealth', coalesce((select jsonb_agg(jsonb_build_object(
        'workspaceId', h.workspace_id, 'workId', h.website_work_id, 'revision', h.revision,
        'status', h.status, 'checkedAt', h.checked_at,
        'tenantId', (select p.tenant_id from public.website_document_publications p
          where p.workspace_id = h.workspace_id and p.website_work_id = h.website_work_id and p.revision = h.revision limit 1)))
      from (select distinct on (website_work_id) * from public.website_document_health
            order by website_work_id, checked_at desc) h), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(jsonb_build_object('userId', u.id, 'email', u.email) order by lower(u.email))
      from public.super_admins s join public.users u on u.id = s.user_id
      where s.revoked_at is null and u.verified_at is not null), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(public.operator_queue_mark_row(m.source, m.source_ref))
      from public.operator_queue_marks m), '[]'::jsonb),
    'readbackFailures', coalesce((select jsonb_agg(public.outside_write_receipt_row(r.id) order by r.created_at desc)
      from (select id, created_at from public.outside_write_receipts
            where acceptance = 'accepted' and readback in ('failed','differs')
            order by created_at desc limit 200) r), '[]'::jsonb)
  );
end;
$$;

create function public.outside_write_receipt_row(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', r.id, 'commandKey', r.command_key, 'tenantId', r.tenant_id, 'tenantStableId', r.tenant_stable_id,
    'workspaceId', r.workspace_id, 'systemId', r.system_id, 'provider', r.provider, 'writeKind', r.write_kind,
    'subject', r.subject, 'request', r.request, 'beforeState', r.before_state,
    'acceptance', r.acceptance, 'acceptanceDetail', r.acceptance_detail, 'providerRef', r.provider_ref,
    'acceptedAt', r.accepted_at, 'readback', r.readback, 'readbackDetail', r.readback_detail,
    'readbackAt', r.readback_at, 'undo', r.undo, 'undoLabel', r.undo_label, 'actor', r.actor, 'createdAt', r.created_at)
  from public.outside_write_receipts r where r.id = p_id;
$$;

-- Record an outside write once the provider has answered. The tenant's
-- business link, if any, is resolved here so a receipt written before
-- conversion still lands on the business after it.
create function public.record_outside_write_receipt(p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.outside_write_receipts%rowtype;
  created_id uuid;
  v_stable uuid;
  v_linked uuid;
  accepted boolean;
begin
  -- A receipt names a tenant or a business when written. (A business deleted
  -- later clears its reference; the receipt is kept.)
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' or p_receipt->>'commandKey' is null
    or (p_receipt->>'tenantId' is null and p_receipt->>'workspaceId' is null) then
    raise exception 'outside_write_receipt_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('outside-write:' || (p_receipt->>'commandKey'), 0));
  select * into existing from public.outside_write_receipts where command_key = p_receipt->>'commandKey';
  if found then
    if existing.write_kind <> p_receipt->>'writeKind' or existing.subject <> p_receipt->>'subject'
      or existing.acceptance <> p_receipt->>'acceptance' or existing.tenant_id is distinct from p_receipt->>'tenantId' then
      raise exception 'outside_write_receipt_conflict';
    end if;
    return public.outside_write_receipt_row(existing.id);
  end if;
  if p_receipt->>'tenantId' is not null then
    select t.stable_id, l.workspace_id into v_stable, v_linked
      from public.tenants t left join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
      where t.id = p_receipt->>'tenantId';
  end if;
  accepted := p_receipt->>'acceptance' = 'accepted';
  begin
    insert into public.outside_write_receipts(command_key, tenant_id, tenant_stable_id, workspace_id, system_id, provider,
      write_kind, subject, request, before_state, acceptance, acceptance_detail, provider_ref, accepted_at,
      readback, readback_detail, readback_at, undo, undo_label, actor)
    values (p_receipt->>'commandKey', p_receipt->>'tenantId', v_stable,
      coalesce((p_receipt->>'workspaceId')::uuid, v_linked), (p_receipt->>'systemId')::uuid, p_receipt->>'provider',
      p_receipt->>'writeKind', btrim(p_receipt->>'subject'), coalesce(p_receipt->'request', '{}'::jsonb),
      p_receipt->'beforeState', p_receipt->>'acceptance', p_receipt->>'acceptanceDetail', p_receipt->>'providerRef',
      case when accepted then coalesce((p_receipt->>'acceptedAt')::timestamptz, clock_timestamp()) end,
      case when accepted then coalesce(p_receipt->>'readback', 'pending') else 'not_possible' end,
      p_receipt->>'readbackDetail',
      case when accepted and coalesce(p_receipt->>'readback', 'pending') not in ('pending','not_possible') then clock_timestamp() end,
      p_receipt->>'undo', btrim(p_receipt->>'undoLabel'), btrim(p_receipt->>'actor'))
    returning id into created_id;
  exception
    when others then
      raise exception 'outside_write_receipt_invalid';
  end;
  return public.outside_write_receipt_row(created_id);
end;
$$;

-- The read-back is recorded once. Recording it never re-sends the write.
create function public.record_outside_write_readback(p_receipt_id uuid, p_readback text, p_detail text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.outside_write_receipts%rowtype;
begin
  if p_readback is null or p_readback not in ('matched','differs','failed','not_possible')
    or (p_detail is not null and char_length(p_detail) > 1000) then
    raise exception 'outside_write_receipt_invalid';
  end if;
  select * into existing from public.outside_write_receipts where id = p_receipt_id for update;
  if not found then raise exception 'outside_write_receipt_not_found'; end if;
  if existing.readback <> 'pending' then
    if existing.readback = p_readback then return public.outside_write_receipt_row(p_receipt_id); end if;
    raise exception 'outside_write_receipt_immutable';
  end if;
  update public.outside_write_receipts set readback = p_readback, readback_detail = p_detail, readback_at = clock_timestamp()
    where id = p_receipt_id;
  return public.outside_write_receipt_row(p_receipt_id);
end;
$$;

create function public.read_outside_write_receipts(
  p_user_id uuid, p_verified_email text, p_tenant_id text, p_workspace_id uuid, p_limit integer
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'operator_queue_invalid'; end if;
  return coalesce((select jsonb_agg(public.outside_write_receipt_row(r.id) order by r.created_at desc)
    from (select id, created_at from public.outside_write_receipts
          where (p_tenant_id is null or tenant_id = p_tenant_id)
            and (p_workspace_id is null or workspace_id = p_workspace_id)
          order by created_at desc limit p_limit) r), '[]'::jsonb);
end;
$$;

revoke all on function public.operator_queue_append_only() from public, anon, authenticated;
revoke all on function public.operator_queue_assert_operator(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.operator_queue_mark_row(text,text) from public, anon, authenticated, service_role;
revoke all on function public.outside_write_receipt_row(uuid) from public, anon, authenticated, service_role;
revoke all on function public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.read_operator_queue_context(uuid,text) from public, anon, authenticated;
revoke all on function public.record_outside_write_receipt(jsonb) from public, anon, authenticated;
revoke all on function public.record_outside_write_readback(uuid,text,text) from public, anon, authenticated;
revoke all on function public.read_outside_write_receipts(uuid,text,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.read_operator_queue_context(uuid,text) to service_role;
grant execute on function public.record_outside_write_receipt(jsonb) to service_role;
grant execute on function public.record_outside_write_readback(uuid,text,text) to service_role;
grant execute on function public.read_outside_write_receipts(uuid,text,text,uuid,integer) to service_role;
