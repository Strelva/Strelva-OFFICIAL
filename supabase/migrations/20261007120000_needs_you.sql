-- Needs you and Strelva handled (docs/product/specs/needs-you.md). Additive
-- only. It does not alter tenants, Redis events, /api/v1, website documents,
-- service requests or any lifecycle table, and it sends nothing.
--
-- Shape
--   decision_policies          who decides, per business, per System (or every
--                              System, system_key '*'), per change kind, in two
--                              layers: 'strelva' (Strelva's default) and
--                              'owner' (the owner's stricter setting).
--   decision_policy_history    one immutable receipt per policy change, with
--                              the old and new route.
--   owner_decisions            one Needs you item: what the owner (or a Strelva
--                              operator, for strelva_reviews) is deciding,
--                              bound to its source lifecycle, source id and a
--                              revision hash. Delivery, reminders, expiry and
--                              outcome live on the row.
--   owner_decision_deliveries  immutable log of every email attempt for an
--                              item, including "suppressed" (owner not told).
--
-- Rules held here and mirrored by src/platform/needs-you/contracts.ts (a
-- Vitest parity test reads both):
--   * the route ladder is handle < handle_after_notice < strelva_reviews <
--     owner_decides; no stored route is ever below its kind's floor;
--   * an owner may only make a route stricter, and may loosen it back only as
--     far as Strelva's default (clearing the owner row);
--   * an operator never decides an owner_decides item, and an owner never
--     decides a strelva_reviews item (it is escalated to them first);
--   * access.grant, money and exit always require a sign-in: a one-tap link
--     is refused for them;
--   * a link decision binds the item revision and the recipient, and the
--     recipient must still be the business's owner recipient at decision time;
--   * Needs you records the decision and its outcome. The lifecycle that owns
--     the change performs it through its own resolver; nothing here writes to
--     another lifecycle's tables.
--
-- All tables are RLS-on with every grant revoked; only the service-role
-- functions below reach them, and each actor-facing one rechecks the actor.

create function public.needs_you_route_rank(p_route text) returns integer
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  return case p_route
    when 'handle' then 0
    when 'handle_after_notice' then 1
    when 'strelva_reviews' then 2
    when 'owner_decides' then 3
    else null end;
end;
$$;

create function public.needs_you_change_kinds() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['fact.owner_stated','fact.inferred','copy.routine','copy.marketing','structure',
    'google.post','google.photo','review.reply','review.reply_critical','customer.message',
    'customer.commitment','customer.broadcast','system.go_live','system.change_live','system.pause',
    'running.approve','request.scope','access.grant','money','exit','health.fix',
    'health.owner_action','verify.failed','suggestion']::text[]
$$;

-- Floors and defaults for the kinds a policy can set. suggestion and
-- health.owner_action are never decisions, so they have neither.
create function public.needs_you_kind_floor(p_kind text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_kind
    when 'fact.owner_stated' then 'handle'
    when 'fact.inferred' then 'owner_decides'
    when 'copy.routine' then 'handle'
    when 'copy.marketing' then 'strelva_reviews'
    when 'structure' then 'owner_decides'
    when 'google.post' then 'handle_after_notice'
    when 'google.photo' then 'handle_after_notice'
    when 'review.reply' then 'handle_after_notice'
    when 'review.reply_critical' then 'strelva_reviews'
    when 'customer.message' then 'strelva_reviews'
    when 'customer.commitment' then 'owner_decides'
    when 'customer.broadcast' then 'owner_decides'
    when 'system.go_live' then 'owner_decides'
    when 'system.change_live' then 'strelva_reviews'
    when 'system.pause' then 'owner_decides'
    when 'running.approve' then 'owner_decides'
    when 'request.scope' then 'owner_decides'
    when 'access.grant' then 'owner_decides'
    when 'money' then 'owner_decides'
    when 'exit' then 'owner_decides'
    when 'health.fix' then 'handle'
    when 'verify.failed' then 'strelva_reviews'
    else null end
$$;

create function public.needs_you_kind_default(p_kind text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_kind
    when 'fact.owner_stated' then 'handle'
    when 'fact.inferred' then 'owner_decides'
    when 'copy.routine' then 'strelva_reviews'
    when 'copy.marketing' then 'strelva_reviews'
    when 'structure' then 'owner_decides'
    when 'google.post' then 'strelva_reviews'
    when 'google.photo' then 'strelva_reviews'
    when 'review.reply' then 'handle_after_notice'
    when 'review.reply_critical' then 'owner_decides'
    when 'customer.message' then 'owner_decides'
    when 'customer.commitment' then 'owner_decides'
    when 'customer.broadcast' then 'owner_decides'
    when 'system.go_live' then 'owner_decides'
    when 'system.change_live' then 'owner_decides'
    when 'system.pause' then 'owner_decides'
    when 'running.approve' then 'owner_decides'
    when 'request.scope' then 'owner_decides'
    when 'access.grant' then 'owner_decides'
    when 'money' then 'owner_decides'
    when 'exit' then 'owner_decides'
    when 'health.fix' then 'handle'
    when 'verify.failed' then 'strelva_reviews'
    else null end
$$;

create function public.needs_you_sign_in_kind(p_kind text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_kind in ('access.grant','money','exit')
$$;

create table public.decision_policies (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_key text not null default '*'
    check (system_key = '*' or system_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  change_kind text not null check (public.needs_you_kind_floor(change_kind) is not null),
  layer text not null check (layer in ('strelva','owner')),
  route text not null check (public.needs_you_route_rank(route) is not null),
  set_by uuid not null references public.users(id) on delete restrict,
  set_reason text not null check (set_reason in ('strelva_default','owner_setting','earned_trust','seed','inquiry_promote')),
  version bigint not null check (version > 0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, system_key, change_kind, layer),
  -- No stored route is ever below its kind's floor.
  check (public.needs_you_route_rank(route) >= public.needs_you_route_rank(public.needs_you_kind_floor(change_kind)))
);

create table public.decision_policy_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_key text not null,
  change_kind text not null,
  layer text not null check (layer in ('strelva','owner')),
  old_route text check (old_route is null or public.needs_you_route_rank(old_route) is not null),
  new_route text check (new_route is null or public.needs_you_route_rank(new_route) is not null),
  set_by uuid not null references public.users(id) on delete restrict,
  set_reason text not null check (set_reason in ('strelva_default','owner_setting','owner_reset','earned_trust','seed','inquiry_promote','strelva_reset')),
  version bigint not null check (version > 0),
  created_at timestamptz not null default clock_timestamp()
);
create index decision_policy_history_workspace_idx on public.decision_policy_history(workspace_id, created_at desc, id);

create table public.owner_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_id uuid,
  change_kind text not null check (change_kind = any(public.needs_you_change_kinds())),
  route text not null check (route in ('strelva_reviews','owner_decides')),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  detail text check (detail is null or char_length(detail) <= 1000),
  approve_effect text not null check (char_length(approve_effect) between 1 and 300),
  not_yet_effect text not null check (char_length(not_yet_effect) between 1 and 300),
  source_lifecycle text not null check (source_lifecycle ~ '^[a-z][a-z0-9_]{1,39}$'),
  source_id text not null check (char_length(source_id) between 1 and 300 and source_id = btrim(source_id)),
  revision_hash text not null check (revision_hash ~ '^[0-9a-f]{64}$'),
  urgent boolean not null default false,
  sign_in_required boolean not null,
  admin_may_decide boolean not null default false,
  open_href text check (open_href is null or (char_length(open_href) <= 500 and open_href ~ '^/')),
  state text not null default 'open'
    check (state in ('open','approved','declined','expired','withdrawn','superseded')),
  outcome text check (outcome is null or outcome in ('done','done_unverified','failed')),
  outcome_reason text check (outcome_reason is null or char_length(outcome_reason) <= 500),
  receipt_ref text check (receipt_ref is null or char_length(receipt_ref) <= 300),
  decided_by_kind text check (decided_by_kind is null or decided_by_kind in
    ('owner_link','owner_session','admin_session','member_session','operator','expiry','system')),
  decided_by text check (decided_by is null or char_length(decided_by) <= 320),
  decided_at timestamptz,
  delivery_state text not null default 'not_sent'
    check (delivery_state in ('not_sent','sent','suppressed','bounced','reminded_1','reminded_2')),
  operator_note text check (operator_note is null or char_length(operator_note) <= 1000),
  opened_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  reminded_1_at timestamptz,
  reminded_2_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, source_lifecycle, source_id, revision_hash),
  -- Fixed rule: access, money and exit always need a sign-in.
  check (sign_in_required = public.needs_you_sign_in_kind(change_kind)),
  -- Suggestions and owner actions are never decisions.
  check (change_kind not in ('suggestion','health.owner_action')),
  check (expires_at > opened_at),
  check ((state = 'open') = (decided_at is null)),
  check (outcome is null or state in ('approved','declined','expired'))
);
create unique index owner_decisions_one_open_idx on public.owner_decisions(workspace_id, source_lifecycle, source_id)
  where state = 'open';
create index owner_decisions_workspace_idx on public.owner_decisions(workspace_id, state, opened_at, id);
create index owner_decisions_open_idx on public.owner_decisions(opened_at, id) where state = 'open';

create table public.owner_decision_deliveries (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.owner_decisions(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('urgent','digest','reminder_1','reminder_2')),
  status text not null check (status in ('sent','suppressed','bounced','failed')),
  recipient text check (recipient is null or char_length(recipient) <= 320),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default clock_timestamp()
);
create index owner_decision_deliveries_decision_idx on public.owner_decision_deliveries(decision_id, created_at);

alter table public.decision_policies enable row level security;
alter table public.decision_policy_history enable row level security;
alter table public.owner_decisions enable row level security;
alter table public.owner_decision_deliveries enable row level security;
revoke all on public.decision_policies, public.decision_policy_history, public.owner_decisions,
  public.owner_decision_deliveries from public, anon, authenticated, service_role;

create function public.needs_you_history_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'needs_you_history_immutable';
end;
$$;
create trigger decision_policy_history_immutable before update or delete on public.decision_policy_history
  for each row execute function public.needs_you_history_immutable();
create trigger owner_decision_deliveries_immutable before update or delete on public.owner_decision_deliveries
  for each row execute function public.needs_you_history_immutable();

-- The item's identity, source and what it asks never change after it opens.
create function public.owner_decision_identity_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.workspace_id <> old.workspace_id or new.change_kind <> old.change_kind
    or new.source_lifecycle <> old.source_lifecycle or new.source_id <> old.source_id
    or new.revision_hash <> old.revision_hash or new.title <> old.title
    or new.approve_effect <> old.approve_effect or new.not_yet_effect <> old.not_yet_effect
    or new.sign_in_required <> old.sign_in_required or new.opened_at <> old.opened_at
    or new.system_id is distinct from old.system_id then
    raise exception 'owner_decision_identity_immutable';
  end if;
  -- A closed item never reopens, and an outcome, once written, never changes.
  if old.state <> 'open' and new.state <> old.state then raise exception 'owner_decision_closed'; end if;
  if old.outcome is not null and new.outcome is distinct from old.outcome then raise exception 'owner_decision_closed'; end if;
  -- Only an open strelva_reviews item may move, and only to owner_decides.
  if new.route <> old.route and not (old.state = 'open' and old.route = 'strelva_reviews' and new.route = 'owner_decides') then
    raise exception 'owner_decision_route_immutable';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger owner_decisions_identity_guard before update on public.owner_decisions
  for each row execute function public.owner_decision_identity_guard();

-- Actor helpers ---------------------------------------------------------------

create function public.needs_you_member_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then return null; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
    join public.users u on u.id = wm.user_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
      and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    for share of wm;
  return actor_role;
end;
$$;

create function public.needs_you_operator_id(p_user_id uuid, p_verified_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  if p_user_id is null or p_verified_email is null then return null; end if;
  select u.id into operator_id from public.users u
    join public.super_admins sa on sa.user_id = u.id and sa.revoked_at is null
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null;
  return operator_id;
end;
$$;

-- Strelva's layer for one kind on one System: the System row, else the
-- business row, else the code default.
create function public.needs_you_strelva_route(p_workspace_id uuid, p_system_key text, p_kind text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select route from public.decision_policies where workspace_id = p_workspace_id and system_key = p_system_key
       and change_kind = p_kind and layer = 'strelva' and p_system_key <> '*'),
    (select route from public.decision_policies where workspace_id = p_workspace_id and system_key = '*'
       and change_kind = p_kind and layer = 'strelva'),
    public.needs_you_kind_default(p_kind))
$$;

-- Policy -----------------------------------------------------------------------

-- Set or clear (p_route null) one layer of one kind. Layer 'owner' is for an
-- owner of the business and only makes a route stricter than Strelva's; layer
-- 'strelva' is for a Strelva operator and never goes below the floor.
create function public.set_decision_policy(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_layer text, p_system_id uuid,
  p_kind text, p_route text, p_reason text, p_expected_version bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_system_key text := coalesce(p_system_id::text, '*');
  current_row public.decision_policies%rowtype;
  current_version bigint;
  strelva_route text;
  reason text := p_reason;
  history_reason text;
  next_version bigint;
begin
  if p_layer not in ('strelva','owner') then raise exception 'decision_policy_invalid'; end if;
  if public.needs_you_kind_floor(p_kind) is null then raise exception 'decision_policy_invalid'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) is null then raise exception 'decision_policy_invalid'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'decision_policy_access_denied'; end if;
  if p_layer = 'owner' then
    if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is distinct from 'owner' then
      raise exception 'decision_policy_access_denied';
    end if;
    reason := 'owner_setting';
  else
    if public.needs_you_operator_id(p_user_id, p_verified_email) is null then
      raise exception 'decision_policy_access_denied';
    end if;
    if reason is null or reason not in ('strelva_default','earned_trust','seed','inquiry_promote') then
      raise exception 'decision_policy_invalid';
    end if;
  end if;
  if p_system_id is not null and not exists (select 1 from public.systems s
      where s.id = p_system_id and s.business_workspace_id = p_workspace_id) then
    raise exception 'decision_policy_access_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('decision_policy:' || p_workspace_id::text, 0));
  select * into current_row from public.decision_policies
    where workspace_id = p_workspace_id and decision_policies.system_key = v_system_key
      and change_kind = p_kind and layer = p_layer for update;
  current_version := coalesce(current_row.version, 0);
  if p_expected_version is distinct from current_version then raise exception 'decision_policy_version_conflict'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) < public.needs_you_route_rank(public.needs_you_kind_floor(p_kind)) then
    raise exception 'decision_policy_below_floor';
  end if;
  if p_layer = 'owner' and p_route is not null then
    strelva_route := public.needs_you_strelva_route(p_workspace_id, v_system_key, p_kind);
    if public.needs_you_route_rank(p_route) < public.needs_you_route_rank(strelva_route) then
      raise exception 'decision_policy_looser_than_default';
    end if;
  end if;
  next_version := current_version + 1;
  if p_route is null then
    if current_row.workspace_id is null then return public.read_decision_policy_state(p_workspace_id, p_system_id, p_kind); end if;
    delete from public.decision_policies where workspace_id = p_workspace_id
      and decision_policies.system_key = v_system_key and change_kind = p_kind and layer = p_layer;
    history_reason := case when p_layer = 'owner' then 'owner_reset' else 'strelva_reset' end;
  else
    insert into public.decision_policies(workspace_id, system_key, change_kind, layer, route, set_by, set_reason, version)
      values (p_workspace_id, v_system_key, p_kind, p_layer, p_route, p_user_id, reason, next_version)
      on conflict (workspace_id, system_key, change_kind, layer) do update
        set route = excluded.route, set_by = excluded.set_by, set_reason = excluded.set_reason,
            version = excluded.version, updated_at = clock_timestamp();
    history_reason := reason;
  end if;
  insert into public.decision_policy_history(workspace_id, system_key, change_kind, layer, old_route, new_route, set_by, set_reason, version)
    values (p_workspace_id, v_system_key, p_kind, p_layer, current_row.route, p_route, p_user_id, history_reason, next_version);
  return public.read_decision_policy_state(p_workspace_id, p_system_id, p_kind);
end;
$$;

-- The effective route of one kind on one System with the rows that made it.
create function public.read_decision_policy_state(p_workspace_id uuid, p_system_id uuid, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_system_key text := coalesce(p_system_id::text, '*');
  strelva_route text := public.needs_you_strelva_route(p_workspace_id, v_system_key, p_kind);
  owner_route text;
  effective text;
begin
  select route into owner_route from public.decision_policies
    where workspace_id = p_workspace_id and layer = 'owner' and change_kind = p_kind
      and (decision_policies.system_key = '*' or decision_policies.system_key = v_system_key)
    order by public.needs_you_route_rank(route) desc limit 1;
  effective := strelva_route;
  if public.needs_you_route_rank(public.needs_you_kind_floor(p_kind)) > public.needs_you_route_rank(effective) then
    effective := public.needs_you_kind_floor(p_kind);
  end if;
  if owner_route is not null and public.needs_you_route_rank(owner_route) > public.needs_you_route_rank(effective) then
    effective := owner_route;
  end if;
  return jsonb_build_object('kind', p_kind, 'systemId', p_system_id, 'route', effective,
    'strelvaRoute', strelva_route, 'ownerRoute', owner_route, 'floor', public.needs_you_kind_floor(p_kind),
    'default', public.needs_you_kind_default(p_kind),
    'strelvaVersion', coalesce((select version from public.decision_policies where workspace_id = p_workspace_id
      and decision_policies.system_key = v_system_key and change_kind = p_kind and layer = 'strelva'), 0),
    'ownerVersion', coalesce((select version from public.decision_policies where workspace_id = p_workspace_id
      and decision_policies.system_key = v_system_key and change_kind = p_kind and layer = 'owner'), 0));
end;
$$;

-- Every stored setting and the latest policy receipts. Direct members of the
-- business and Strelva operators only.
create function public.read_decision_policies(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'decision_policy_access_denied';
  end if;
  return jsonb_build_object(
    'settings', coalesce((select jsonb_agg(jsonb_build_object('systemId', nullif(p.system_key, '*'), 'kind', p.change_kind,
        'layer', p.layer, 'route', p.route, 'reason', p.set_reason, 'version', p.version, 'updatedAt', p.updated_at)
        order by p.change_kind, p.system_key, p.layer)
      from public.decision_policies p where p.workspace_id = p_workspace_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(row_json order by created_at desc) from (
        select jsonb_build_object('id', h.id, 'systemId', nullif(h.system_key, '*'), 'kind', h.change_kind, 'layer', h.layer,
          'oldRoute', h.old_route, 'newRoute', h.new_route, 'reason', h.set_reason, 'version', h.version,
          'at', h.created_at) as row_json, h.created_at
        from public.decision_policy_history h where h.workspace_id = p_workspace_id
        order by h.created_at desc limit 50) recent), '[]'::jsonb));
end;
$$;

-- Items ------------------------------------------------------------------------

create function public.owner_decision_json(d public.owner_decisions) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', d.id, 'workspaceId', d.workspace_id, 'systemId', d.system_id,
    'kind', d.change_kind, 'route', d.route, 'title', d.title, 'detail', d.detail,
    'approveEffect', d.approve_effect, 'notYetEffect', d.not_yet_effect,
    'sourceLifecycle', d.source_lifecycle, 'sourceId', d.source_id, 'revisionHash', d.revision_hash,
    'urgent', d.urgent, 'signInRequired', d.sign_in_required, 'adminMayDecide', d.admin_may_decide,
    'openHref', d.open_href, 'state', d.state, 'outcome', d.outcome, 'outcomeReason', d.outcome_reason,
    'receiptRef', d.receipt_ref, 'decidedByKind', d.decided_by_kind, 'decidedAt', d.decided_at,
    'deliveryState', d.delivery_state, 'operatorNote', d.operator_note, 'openedAt', d.opened_at,
    'expiresAt', d.expires_at, 'reminded1At', d.reminded_1_at, 'reminded2At', d.reminded_2_at,
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'status', x.status,
        'providerMessageId', x.provider_message_id, 'reason', x.reason, 'at', x.created_at) order by x.created_at, x.id)
      from public.owner_decision_deliveries x where x.decision_id = d.id), '[]'::jsonb))
