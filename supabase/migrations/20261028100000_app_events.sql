-- Events Apps receive: a per-business outbox of what happened, in order.
-- Postgres records ten kinds of Event (ids, kinds, times and statuses only,
-- never customer details). Capture is a database switch that starts off.
-- Delivery to App handlers, outside Webhooks and coding agents reads from here.
-- The write paths that feed the outbox are in 20261028100100_app_event_sources.sql.
begin;
set local lock_timeout = '3s';

-- The release flag name: its own row per business, default off.
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['app_events']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

create function public.app_event_types() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['inquiry.received','booking.made','booking.changed','fact.changed','fact.confirmed',
    'release.recorded','change.verified','review.posted','connection.changed','owner.decided']::text[]
$$;

create function public.app_event_history_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'app_event_history_immutable'; end;
$$;

create table public.app_event_settings (
  id boolean primary key default true check (id),
  capture boolean not null default false,
  changed_by uuid references public.users(id) on delete restrict,
  changed_at timestamptz,
  reason text check (reason is null or char_length(btrim(reason)) between 3 and 500)
);
insert into public.app_event_settings(id, capture) values (true, false);

create table public.app_event_capture_changes (
  id uuid primary key default gen_random_uuid(),
  capture boolean not null,
  changed_by uuid not null references public.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_at timestamptz not null default clock_timestamp()
);
create trigger app_event_capture_changes_immutable_trg before update or delete on public.app_event_capture_changes
  for each row execute function public.app_event_history_immutable();

create table public.app_event_streams (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  type text not null check (type = any(public.app_event_types())),
  schema_version smallint not null default 1,
  subject_kind text not null check (subject_kind in ('inquiry','booking','fact','service','system','review','connection','decision')),
  subject_id text not null check (char_length(subject_id) between 1 and 300),
  area text check (area is null or area in ('website','inquiries','bookings','google','internal_tools')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (char_length(idempotency_key) between 3 and 300),
  unique (workspace_id, sequence),
  unique (workspace_id, idempotency_key)
);
create index app_events_recorded_idx on public.app_events(recorded_at);

-- No foreign keys: a failed emission must be recordable in any state.
create table public.app_event_emit_failures (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  type text,
  idempotency_key text,
  sqlstate text,
  message text check (char_length(message) <= 500),
  at timestamptz not null default clock_timestamp()
);
create index app_event_emit_failures_at_idx on public.app_event_emit_failures(at);

create table public.app_event_cursors (
  subscriber text not null check (subscriber ~ '^(app:[a-z_]{2,40}:[a-z][a-z0-9_]{1,39}|webhook:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  delivered_through bigint not null default 0,
  attempts integer not null default 0 check (attempts between 0 and 50),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (subscriber, workspace_id)
);
create index app_event_cursors_next_idx on public.app_event_cursors(next_attempt_at);

-- A snapshot, so purging events never loses a replayable dead letter.
create table public.app_event_dead_letters (
  id uuid primary key default gen_random_uuid(),
  subscriber text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid,
  sequence bigint not null,
  type text not null,
  subject_kind text not null,
  subject_id text not null,
  area text,
  payload jsonb not null,
  occurred_at timestamptz not null,
  attempts integer not null,
  last_error text,
  dead_at timestamptz not null default clock_timestamp(),
  replay_requested_at timestamptz,
  replay_requested_by uuid references public.users(id) on delete set null,
  replay_lease_token uuid,
  replay_lease_until timestamptz,
  replayed_at timestamptz,
  replay_outcome text check (replay_outcome is null or replay_outcome in ('delivered','failed')),
  unique (subscriber, event_id)
);
create index app_event_dead_letters_workspace_idx on public.app_event_dead_letters(workspace_id, dead_at desc);
create index app_event_dead_letters_dead_idx on public.app_event_dead_letters(dead_at);

create table public.app_event_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by_kind text not null check (created_by_kind in ('business','agency')),
  agency_workspace_id uuid references public.workspaces(id) on delete cascade,
  url text not null check (url ~ '^https://[^\s/:@]+(:443)?(/[^\s]*)?$' and char_length(url) <= 500),
  event_types text[] not null check (cardinality(event_types) between 1 and 10 and event_types <@ public.app_event_types()),
  secret_ciphertext text not null check (secret_ciphertext ~ '^enc:v1:'),
  secret_hint text not null check (secret_hint ~ '^[A-Za-z0-9_-]{4}$'),
  status text not null default 'active' check (status in ('active','paused','disabled')),
  disabled_reason text check (disabled_reason is null or disabled_reason in ('gone','authority_removed','by_person')),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((created_by_kind = 'agency') = (agency_workspace_id is not null))
);
create index app_event_webhook_endpoints_workspace_idx on public.app_event_webhook_endpoints(workspace_id, status);

create table public.app_event_webhook_endpoint_changes (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null,
  workspace_id uuid not null,
  action text not null check (action in ('created','paused','resumed','disabled','secret_rotated','auto_disabled')),
  actor_id uuid references public.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('business','agency','operator','system')),
  agency_workspace_id uuid,
  at timestamptz not null default clock_timestamp()
);
create index app_event_webhook_endpoint_changes_endpoint_idx on public.app_event_webhook_endpoint_changes(endpoint_id, at desc);
create trigger app_event_webhook_endpoint_changes_immutable_trg before update or delete on public.app_event_webhook_endpoint_changes
  for each row execute function public.app_event_history_immutable();

