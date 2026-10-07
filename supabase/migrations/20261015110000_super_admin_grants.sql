-- Super-admin authority changes are named, reasoned and auditable. The bootstrap
-- email list no longer grants authority when an auth account is created again.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.super_admin_access_events (
  id bigint generated always as identity primary key,
  action text not null check (action in ('granted', 'revoked')),
  actor_user_id uuid not null,
  actor_email text not null,
  target_user_id uuid not null,
  target_email text not null,
  reason text not null check (
    char_length(btrim(reason)) between 3 and 500 and reason ~ '[^[:space:]]'
  ),
  occurred_at timestamptz not null default clock_timestamp()
);
create index super_admin_access_events_actor_time_idx
  on public.super_admin_access_events (actor_user_id, occurred_at desc);
comment on table public.super_admin_access_events is
  'Append-only record of every super-admin grant and revocation, including its operator and reason.';

alter table public.super_admin_access_events enable row level security;
revoke all on table public.super_admin_access_events from public, anon, authenticated, service_role;
grant select on table public.super_admin_access_events to authenticated, service_role;
revoke all on sequence public.super_admin_access_events_id_seq from public, anon, authenticated, service_role;
create policy super_admin_access_events_active_operator_read
  on public.super_admin_access_events for select to authenticated
  using (public.app_is_super_admin());

create function public.super_admin_access_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'super_admin_access_events_append_only';
end;
$$;
revoke all on function public.super_admin_access_event_immutable() from public, anon, authenticated, service_role;
create trigger super_admin_access_events_immutable
  before update or delete on public.super_admin_access_events
  for each row execute function public.super_admin_access_event_immutable();