$$;

-- Open (or return) the item for one source revision. Server code calls this
-- after the evaluator routed a change to strelva_reviews or owner_decides. A
-- newer revision of the same source supersedes the open one, so its links
-- refuse. A closed item for the same revision is returned, never reopened.
create function public.open_owner_decision(p_workspace_id uuid, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.owner_decisions%rowtype;
  created public.owner_decisions%rowtype;
  v_kind text := p_item->>'kind';
  opened timestamptz := coalesce((p_item->>'openedAt')::timestamptz, clock_timestamp());
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'owner_decision_invalid'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'owner_decision_access_denied'; end if;
  if p_item ? 'systemId' and p_item->>'systemId' is not null and not exists (select 1 from public.systems s
      where s.id = (p_item->>'systemId')::uuid and s.business_workspace_id = p_workspace_id) then
    raise exception 'owner_decision_access_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('owner_decision:' || p_workspace_id::text || ':'
    || coalesce(p_item->>'sourceLifecycle', '') || ':' || coalesce(p_item->>'sourceId', ''), 0));
  select * into existing from public.owner_decisions
    where workspace_id = p_workspace_id and source_lifecycle = p_item->>'sourceLifecycle'
      and source_id = p_item->>'sourceId' and revision_hash = p_item->>'revisionHash';
  if found then return public.owner_decision_json(existing); end if;
  update public.owner_decisions set state = 'superseded', decided_at = clock_timestamp(), decided_by_kind = 'system'
    where workspace_id = p_workspace_id and source_lifecycle = p_item->>'sourceLifecycle'
      and source_id = p_item->>'sourceId' and state = 'open';
  begin
    insert into public.owner_decisions(workspace_id, system_id, change_kind, route, title, detail, approve_effect,
      not_yet_effect, source_lifecycle, source_id, revision_hash, urgent, sign_in_required, admin_may_decide,
      open_href, opened_at, expires_at)
    values (p_workspace_id, nullif(p_item->>'systemId', '')::uuid, v_kind, p_item->>'route', p_item->>'title',
      p_item->>'detail', p_item->>'approveEffect', p_item->>'notYetEffect', p_item->>'sourceLifecycle',
      p_item->>'sourceId', p_item->>'revisionHash', coalesce((p_item->>'urgent')::boolean, false),
      public.needs_you_sign_in_kind(v_kind), coalesce((p_item->>'adminMayDecide')::boolean, false),
      p_item->>'openHref', opened, opened + make_interval(days => 14))
    returning * into created;
  exception when check_violation or not_null_violation or invalid_text_representation then
    raise exception 'owner_decision_invalid';
  end;
  return public.owner_decision_json(created);