alter table public.app_event_settings enable row level security;
alter table public.app_event_capture_changes enable row level security;
alter table public.app_event_streams enable row level security;
alter table public.app_events enable row level security;
alter table public.app_event_emit_failures enable row level security;
alter table public.app_event_cursors enable row level security;
alter table public.app_event_dead_letters enable row level security;
alter table public.app_event_webhook_endpoints enable row level security;
alter table public.app_event_webhook_endpoint_changes enable row level security;
revoke all on public.app_event_settings, public.app_event_capture_changes, public.app_event_streams, public.app_events,
  public.app_event_emit_failures, public.app_event_cursors, public.app_event_dead_letters,
  public.app_event_webhook_endpoints, public.app_event_webhook_endpoint_changes
  from public, anon, authenticated, service_role;

-- Internal helpers (never granted).

create function public.app_event_capture_on() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select s.capture from public.app_event_settings s where s.id), false)
$$;

create function public.app_event_static_area(p_type text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_type = 'inquiry.received' then 'inquiries'
    when p_type like 'booking.%' then 'bookings'
    when p_type = 'change.verified' then 'website'
    else null end
$$;

create function public.app_event_json(e public.app_events) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'sequence', e.sequence, 'type', e.type,
    'schemaVersion', e.schema_version, 'subject', jsonb_build_object('kind', e.subject_kind, 'id', e.subject_id),
    'area', e.area, 'occurredAt', e.occurred_at, 'recordedAt', e.recorded_at, 'data', e.payload)
$$;

-- The stream row lock is held to commit, so inside one business sequence order
-- equals commit order and a reader never sees a gap close behind its cursor.
create function public.app_event_emit(p_workspace_id uuid, p_type text, p_subject_kind text, p_subject_id text, p_area text,
  p_payload jsonb, p_occurred_at timestamptz, p_idempotency_key text) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare seq bigint; event_id uuid;
begin
  if p_workspace_id is null or not public.app_event_capture_on() then return null; end if;
  perform 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer';
  if not found then return null; end if;
  insert into public.app_event_streams(workspace_id) values (p_workspace_id) on conflict do nothing;
  perform 1 from public.app_event_streams s where s.workspace_id = p_workspace_id for update;
  perform 1 from public.app_events e where e.workspace_id = p_workspace_id and e.idempotency_key = p_idempotency_key;
  if found then return null; end if;
  update public.app_event_streams set last_sequence = last_sequence + 1, updated_at = clock_timestamp()
    where workspace_id = p_workspace_id returning last_sequence into seq;
  insert into public.app_events(workspace_id, sequence, type, subject_kind, subject_id, area, payload, occurred_at, idempotency_key)
    values (p_workspace_id, seq, p_type, p_subject_kind, p_subject_id, coalesce(p_area, public.app_event_static_area(p_type)),
      p_payload, coalesce(p_occurred_at, clock_timestamp()), p_idempotency_key)
    returning id into event_id;
  return event_id;
end;
$$;