-- A service-role caller must name an existing, verified operator as the human
-- actor. An authenticated caller is always attributed to their own session.
create function public.super_admin_manager_actor(p_actor_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  actor_id uuid;
begin
  if caller_role = 'authenticated' then
    actor_id := auth.uid();
    if actor_id is null or (p_actor_user_id is not null and p_actor_user_id <> actor_id) then
      raise exception 'super_admin_actor_forbidden' using errcode = '42501';
    end if;
  elsif caller_role = 'service_role' then
    actor_id := p_actor_user_id;
  else
    raise exception 'super_admin_actor_forbidden' using errcode = '42501';
  end if;

  if actor_id is null then
    raise exception 'super_admin_actor_required' using errcode = '42501';
  end if;

  perform 1
  from public.users as operator_user
  join public.super_admins as operator_grant on operator_grant.user_id = operator_user.id
  where operator_user.id = actor_id
    and operator_user.verified_at is not null
    and operator_grant.revoked_at is null
  for share of operator_user, operator_grant;
  if not found then
    raise exception 'super_admin_actor_required' using errcode = '42501';
  end if;
  return actor_id;
end;
$$;
revoke all on function public.super_admin_manager_actor(uuid) from public, anon, authenticated, service_role;

create function public.grant_super_admin(
  p_user_id uuid,
  p_reason text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_email text;
  target_email text;
  now_at timestamptz := clock_timestamp();
  existing_revoked_at timestamptz;
begin
  actor_id := public.super_admin_manager_actor(p_actor_user_id);
  if p_user_id is null then
    raise exception 'super_admin_target_required';
  end if;
  if actor_id = p_user_id then
    raise exception 'super_admin_self_grant';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500
    or p_reason !~ '[^[:space:]]' then
    raise exception 'super_admin_reason_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('super-admin:' || p_user_id::text, 0)
  );
  select target.email into target_email
  from public.users as target
  where target.id = p_user_id and target.verified_at is not null
  for key share;
  if not found then
    raise exception 'super_admin_verified_user_required';
  end if;
  select grant_row.revoked_at into existing_revoked_at
  from public.super_admins as grant_row
  where grant_row.user_id = p_user_id
  for update;
  if found and existing_revoked_at is null then
    raise exception 'super_admin_already_active';
  end if;

  select operator.email into actor_email
  from public.users as operator where operator.id = actor_id;
  insert into public.super_admins (user_id, email, granted_at, granted_by, revoked_at)
  values (p_user_id, target_email, now_at, actor_id, null)
  on conflict (user_id) do update
    set email = excluded.email,
        granted_at = excluded.granted_at,
        granted_by = excluded.granted_by,
        revoked_at = null;
  insert into public.super_admin_access_events (
    action, actor_user_id, actor_email, target_user_id, target_email, reason, occurred_at
  ) values ('granted', actor_id, actor_email, p_user_id, target_email, btrim(p_reason), now_at);
  return p_user_id;
end;
$$;
revoke all on function public.grant_super_admin(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.grant_super_admin(uuid, text, uuid) to authenticated, service_role;

create function public.revoke_super_admin(
  p_user_id uuid,
  p_reason text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_email text;
  target_email text;
  now_at timestamptz := clock_timestamp();
begin
  actor_id := public.super_admin_manager_actor(p_actor_user_id);
  if p_user_id is null then
    raise exception 'super_admin_target_required';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500
    or p_reason !~ '[^[:space:]]' then
    raise exception 'super_admin_reason_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('super-admin:' || p_user_id::text, 0)
  );
  select target.email into target_email
  from public.users as target
  where target.id = p_user_id
  for key share;
  if not found then
    raise exception 'super_admin_target_not_found';
  end if;

  update public.super_admins as grant_row
  set revoked_at = now_at
  where grant_row.user_id = p_user_id and grant_row.revoked_at is null;
  if not found then
    raise exception 'super_admin_not_active';
  end if;

  select operator.email into actor_email
  from public.users as operator where operator.id = actor_id;
  insert into public.super_admin_access_events (
    action, actor_user_id, actor_email, target_user_id, target_email, reason, occurred_at
  ) values ('revoked', actor_id, actor_email, p_user_id, target_email, btrim(p_reason), now_at);
  return p_user_id;
end;
$$;
revoke all on function public.revoke_super_admin(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_super_admin(uuid, text, uuid) to authenticated, service_role;

-- The access-review timestamp is the latest action recorded against this
-- operator in audit_logs or in the grant/revoke trail. Sign-in time is not
-- available from these application-owned records and is not inferred here.
create view public.super_admin_access_review with (security_invoker = true) as
select
  operator_grant.user_id,
  operator_user.email,
  operator_grant.granted_at,
  operator_grant.granted_by,
  grantor.email as granted_by_email,
  (
    select max(activity.activity_at)
    from (
      select action_log.time as activity_at
      from public.audit_logs as action_log
      where action_log.actor_user_id = operator_grant.user_id
      union all
      select access_event.occurred_at as activity_at
      from public.super_admin_access_events as access_event
      where access_event.actor_user_id = operator_grant.user_id
    ) as activity
  ) as last_activity_at
from public.super_admins as operator_grant
join public.users as operator_user on operator_user.id = operator_grant.user_id
left join public.users as grantor on grantor.id = operator_grant.granted_by
where operator_grant.revoked_at is null
  and operator_user.verified_at is not null;
comment on view public.super_admin_access_review is
  'Read-only roster of verified, active super-admins with the latest activity captured in audit_logs or the access grant/revoke trail.';
revoke all on public.super_admin_access_review from public, anon, authenticated, service_role;
grant select on public.super_admin_access_review to authenticated, service_role;

-- Do not recreate operator authority from an email allowlist after account
-- deletion/recreation. Future changes go through the audited functions above.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, verified_at)
  values (new.id, new.email, new.email_confirmed_at)
  on conflict (id) do update
    set email = excluded.email,
        verified_at = coalesce(public.users.verified_at, excluded.verified_at);

  if new.email_confirmed_at is not null then
    insert into public.memberships (user_id, tenant_id, role)
    select new.id, invite.tenant_id, invite.role
    from public.invites as invite
    where invite.email = new.email
      and invite.claimed_at is null
      and invite.expires_at > now()
    on conflict (user_id, tenant_id) do nothing;

    update public.invites
    set claimed_at = now()
    where email = new.email
      and claimed_at is null
      and expires_at > now();
  end if;

  return new;
end;
$$;

-- Direct writes, including service-role PostgREST writes, must use the audited
-- security-definer functions. RLS still limits authenticated reads.
revoke all on table public.super_admins from public, anon, authenticated, service_role;
grant select on table public.super_admins to authenticated, service_role;

commit;