end;
$$;

-- Pull an open item (Strelva or an operator withdrew the change).
create function public.withdraw_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_value public.owner_decisions%rowtype;
begin
  update public.owner_decisions set state = 'withdrawn', decided_at = clock_timestamp(), decided_by_kind = 'system',
      outcome_reason = left(p_reason, 500)
    where id = p_decision_id and workspace_id = p_workspace_id and state = 'open'
    returning * into row_value;
  if not found then raise exception 'owner_decision_not_open'; end if;
  return public.owner_decision_json(row_value);
end;
$$;

-- The decision step. It records who decided and moves the item out of open;
-- it does not perform the change. The caller then runs the source lifecycle's
-- resolver and records the outcome with finish_owner_decision.
--
-- p_by_kind: owner_link (signed email link; p_recipient set, no user),
-- owner_session / admin_session / member_session (signed in; p_user_id set),
-- operator (Strelva staff; p_user_id set).
create function public.claim_owner_decision(
  p_workspace_id uuid, p_decision_id uuid, p_revision_hash text, p_decision text, p_by_kind text,
  p_user_id uuid, p_verified_email text, p_recipient text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.owner_decisions%rowtype;
  owner_recipient jsonb;
  actor_role text;
  v_decided_by text;
  by_kind text := p_by_kind;
begin
  if p_decision not in ('approve','not_yet') then raise exception 'owner_decision_invalid'; end if;
  if p_by_kind not in ('owner_link','session','operator') then raise exception 'owner_decision_invalid'; end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if item.state <> 'open' then
    return jsonb_build_object('status', case when item.state = 'superseded' then 'changed' else 'already_handled' end,
      'item', public.owner_decision_json(item));
  end if;
  if item.revision_hash <> p_revision_hash then
    return jsonb_build_object('status', 'changed', 'item', public.owner_decision_json(item));
  end if;
  if clock_timestamp() >= item.expires_at then
    return jsonb_build_object('status', 'expired', 'item', public.owner_decision_json(item));
  end if;

  if p_by_kind = 'owner_link' then
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if item.sign_in_required then raise exception 'owner_decision_sign_in_required'; end if;
    owner_recipient := public.resolve_business_owner_recipient(p_workspace_id);
    if owner_recipient is null or p_recipient is null
      or lower(btrim(owner_recipient->>'email')) <> lower(btrim(p_recipient)) then
      raise exception 'owner_decision_recipient_not_owner';
    end if;
    v_decided_by := lower(btrim(p_recipient));
  elsif p_by_kind = 'operator' then
    if public.needs_you_operator_id(p_user_id, p_verified_email) is null then
      raise exception 'owner_decision_permission_denied';
    end if;
    -- An operator never decides an item routed to the owner.
    if item.route = 'owner_decides' then raise exception 'owner_decision_owner_only'; end if;
    v_decided_by := p_user_id::text;
  else
    actor_role := public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email);
    if actor_role is null then raise exception 'owner_decision_permission_denied'; end if;
    -- A strelva_reviews item reaches the owner only after an operator escalates it.
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if not (actor_role = 'owner' or (actor_role = 'admin' and item.admin_may_decide)) then
      raise exception 'owner_decision_permission_denied';
    end if;
    by_kind := actor_role || '_session';
    v_decided_by := p_user_id::text;
  end if;

  update public.owner_decisions set
      state = case when p_decision = 'approve' then 'approved' else 'declined' end,
      decided_at = clock_timestamp(), decided_by_kind = by_kind, decided_by = v_decided_by
    where id = item.id returning * into item;
  return jsonb_build_object('status', 'claimed', 'item', public.owner_decision_json(item));