-- Triggers call only this: an emission failure never fails the source write.
create function public.app_event_emit_safe(p_workspace_id uuid, p_type text, p_subject_kind text, p_subject_id text, p_area text,
  p_payload jsonb, p_occurred_at timestamptz, p_idempotency_key text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  begin
    perform public.app_event_emit(p_workspace_id, p_type, p_subject_kind, p_subject_id, p_area, p_payload, p_occurred_at, p_idempotency_key);
  exception when others then
    insert into public.app_event_emit_failures(workspace_id, type, idempotency_key, sqlstate, message)
      values (p_workspace_id, p_type, p_idempotency_key, SQLSTATE, left(SQLERRM, 500));
  end;
end;
$$;

-- Who is asking. Takes no locks; writers lock the same rows afterwards.
create function public.app_event_actor_scope(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_agency_id uuid, p_write boolean)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare member_role text;
begin
  if not exists (select 1 from public.users u where u.id = p_user_id
      and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer')
    or public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_access_denied';
  end if;
  if p_agency_id is null then
    select m.role into member_role from public.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
    if member_role is null then raise exception 'workspace_access_denied'; end if;
    if p_write and member_role not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
    return jsonb_build_object('kind', 'business', 'role', member_role, 'canChange', member_role in ('owner','admin'));
  end if;
  select m.role into member_role from public.workspace_memberships m
    join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
    where m.workspace_id = p_agency_id and m.user_id = p_user_id;
  if member_role is null then raise exception 'workspace_access_denied'; end if;
  if not exists (select 1 from public.provider_seats s where s.customer_workspace_id = p_workspace_id
      and s.agency_workspace_id = p_agency_id and s.status = 'active') then
    raise exception 'workspace_access_denied';
  end if;
  if member_role in ('owner','admin') then
    return jsonb_build_object('kind', 'agency', 'agencyId', p_agency_id, 'role', member_role, 'canChange', true);
  end if;
  if p_write then raise exception 'workspace_access_denied'; end if;
  if not exists (select 1 from public.agency_client_staff st where st.agency_workspace_id = p_agency_id
      and st.customer_workspace_id = p_workspace_id and st.user_id = p_user_id and st.status = 'active') then
    raise exception 'workspace_access_denied';
  end if;
  return jsonb_build_object('kind', 'agency', 'agencyId', p_agency_id, 'role', member_role, 'canChange', false);
end;
$$;

-- Writers take share locks on the rows the scope read, then read the scope again.
create function public.app_event_lock_scope(p_workspace_id uuid, p_user_id uuid, p_agency_id uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u where u.id = p_user_id for share;
  if p_agency_id is null then
    perform 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id for share;
  else
    perform 1 from public.workspace_memberships m where m.workspace_id = p_agency_id and m.user_id = p_user_id for share;
    perform 1 from public.provider_seats s where s.agency_workspace_id = p_agency_id and s.customer_workspace_id = p_workspace_id
      and s.status = 'active' for share;
    perform 1 from public.agency_client_staff st where st.agency_workspace_id = p_agency_id
      and st.customer_workspace_id = p_workspace_id and st.user_id = p_user_id and st.status = 'active' for share;
  end if;
end;
$$;

create function public.app_event_webhook_allows(p_endpoint public.app_event_webhook_endpoints, p_event public.app_events) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_endpoint.status <> 'active' or not (p_event.type = any(p_endpoint.event_types)) then return false; end if;
  if p_endpoint.created_by_kind = 'business' then
    return exists (select 1 from public.workspace_memberships m where m.workspace_id = p_endpoint.workspace_id
      and m.user_id = p_endpoint.created_by and m.role in ('owner','admin'));
  end if;
  if not exists (select 1 from public.provider_seats s where s.customer_workspace_id = p_endpoint.workspace_id
      and s.agency_workspace_id = p_endpoint.agency_workspace_id and s.status = 'active') then
    return false;
  end if;
  if not exists (select 1 from public.workspace_memberships m where m.workspace_id = p_endpoint.agency_workspace_id
      and m.user_id = p_endpoint.created_by and m.role in ('owner','admin')) then
    return false;
  end if;
  return p_event.area is null
    or public.connection_agency_holds_area(p_endpoint.agency_workspace_id, p_endpoint.workspace_id, p_event.area);
end;
$$;

-- Can this viewer see a lane or dead letter for this subscriber?
create function public.app_event_subscriber_visible(p_subscriber text, p_agency_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_agency_id is null or p_subscriber like 'app:%' or exists (
    select 1 from public.app_event_webhook_endpoints e
    where 'webhook:' || e.id::text = p_subscriber and e.agency_workspace_id = p_agency_id)
$$;

create function public.app_event_agency_name(p_agency_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when a.id is null then null
    when coalesce(nullif(a.agency_brand->>'displayName', ''), a.name) = 'Strelva' then 'Strelva Agency'
    else coalesce(nullif(a.agency_brand->>'displayName', ''), a.name) end
  from (select 1) one left join public.workspaces a on a.id = p_agency_id
$$;

create function public.app_event_endpoint_json(p_endpoint public.app_event_webhook_endpoints) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', p_endpoint.id, 'url', p_endpoint.url, 'eventTypes', to_jsonb(p_endpoint.event_types),
    'status', p_endpoint.status, 'disabledReason', p_endpoint.disabled_reason, 'secretHint', p_endpoint.secret_hint,
    'createdByKind', p_endpoint.created_by_kind,
    'agencyName', case when p_endpoint.agency_workspace_id is null then null
      else public.app_event_agency_name(p_endpoint.agency_workspace_id) end,
    'createdAt', p_endpoint.created_at)
$$;

-- The one view of deliveries. Agencies see App lanes and their own Webhooks only,
-- and counts only for areas they hold. secret_ciphertext is never returned.
create function public.app_event_deliveries_view(p_workspace_id uuid, p_viewer_kind text, p_can_change boolean, p_agency_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare stream_row public.app_event_streams; last_at timestamptz; counts jsonb; lanes jsonb; dead jsonb; endpoints jsonb;
begin
  select * into stream_row from public.app_event_streams s where s.workspace_id = p_workspace_id;
  select e.recorded_at into last_at from public.app_events e
    where e.workspace_id = p_workspace_id
      and (p_agency_id is null or e.area is null or public.connection_agency_holds_area(p_agency_id, p_workspace_id, e.area))
    order by e.sequence desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('type', c.type, 'count', c.n) order by c.type), '[]'::jsonb) into counts
    from (select e.type, count(*) as n from public.app_events e
      where e.workspace_id = p_workspace_id and e.recorded_at > clock_timestamp() - interval '7 days'
        and (p_agency_id is null or e.area is null or public.connection_agency_holds_area(p_agency_id, p_workspace_id, e.area))
      group by e.type) c;
  select coalesce(jsonb_agg(jsonb_build_object('subscriber', l.subscriber, 'deliveredThrough', l.delivered_through,
      'behind', greatest(coalesce(stream_row.last_sequence, 0) - l.delivered_through, 0), 'attempts', l.attempts,
      'nextAttemptAt', l.next_attempt_at, 'lastError', l.last_error) order by l.subscriber), '[]'::jsonb) into lanes
    from (select c.* from public.app_event_cursors c where c.workspace_id = p_workspace_id
      and public.app_event_subscriber_visible(c.subscriber, p_agency_id) order by c.subscriber limit 100) l;
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'subscriber', d.subscriber, 'eventId', d.event_id, 'type', d.type,
      'sequence', d.sequence, 'subjectKind', d.subject_kind, 'occurredAt', d.occurred_at, 'attempts', d.attempts,
      'lastError', d.last_error, 'deadAt', d.dead_at, 'replayRequestedAt', d.replay_requested_at,
      'replayedAt', d.replayed_at, 'replayOutcome', d.replay_outcome) order by d.dead_at desc, d.id), '[]'::jsonb) into dead
    from (select x.* from public.app_event_dead_letters x where x.workspace_id = p_workspace_id
      and public.app_event_subscriber_visible(x.subscriber, p_agency_id) order by x.dead_at desc, x.id limit 50) d;
  select coalesce(jsonb_agg(public.app_event_endpoint_json(w) order by w.created_at desc, w.id), '[]'::jsonb) into endpoints
    from (select x.* from public.app_event_webhook_endpoints x where x.workspace_id = p_workspace_id
      and (p_agency_id is null or x.agency_workspace_id = p_agency_id) order by x.created_at desc, x.id limit 50) w;
  return jsonb_build_object('workspaceId', p_workspace_id,
    'viewer', jsonb_build_object('kind', p_viewer_kind, 'canChange', p_can_change),
    'captureOn', public.app_event_capture_on(),
    'stream', jsonb_build_object('lastSequence', coalesce(stream_row.last_sequence, 0), 'lastEventAt', last_at),
    'counts', counts, 'lanes', lanes, 'deadLetters', dead, 'endpoints', endpoints);