end;
$$;

-- Lapse an open item at its expiry. Silence never approves: the caller runs
-- the Not yet path and records "Expired, nothing changed".
create function public.expire_owner_decision(p_workspace_id uuid, p_decision_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype;
begin
  update public.owner_decisions set state = 'expired', decided_at = clock_timestamp(), decided_by_kind = 'expiry'
    where id = p_decision_id and workspace_id = p_workspace_id and state = 'open' and clock_timestamp() >= expires_at
    returning * into item;
  if not found then raise exception 'owner_decision_not_open'; end if;
  return public.owner_decision_json(item);
end;
$$;

-- Record what the source lifecycle's resolver did. Written once.
create function public.finish_owner_decision(
  p_workspace_id uuid, p_decision_id uuid, p_outcome text, p_reason text, p_receipt_ref text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype;
begin
  if p_outcome not in ('done','done_unverified','failed') then raise exception 'owner_decision_invalid'; end if;
  update public.owner_decisions set outcome = p_outcome, outcome_reason = left(p_reason, 500), receipt_ref = left(p_receipt_ref, 300)
    where id = p_decision_id and workspace_id = p_workspace_id and state in ('approved','declined','expired') and outcome is null
    returning * into item;
  if not found then raise exception 'owner_decision_not_claimed'; end if;
  return public.owner_decision_json(item);
end;
$$;

-- An operator who won't decide a strelva_reviews item hands it to the owner.
create function public.escalate_owner_decision(
  p_workspace_id uuid, p_decision_id uuid, p_user_id uuid, p_verified_email text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype;
begin
  if public.needs_you_operator_id(p_user_id, p_verified_email) is null then raise exception 'owner_decision_permission_denied'; end if;
  if p_note is null or char_length(btrim(p_note)) = 0 then raise exception 'owner_decision_invalid'; end if;
  update public.owner_decisions set route = 'owner_decides', operator_note = left(btrim(p_note), 1000),
      expires_at = greatest(expires_at, clock_timestamp() + make_interval(days => 14))
    where id = p_decision_id and workspace_id = p_workspace_id and state = 'open' and route = 'strelva_reviews'
    returning * into item;
  if not found then raise exception 'owner_decision_not_open'; end if;
  return public.owner_decision_json(item);
end;
$$;

-- Log one email attempt. Suppressed means the owner was never told, and the
-- operator queue shows it; an unseen ask is not an unanswered one.
create function public.record_owner_decision_delivery(
  p_workspace_id uuid, p_decision_id uuid, p_kind text, p_status text, p_recipient text,
  p_provider_message_id text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype;
begin
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  begin
    insert into public.owner_decision_deliveries(decision_id, workspace_id, kind, status, recipient, provider_message_id, reason)
      values (item.id, p_workspace_id, p_kind, p_status, lower(nullif(btrim(p_recipient), '')), p_provider_message_id, left(p_reason, 300));
  exception when check_violation then raise exception 'owner_decision_invalid';
  end;
  if item.state = 'open' then
    update public.owner_decisions set
        delivery_state = case
          when p_status = 'failed' then delivery_state
          when p_status in ('suppressed','bounced') then p_status
          when p_kind = 'reminder_1' then 'reminded_1'
          when p_kind = 'reminder_2' then 'reminded_2'
          else 'sent' end,
        reminded_1_at = case when p_kind = 'reminder_1' and p_status <> 'failed' then clock_timestamp() else reminded_1_at end,
        reminded_2_at = case when p_kind = 'reminder_2' and p_status <> 'failed' then clock_timestamp() else reminded_2_at end
      where id = item.id returning * into item;
  end if;
  return public.owner_decision_json(item);
end;
$$;

-- Needs you for one business. Members see the owner's items; Strelva
-- operators also see strelva_reviews items. Oldest first.
create function public.list_owner_decisions(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_include_closed boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_operator boolean;
begin
  v_operator := public.needs_you_operator_id(p_user_id, p_verified_email) is not null;
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null and not v_operator then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(public.owner_decision_json(d) order by d.opened_at, d.id)
    from public.owner_decisions d
    where d.workspace_id = p_workspace_id
      and (v_operator or d.route = 'owner_decides')
      and (d.state = 'open' or (p_include_closed and d.decided_at > clock_timestamp() - interval '30 days'))), '[]'::jsonb);
end;
$$;

-- The item behind a link. Server-only: the caller has already verified the
-- link's signature, and the response carries nothing the owner can't see.
create function public.read_owner_decision(p_workspace_id uuid, p_decision_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.owner_decision_json(d) from public.owner_decisions d
    where d.id = p_decision_id and d.workspace_id = p_workspace_id
$$;

-- The cron's work list: every open owner item, with its business's name,
-- timezone and owner recipient. Bounded.
create function public.list_open_owner_decisions_for_delivery(p_limit integer) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_json order by opened_at, id), '[]'::jsonb) from (
    select public.owner_decision_json(d) || jsonb_build_object(
        'businessName', w.name,
        'timezone', coalesce((select f.value->>'timezone' from public.business_record_facts f
          where f.workspace_id = d.workspace_id and f.fact_key = 'hours'), 'America/New_York'),
        'recipient', public.resolve_business_owner_recipient(d.workspace_id)) as row_json,
      d.opened_at, d.id
    from public.owner_decisions d join public.workspaces w on w.id = d.workspace_id
    where d.state = 'open' and d.route = 'owner_decides'
    order by d.opened_at, d.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000))) due
$$;

-- Converted businesses and the tenants they run, for the tenant adapter.
create function public.needs_you_linked_tenants(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('workspaceId', l.workspace_id, 'tenantId', t.id) order by l.linked_at, l.id), '[]'::jsonb)
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where p_workspace_id is null or l.workspace_id = p_workspace_id
$$;

-- The signed-in identity a link decision acts as on a workspace lifecycle:
-- the verified owner member whose email is the recipient. Null when the
-- recipient is not (or no longer) an owner member; the caller then refuses
-- and points the owner to sign in.
create function public.needs_you_owner_actor(p_workspace_id uuid, p_recipient text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('userId', u.id, 'verifiedEmail', lower(u.email))
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
    join public.users u on u.id = wm.user_id and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.role = 'owner'
      and lower(u.email) = lower(btrim(p_recipient))
    limit 1
$$;

-- Strelva handled ------------------------------------------------------------------

-- One read model over receipt stores that already exist. It writes nothing
-- and adds no receipt store. Undo is reported honestly: only the newest
-- record revision Strelva made is one-tap; anything with later changes needs
-- a look first; a website revision restores as a new draft for approval.
create function public.read_strelva_handled(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare since timestamptz := coalesce(p_since, clock_timestamp() - interval '7 days');
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(entry order by (entry->>'at') desc) from (
    select jsonb_build_object('store', 'business_record_revisions', 'id', r.sequence::text, 'at', r.created_at,
        'source', r.source, 'changes', (select coalesce(jsonb_agg((c->>'entity') || ':' || coalesce(c->>'id', '')), '[]'::jsonb) from jsonb_array_elements(r.changes) c),
        'undoOf', r.undo_of_sequence,
        'undo', case
          when r.undo_of_sequence is not null then 'not_undoable'
          when exists (select 1 from public.business_record_revisions u where u.workspace_id = r.workspace_id and u.undo_of_sequence = r.sequence) then 'undone'
          when exists (select 1 from public.business_record_revisions later where later.workspace_id = r.workspace_id and later.sequence > r.sequence) then 'undo_needs_review'
          else 'undo' end) as entry
      from public.business_record_revisions r
      where r.workspace_id = p_workspace_id and r.created_at >= since
        and r.source in ('operator','agent','website_rebuild','bookings','inquiries','tenant_import')
    union all
    select jsonb_build_object('store', 'website_document_receipts', 'id', x.id::text, 'at', x.created_at,
        'websiteWorkId', x.website_work_id, 'revision', x.revision, 'action', x.receipt->>'action',
        'undo', 'undo_needs_review')
      from public.website_document_receipts x
      where x.workspace_id = p_workspace_id and x.created_at >= since
    union all
    select jsonb_build_object('store', 'decision_policy_history', 'id', h.id::text, 'at', h.created_at,
        'kind', h.change_kind, 'layer', h.layer, 'oldRoute', h.old_route, 'newRoute', h.new_route, 'reason', h.set_reason,
        'undo', 'undo')
      from public.decision_policy_history h
      where h.workspace_id = p_workspace_id and h.created_at >= since
    union all
    select jsonb_build_object('store', 'owner_decisions', 'id', d.id::text, 'at', d.decided_at, 'kind', d.change_kind,
        'title', d.title, 'state', d.state, 'outcome', d.outcome, 'undo', 'not_undoable')
      from public.owner_decisions d
      where d.workspace_id = p_workspace_id and d.decided_at >= since and d.state = 'expired'
  ) entries), '[]'::jsonb);