end;
$$;

-- Dispatcher side (service role, called by the cron only).

create function public.app_event_recent_workspaces(p_limit int) returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(x.workspace_id order by x.updated_at desc), array[]::uuid[])
  from (select s.workspace_id, s.updated_at from public.app_event_streams s
    where s.updated_at > clock_timestamp() - interval '7 days'
    order by s.updated_at desc limit greatest(1, least(coalesce(p_limit, 200), 500))) x
$$;

create function public.app_event_ensure_cursors(p_pairs jsonb) returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' or jsonb_array_length(p_pairs) > 500 then raise exception 'app_events_invalid'; end if;
  if exists (select 1 from jsonb_array_elements(p_pairs) e where coalesce(e->>'subscriber', '') !~ '^app:') then
    raise exception 'app_events_invalid';
  end if;
  insert into public.app_event_cursors(subscriber, workspace_id, delivered_through)
    select distinct e->>'subscriber', (e->>'workspaceId')::uuid,
      coalesce((select s.last_sequence from public.app_event_streams s where s.workspace_id = (e->>'workspaceId')::uuid), 0)
    from jsonb_array_elements(p_pairs) e
    where exists (select 1 from public.workspaces w where w.id = (e->>'workspaceId')::uuid)
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.app_event_active_webhook_endpoints(p_limit int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'workspaceId', e.workspace_id, 'url', e.url,
    'eventTypes', to_jsonb(e.event_types), 'secretCiphertext', e.secret_ciphertext,
    'createdByKind', e.created_by_kind, 'agencyWorkspaceId', e.agency_workspace_id) order by e.created_at, e.id), '[]'::jsonb)
  from (select x.* from public.app_event_webhook_endpoints x where x.status = 'active' order by x.created_at, x.id
    limit greatest(1, least(coalesce(p_limit, 200), 500))) e
$$;

create function public.app_event_claim_lanes(p_subscribers text[], p_limit int, p_lease_seconds int, p_batch int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c public.app_event_cursors; endpoint public.app_event_webhook_endpoints; stream_last bigint; token uuid;
  lanes jsonb := '[]'::jsonb; events_json jsonb; ev public.app_events; allowed boolean; is_webhook boolean;
begin
  if p_subscribers is null or p_limit is null or p_limit not between 1 and 200
    or p_lease_seconds is null or p_lease_seconds not between 10 and 600
    or p_batch is null or p_batch not between 1 and 50 then
    raise exception 'app_events_invalid';
  end if;
  for c in
    select cur.* from public.app_event_cursors cur
      join public.app_event_streams s on s.workspace_id = cur.workspace_id
      where cur.subscriber = any(p_subscribers)
        and cur.next_attempt_at <= clock_timestamp()
        and (cur.lease_until is null or cur.lease_until < clock_timestamp())
        and s.last_sequence > cur.delivered_through
        and (cur.subscriber like 'app:%' or exists (select 1 from public.app_event_webhook_endpoints w
          where 'webhook:' || w.id::text = cur.subscriber and w.status = 'active'))
      order by cur.next_attempt_at, cur.workspace_id
      limit p_limit
      for update of cur skip locked
  loop
    select s.last_sequence into stream_last from public.app_event_streams s where s.workspace_id = c.workspace_id;
    is_webhook := c.subscriber like 'webhook:%';
    endpoint := null;
    if is_webhook then
      select * into endpoint from public.app_event_webhook_endpoints w
        where 'webhook:' || w.id::text = c.subscriber and w.status = 'active';
      if not found then continue; end if;
    end if;
    token := gen_random_uuid();
    events_json := '[]'::jsonb;
    for ev in
      select e.* from public.app_events e where e.workspace_id = c.workspace_id and e.sequence > c.delivered_through
        order by e.sequence limit p_batch
    loop
      allowed := case when is_webhook then public.app_event_webhook_allows(endpoint, ev) else true end;
      events_json := events_json || jsonb_build_array(public.app_event_json(ev) || jsonb_build_object('allowed', allowed));
    end loop;
    if jsonb_array_length(events_json) = 0 then
      update public.app_event_cursors set delivered_through = stream_last, lease_token = null, lease_until = null,
          attempts = 0, last_error = null, updated_at = clock_timestamp()
        where subscriber = c.subscriber and workspace_id = c.workspace_id;
      continue;
    end if;
    update public.app_event_cursors set lease_token = token,
        lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds), updated_at = clock_timestamp()
      where subscriber = c.subscriber and workspace_id = c.workspace_id;
    lanes := lanes || jsonb_build_array(jsonb_build_object('subscriber', c.subscriber, 'workspaceId', c.workspace_id,
      'leaseToken', token, 'attempts', c.attempts, 'deliveredThrough', c.delivered_through, 'events', events_json));
  end loop;
  return lanes;