end;
$$;

revoke all on function public.needs_you_route_rank(text) from public, anon, authenticated;
revoke all on function public.needs_you_change_kinds() from public, anon, authenticated;
revoke all on function public.needs_you_kind_floor(text) from public, anon, authenticated;
revoke all on function public.needs_you_kind_default(text) from public, anon, authenticated;
revoke all on function public.needs_you_sign_in_kind(text) from public, anon, authenticated;
revoke all on function public.needs_you_history_immutable() from public, anon, authenticated;
revoke all on function public.owner_decision_identity_guard() from public, anon, authenticated;
revoke all on function public.needs_you_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.needs_you_operator_id(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.needs_you_strelva_route(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.owner_decision_json(public.owner_decisions) from public, anon, authenticated, service_role;

revoke all on function public.set_decision_policy(uuid, uuid, text, text, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.read_decision_policy_state(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_decision_policies(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.open_owner_decision(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.withdraw_owner_decision(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_owner_decision(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_owner_decision(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.escalate_owner_decision(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_owner_decision_delivery(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_owner_decisions(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.read_owner_decision(uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_open_owner_decisions_for_delivery(integer) from public, anon, authenticated;
revoke all on function public.needs_you_linked_tenants(uuid) from public, anon, authenticated;
revoke all on function public.needs_you_owner_actor(uuid, text) from public, anon, authenticated;
revoke all on function public.read_strelva_handled(uuid, uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.set_decision_policy(uuid, uuid, text, text, uuid, text, text, text, bigint) to service_role;
grant execute on function public.read_decision_policy_state(uuid, uuid, text) to service_role;
grant execute on function public.read_decision_policies(uuid, uuid, text) to service_role;
grant execute on function public.open_owner_decision(uuid, jsonb) to service_role;
grant execute on function public.withdraw_owner_decision(uuid, uuid, text) to service_role;
grant execute on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) to service_role;
grant execute on function public.expire_owner_decision(uuid, uuid) to service_role;
grant execute on function public.finish_owner_decision(uuid, uuid, text, text, text) to service_role;
grant execute on function public.escalate_owner_decision(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.record_owner_decision_delivery(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.list_owner_decisions(uuid, uuid, text, boolean) to service_role;
grant execute on function public.read_owner_decision(uuid, uuid) to service_role;
grant execute on function public.list_open_owner_decisions_for_delivery(integer) to service_role;
grant execute on function public.needs_you_linked_tenants(uuid) to service_role;
grant execute on function public.needs_you_owner_actor(uuid, text) to service_role;
grant execute on function public.read_strelva_handled(uuid, uuid, text, timestamptz) to service_role;