end;
$$;

create function public.app_event_ack(p_subscriber text, p_workspace_id uuid, p_lease_token uuid, p_through bigint) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.app_event_cursors set delivered_through = greatest(delivered_through, p_through), attempts = 0,
      last_error = null, updated_at = clock_timestamp()
    where subscriber = p_subscriber and workspace_id = p_workspace_id and lease_token = p_lease_token
      and lease_until > clock_timestamp();
  return found;
end;
$$;

create function public.app_event_fail(p_subscriber text, p_workspace_id uuid, p_lease_token uuid, p_event_id uuid, p_error text,
  p_permanent boolean, p_max_attempts int, p_backoff_seconds int) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c public.app_event_cursors; ev public.app_events;
begin
  select * into c from public.app_event_cursors where subscriber = p_subscriber and workspace_id = p_workspace_id
    and lease_token = p_lease_token and lease_until > clock_timestamp() for update;
  if not found then return 'lost'; end if;
  select * into ev from public.app_events e where e.id = p_event_id and e.workspace_id = p_workspace_id;
  if not found then
    update public.app_event_cursors set lease_token = null, lease_until = null, updated_at = clock_timestamp()
      where subscriber = p_subscriber and workspace_id = p_workspace_id;
    return 'lost';
  end if;
  if coalesce(p_permanent, false) or c.attempts + 1 >= greatest(1, least(coalesce(p_max_attempts, 8), 12)) then
    insert into public.app_event_dead_letters(subscriber, workspace_id, event_id, sequence, type, subject_kind, subject_id, area,
        payload, occurred_at, attempts, last_error)
      values (p_subscriber, p_workspace_id, ev.id, ev.sequence, ev.type, ev.subject_kind, ev.subject_id, ev.area,
        ev.payload, ev.occurred_at, c.attempts + 1, left(p_error, 500))
      on conflict (subscriber, event_id) do nothing;
    -- The lease stays: the Event is set aside, so the lane carries on with the next one in this run.
    update public.app_event_cursors set delivered_through = greatest(delivered_through, ev.sequence), attempts = 0,
        last_error = left(p_error, 500), updated_at = clock_timestamp()
      where subscriber = p_subscriber and workspace_id = p_workspace_id;
    return 'dead';
  end if;
  update public.app_event_cursors set attempts = attempts + 1, last_error = left(p_error, 500),
      next_attempt_at = clock_timestamp() + make_interval(secs => greatest(30, least(coalesce(p_backoff_seconds, 60), 86400))),
      lease_token = null, lease_until = null, updated_at = clock_timestamp()
    where subscriber = p_subscriber and workspace_id = p_workspace_id;
  return 'retry';
end;
$$;

create function public.app_event_release(p_subscriber text, p_workspace_id uuid, p_lease_token uuid) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.app_event_cursors set lease_token = null, lease_until = null, updated_at = clock_timestamp()
    where subscriber = p_subscriber and workspace_id = p_workspace_id and lease_token = p_lease_token;
end;
$$;

-- The subscription is not active for this business: jump to the end, so turning it
-- back on later never replays stale events.
create function public.app_event_skip(p_subscriber text, p_workspace_id uuid, p_lease_token uuid) returns bigint
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare last_seq bigint;
begin
  select s.last_sequence into last_seq from public.app_event_streams s where s.workspace_id = p_workspace_id;
  update public.app_event_cursors set delivered_through = greatest(delivered_through, coalesce(last_seq, 0)), attempts = 0,
      last_error = null, lease_token = null, lease_until = null, updated_at = clock_timestamp()
    where subscriber = p_subscriber and workspace_id = p_workspace_id and lease_token = p_lease_token;
  return coalesce(last_seq, 0);
end;
$$;

create function public.app_event_disable_endpoint(p_endpoint_id uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ep public.app_event_webhook_endpoints;
begin
  if p_reason is null or p_reason not in ('gone','authority_removed') then raise exception 'app_events_invalid'; end if;
  update public.app_event_webhook_endpoints set status = 'disabled', disabled_reason = p_reason, updated_at = clock_timestamp()
    where id = p_endpoint_id and status <> 'disabled' returning * into ep;
  if not found then return; end if;
  insert into public.app_event_webhook_endpoint_changes(endpoint_id, workspace_id, action, actor_id, actor_kind, agency_workspace_id)
    values (ep.id, ep.workspace_id, 'auto_disabled', null, 'system', ep.agency_workspace_id);
end;
$$;

create function public.app_event_claim_replays(p_limit int, p_lease_seconds int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare d public.app_event_dead_letters; endpoint public.app_event_webhook_endpoints; ev public.app_events; token uuid;
  allowed boolean; result jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit not between 1 and 200 or p_lease_seconds is null or p_lease_seconds not between 10 and 600 then
    raise exception 'app_events_invalid';
  end if;
  for d in
    select x.* from public.app_event_dead_letters x
      where x.replay_requested_at is not null and x.replayed_at is null
        and (x.replay_lease_until is null or x.replay_lease_until < clock_timestamp())
      order by x.replay_requested_at, x.id limit p_limit for update skip locked
  loop
    token := gen_random_uuid();
    ev := null;
    ev.id := d.event_id; ev.workspace_id := d.workspace_id; ev.sequence := d.sequence; ev.type := d.type;
    ev.schema_version := 1; ev.subject_kind := d.subject_kind; ev.subject_id := d.subject_id; ev.area := d.area;
    ev.payload := d.payload; ev.occurred_at := d.occurred_at; ev.recorded_at := d.dead_at;
    allowed := true;
    if d.subscriber like 'webhook:%' then
      select * into endpoint from public.app_event_webhook_endpoints w where 'webhook:' || w.id::text = d.subscriber;
      allowed := found and public.app_event_webhook_allows(endpoint, ev);
    end if;
    update public.app_event_dead_letters set replay_lease_token = token,
        replay_lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds)
      where id = d.id;
    result := result || jsonb_build_array(jsonb_build_object('id', d.id, 'subscriber', d.subscriber,
      'workspaceId', d.workspace_id, 'leaseToken', token, 'event', public.app_event_json(ev), 'allowed', allowed));
  end loop;
  return result;
end;
$$;

create function public.app_event_finish_replay(p_dead_letter_id uuid, p_lease_token uuid, p_ok boolean, p_error text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if coalesce(p_ok, false) then
    update public.app_event_dead_letters set replayed_at = clock_timestamp(), replay_outcome = 'delivered',
        replay_lease_token = null, replay_lease_until = null
      where id = p_dead_letter_id and replay_lease_token = p_lease_token;
  else
    update public.app_event_dead_letters set replay_outcome = 'failed', last_error = left(p_error, 500),
        replay_requested_at = null, replayed_at = null, replay_lease_token = null, replay_lease_until = null
      where id = p_dead_letter_id and replay_lease_token = p_lease_token;
  end if;
end;
$$;

create function public.purge_app_events(p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare events_n int; dead_n int; failures_n int; lim int := greatest(1, least(coalesce(p_limit, 500), 5000));
begin
  delete from public.app_events where id in (
    select e.id from public.app_events e where e.recorded_at < clock_timestamp() - interval '30 days' limit lim);
  get diagnostics events_n = row_count;
  delete from public.app_event_dead_letters where id in (
    select d.id from public.app_event_dead_letters d where d.dead_at < clock_timestamp() - interval '90 days' limit lim);
  get diagnostics dead_n = row_count;
  delete from public.app_event_emit_failures where id in (
    select f.id from public.app_event_emit_failures f where f.at < clock_timestamp() - interval '30 days' limit lim);
  get diagnostics failures_n = row_count;
  return jsonb_build_object('events', events_n, 'deadLetters', dead_n, 'failures', failures_n);
end;
$$;

create function public.app_event_health() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with live as (
    select c.*, s.last_sequence from public.app_event_cursors c
      join public.app_event_streams s on s.workspace_id = c.workspace_id
      where c.subscriber like 'app:%' or exists (select 1 from public.app_event_webhook_endpoints w
        where 'webhook:' || w.id::text = c.subscriber and w.status = 'active'))
  select jsonb_build_object('captureOn', public.app_event_capture_on(),
    'lanesBehind', (select count(*) from live where last_sequence > delivered_through),
    'lanesRetrying', (select count(*) from live where attempts > 0),
    'deadLast24h', (select count(*) from public.app_event_dead_letters where dead_at > clock_timestamp() - interval '24 hours'),
    'emitFailuresLast24h', (select count(*) from public.app_event_emit_failures where at > clock_timestamp() - interval '24 hours'),
    'oldestUndeliveredAt', (select min(e.recorded_at) from live l
      join public.app_events e on e.workspace_id = l.workspace_id and e.sequence = l.delivered_through + 1
      where l.last_sequence > l.delivered_through))
$$;

-- People side (service role; identity comes from the route, scope is enforced here).

create function public.read_app_event_capture() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('capture', s.capture, 'changedAt', s.changed_at, 'reason', s.reason)
  from public.app_event_settings s where s.id
$$;

create function public.set_app_event_capture(p_operator_email text, p_capture boolean, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare who uuid;
begin
  who := public.workspace_release_assert_operator(p_operator_email);
  if p_capture is null or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'app_events_invalid'; end if;
  update public.app_event_settings set capture = p_capture, changed_by = who, changed_at = clock_timestamp(), reason = btrim(p_reason)
    where id;
  insert into public.app_event_capture_changes(capture, changed_by, reason) values (p_capture, who, btrim(p_reason));
  return public.read_app_event_capture();
end;
$$;

create function public.read_app_event_deliveries(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare sc jsonb;
begin
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, false);
  return public.app_event_deliveries_view(p_workspace_id, sc->>'kind', (sc->>'canChange')::boolean, p_agency_id);
end;
$$;

-- Volatile: workspace_release_assert_operator takes a key-share row lock.
create function public.read_operator_app_event_deliveries(p_operator_email text, p_workspace_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  perform 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer';
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
  return public.app_event_deliveries_view(p_workspace_id, 'operator', true, null);
end;
$$;

create function public.retry_app_event_dead_letter(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_id uuid,
  p_dead_letter_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare sc jsonb; d public.app_event_dead_letters;
begin
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  perform public.app_event_lock_scope(p_workspace_id, p_user_id, p_agency_id);
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  select * into d from public.app_event_dead_letters x where x.id = p_dead_letter_id and x.workspace_id = p_workspace_id for update;
  if not found or not public.app_event_subscriber_visible(d.subscriber, p_agency_id) then raise exception 'workspace_access_denied'; end if;
  if d.replay_outcome = 'delivered' then raise exception 'app_event_already_delivered'; end if;
  update public.app_event_dead_letters set replay_requested_at = clock_timestamp(), replay_requested_by = p_user_id
    where id = d.id;
  return public.app_event_deliveries_view(p_workspace_id, sc->>'kind', (sc->>'canChange')::boolean, p_agency_id);
end;
$$;

create function public.operator_retry_app_event_dead_letter(p_operator_email text, p_dead_letter_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare who uuid; d public.app_event_dead_letters;
begin
  who := public.workspace_release_assert_operator(p_operator_email);
  select * into d from public.app_event_dead_letters x where x.id = p_dead_letter_id for update;
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
  if d.replay_outcome = 'delivered' then raise exception 'app_event_already_delivered'; end if;
  update public.app_event_dead_letters set replay_requested_at = clock_timestamp(), replay_requested_by = who where id = d.id;
  return public.app_event_deliveries_view(d.workspace_id, 'operator', true, null);
end;
$$;

create function public.create_app_event_webhook_endpoint(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_id uuid,
  p_url text, p_event_types text[], p_secret_ciphertext text, p_secret_hint text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare sc jsonb; types text[]; t text; area text; n integer; ep public.app_event_webhook_endpoints;
begin
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  perform public.app_event_lock_scope(p_workspace_id, p_user_id, p_agency_id);
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  if p_event_types is null then raise exception 'app_event_endpoint_invalid'; end if;
  select coalesce(array_agg(distinct x order by x), array[]::text[]) into types from unnest(p_event_types) x;
  if cardinality(types) not between 1 and 10 or not (types <@ public.app_event_types()) then
    raise exception 'app_event_endpoint_invalid';
  end if;
  if p_agency_id is not null then
    foreach t in array types loop
      area := public.app_event_static_area(t);
      if area is not null and not public.connection_agency_holds_area(p_agency_id, p_workspace_id, area) then
        raise exception 'app_event_area_not_granted';
      end if;
    end loop;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 202610281000));
  select count(*) into n from public.app_event_webhook_endpoints e
    where e.workspace_id = p_workspace_id and coalesce(e.agency_workspace_id, e.workspace_id) = coalesce(p_agency_id, p_workspace_id)
      and e.status <> 'disabled';
  if n >= 5 then raise exception 'app_event_endpoint_limit'; end if;
  insert into public.app_event_webhook_endpoints(workspace_id, created_by_kind, agency_workspace_id, url, event_types,
      secret_ciphertext, secret_hint, created_by)
    values (p_workspace_id, case when p_agency_id is null then 'business' else 'agency' end, p_agency_id, p_url, types,
      p_secret_ciphertext, p_secret_hint, p_user_id)
    returning * into ep;
  insert into public.app_event_cursors(subscriber, workspace_id, delivered_through)
    values ('webhook:' || ep.id::text, p_workspace_id,
      coalesce((select s.last_sequence from public.app_event_streams s where s.workspace_id = p_workspace_id), 0));
  insert into public.app_event_webhook_endpoint_changes(endpoint_id, workspace_id, action, actor_id, actor_kind, agency_workspace_id)
    values (ep.id, p_workspace_id, 'created', p_user_id, sc->>'kind', p_agency_id);
  return public.app_event_endpoint_json(ep);
end;
$$;

create function public.set_app_event_webhook_endpoint(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_id uuid,
  p_endpoint_id uuid, p_status text, p_secret_ciphertext text, p_secret_hint text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare sc jsonb; ep public.app_event_webhook_endpoints; act text;
begin
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  perform public.app_event_lock_scope(p_workspace_id, p_user_id, p_agency_id);
  sc := public.app_event_actor_scope(p_workspace_id, p_user_id, p_verified_email, p_agency_id, true);
  if p_status is not null and p_status not in ('active','paused','disabled') then raise exception 'app_event_endpoint_invalid'; end if;
  if p_status is null and (p_secret_ciphertext is null or p_secret_hint is null) then raise exception 'app_event_endpoint_invalid'; end if;
  select * into ep from public.app_event_webhook_endpoints e where e.id = p_endpoint_id and e.workspace_id = p_workspace_id for update;
  if not found or (p_agency_id is not null and ep.agency_workspace_id is distinct from p_agency_id) then
    raise exception 'workspace_access_denied';
  end if;
  if ep.status = 'disabled' then
    if p_status = 'disabled' then return public.app_event_endpoint_json(ep); end if;
    raise exception 'app_event_endpoint_disabled';
  end if;
  if p_status is null then
    update public.app_event_webhook_endpoints set secret_ciphertext = p_secret_ciphertext, secret_hint = p_secret_hint,
        updated_at = clock_timestamp() where id = ep.id returning * into ep;
    act := 'secret_rotated';
  elsif p_status = ep.status then
    return public.app_event_endpoint_json(ep);
  elsif p_status = 'disabled' then
    update public.app_event_webhook_endpoints set status = 'disabled', disabled_reason = 'by_person', updated_at = clock_timestamp()
      where id = ep.id returning * into ep;
    act := 'disabled';
  elsif p_status = 'paused' then
    update public.app_event_webhook_endpoints set status = 'paused', updated_at = clock_timestamp() where id = ep.id returning * into ep;
    act := 'paused';
  else
    update public.app_event_webhook_endpoints set status = 'active', updated_at = clock_timestamp() where id = ep.id returning * into ep;
    -- Resuming never replays what happened while it was paused.
    update public.app_event_cursors set delivered_through = greatest(delivered_through,
        coalesce((select s.last_sequence from public.app_event_streams s where s.workspace_id = ep.workspace_id), 0)),
        attempts = 0, last_error = null, next_attempt_at = clock_timestamp(), updated_at = clock_timestamp()
      where subscriber = 'webhook:' || ep.id::text and workspace_id = ep.workspace_id and lease_until is null;
    act := 'resumed';
  end if;
  insert into public.app_event_webhook_endpoint_changes(endpoint_id, workspace_id, action, actor_id, actor_kind, agency_workspace_id)
    values (ep.id, ep.workspace_id, act, p_user_id, sc->>'kind', p_agency_id);
  return public.app_event_endpoint_json(ep);
end;
$$;

-- Coding agents: a token for the business (every type) or for an agency (only areas it holds).
create function public.agent_read_app_events(p_token_hash text, p_resource text, p_workspace_id uuid, p_after bigint,
  p_types text[], p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.assistant_tokens; bound bigint; lim int := greatest(1, least(coalesce(p_limit, 50), 100));
  after_seq bigint := greatest(coalesce(p_after, 0), 0); rows_json jsonb; n int; last_seq bigint;
begin
  t := public.lock_agent_oauth_token(p_token_hash, p_resource, 'business:read', p_workspace_id);
  select coalesce((select s.last_sequence from public.app_event_streams s where s.workspace_id = t.workspace_id), 0) into bound;
  select coalesce(jsonb_agg(public.app_event_json(r) order by r.sequence), '[]'::jsonb), count(*), max(r.sequence)
    into rows_json, n, last_seq
    from (select e.* from public.app_events e
      where e.workspace_id = t.workspace_id and e.sequence > after_seq and e.sequence <= bound
        and (p_types is null or e.type = any(p_types))
        and (t.agency_id is null or e.area is null or public.connection_agency_holds_area(t.agency_id, t.workspace_id, e.area))
      order by e.sequence limit lim) r;
  return jsonb_build_object('events', rows_json,
    'nextAfter', case when n >= lim then last_seq else greatest(bound, after_seq) end,
    'lastSequence', bound, 'captureOn', public.app_event_capture_on());
end;
$$;

-- Grants.
revoke all on function
  public.app_event_types(), public.app_event_history_immutable(), public.app_event_capture_on(), public.app_event_static_area(text),
  public.app_event_json(public.app_events),
  public.app_event_emit(uuid,text,text,text,text,jsonb,timestamptz,text),
  public.app_event_emit_safe(uuid,text,text,text,text,jsonb,timestamptz,text),
  public.app_event_actor_scope(uuid,uuid,text,uuid,boolean), public.app_event_lock_scope(uuid,uuid,uuid),
  public.app_event_webhook_allows(public.app_event_webhook_endpoints,public.app_events),
  public.app_event_subscriber_visible(text,uuid), public.app_event_agency_name(uuid),
  public.app_event_endpoint_json(public.app_event_webhook_endpoints),
  public.app_event_deliveries_view(uuid,text,boolean,uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  public.app_event_recent_workspaces(int), public.app_event_ensure_cursors(jsonb), public.app_event_active_webhook_endpoints(int),
  public.app_event_claim_lanes(text[],int,int,int), public.app_event_ack(text,uuid,uuid,bigint),
  public.app_event_fail(text,uuid,uuid,uuid,text,boolean,int,int), public.app_event_release(text,uuid,uuid),
  public.app_event_skip(text,uuid,uuid), public.app_event_disable_endpoint(uuid,text),
  public.app_event_claim_replays(int,int), public.app_event_finish_replay(uuid,uuid,boolean,text),
  public.purge_app_events(int), public.app_event_health(), public.read_app_event_capture(),
  public.set_app_event_capture(text,boolean,text), public.read_app_event_deliveries(uuid,text,uuid,uuid),
  public.read_operator_app_event_deliveries(text,uuid), public.retry_app_event_dead_letter(uuid,text,uuid,uuid,uuid),
  public.operator_retry_app_event_dead_letter(text,uuid),
  public.create_app_event_webhook_endpoint(uuid,text,uuid,uuid,text,text[],text,text),
  public.set_app_event_webhook_endpoint(uuid,text,uuid,uuid,uuid,text,text,text),
  public.agent_read_app_events(text,text,uuid,bigint,text[],int)
  from public, anon, authenticated;
grant execute on function
  public.app_event_recent_workspaces(int), public.app_event_ensure_cursors(jsonb), public.app_event_active_webhook_endpoints(int),
  public.app_event_claim_lanes(text[],int,int,int), public.app_event_ack(text,uuid,uuid,bigint),
  public.app_event_fail(text,uuid,uuid,uuid,text,boolean,int,int), public.app_event_release(text,uuid,uuid),
  public.app_event_skip(text,uuid,uuid), public.app_event_disable_endpoint(uuid,text),
  public.app_event_claim_replays(int,int), public.app_event_finish_replay(uuid,uuid,boolean,text),
  public.purge_app_events(int), public.app_event_health(), public.read_app_event_capture(),
  public.set_app_event_capture(text,boolean,text), public.read_app_event_deliveries(uuid,text,uuid,uuid),
  public.read_operator_app_event_deliveries(text,uuid), public.retry_app_event_dead_letter(uuid,text,uuid,uuid,uuid),
  public.operator_retry_app_event_dead_letter(text,uuid),
  public.create_app_event_webhook_endpoint(uuid,text,uuid,uuid,text,text[],text,text),
  public.set_app_event_webhook_endpoint(uuid,text,uuid,uuid,uuid,text,text,text),
  public.agent_read_app_events(text,text,uuid,bigint,text[],int)
  to service_role;

commit;
