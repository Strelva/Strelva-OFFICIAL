-- Batch 7A (1 of 4): the provider seat replaces personal admin membership
-- (agency 1.0 #245, audit A AG-01/AG-02, company ADR 0012). Additive. Local
-- only until Jacob's yes.
--
-- Why. An agency reached a client business only through one person's direct
-- `admin` membership (conversion made the Strelva operator admin), or through
-- narrow per-work delegations and assignments. That is not neutral: no other
-- agency had a path, and access followed a person, not the agency the owner
-- chose. A provider seat is the agency's standing access to one business.
--
-- What this adds:
--   1. provider_seats: one active seat per (business, agency). Granted by the
--      owner, or by conversion (AG-03 writes those). The owner ends it; an
--      agency owner/admin may step back from it; ending the business's
--      provider of record ends that agency's seat. History is kept: rows only
--      go from active to ended.
--   2. agency_client_staff: which agency members work on which client. Set by
--      an agency owner/admin, only while the seat is active. Ending the seat
--      ends its staff rows. Leaving the agency ends the person's staff rows,
--      so being added back does not quietly restore client access.
--   3. One resolution, the same for every agency: active seat AND the user's
--      agency membership AND an active staff row resolves to the role
--      provider_seat_direct_role() returns. business_record_assert_actor,
--      system_actor_scope, read_version_actor (and the Versions member
--      helpers), workspace_require and list_provided_clients all use it.
--   4. The owner chooses a provider: choose_business_provider writes the
--      attribution row (workspace_providers, new source `business_choice`)
--      and the seat in one transaction; end_business_provider ends both.
--
-- workspace_providers stays the attribution record (agency of record). It
-- still grants nothing by itself; the seat is the access. Nothing here checks
-- super_admins, and nothing here sends email.
--
-- Open decision #241 (can a provider seat see contacts and inquiries):
-- provider_seat_direct_role() answers `admin`, operator-level direct access,
-- as audit A recommends. Narrowing it is one function.
--
-- Depends on 20261002120000, 20261004120000, 20261005120000,
-- 20261007110000 and 20261007150000.

set local lock_timeout = '3s';

alter table public.workspace_providers drop constraint workspace_providers_source_check;
alter table public.workspace_providers add constraint workspace_providers_source_check
  check (source in ('tenant_conversion', 'operator', 'business_choice'));

create table public.provider_seats (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  granted_by_kind text not null check (granted_by_kind in ('owner', 'conversion')),
  granted_by uuid not null references public.users(id) on delete restrict,
  granted_at timestamptz not null default clock_timestamp(),
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) between 1 and 500),
  check (customer_workspace_id <> agency_workspace_id),
  check ((status = 'ended') = (ended_at is not null and ended_by is not null))
);
create unique index provider_seats_one_active_idx
  on public.provider_seats(customer_workspace_id, agency_workspace_id) where status = 'active';
create index provider_seats_agency_idx on public.provider_seats(agency_workspace_id, status, granted_at);

create table public.agency_client_staff (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  assigned_by uuid not null references public.users(id) on delete restrict,
  assigned_at timestamptz not null default clock_timestamp(),
  -- Null on an ended row: the person left the agency (no one in this record ended it).
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  check (customer_workspace_id <> agency_workspace_id),
  check ((status = 'ended') = (ended_at is not null)),
  check (status = 'ended' or ended_by is null)
);
create unique index agency_client_staff_one_active_idx
  on public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id) where status = 'active';
create index agency_client_staff_user_idx on public.agency_client_staff(user_id, customer_workspace_id) where status = 'active';

alter table public.provider_seats enable row level security;
alter table public.agency_client_staff enable row level security;
revoke all on public.provider_seats, public.agency_client_staff from public, anon, authenticated, service_role;

-- Seats and staff rows name a customer business and an agency. They may only
-- end (active -> ended, with who and when), and are deleted only with a
-- workspace (or, for staff, the user).
create function public.provider_seat_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active'
      or not exists (select 1 from public.workspaces where id = new.customer_workspace_id and kind = 'customer')
      or not exists (select 1 from public.workspaces where id = new.agency_workspace_id and kind = 'agency') then
      raise exception 'provider_seat_invalid';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'ended'
      and (to_jsonb(new) - array['status','ended_by','ended_at','end_reason']::text[])
        = (to_jsonb(old) - array['status','ended_by','ended_at','end_reason']::text[]) then
      return new;
    end if;
    raise exception 'provider_seat_immutable';
  end if;
  if not exists (select 1 from public.workspaces where id = old.customer_workspace_id)
    or not exists (select 1 from public.workspaces where id = old.agency_workspace_id) then
    return old;
  end if;
  raise exception 'provider_seat_immutable';
end;
$$;
create trigger provider_seats_guard before insert or update or delete on public.provider_seats
  for each row execute function public.provider_seat_guard();

create function public.agency_client_staff_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active'
      or not exists (select 1 from public.provider_seats s where s.customer_workspace_id = new.customer_workspace_id
        and s.agency_workspace_id = new.agency_workspace_id and s.status = 'active')
      or not exists (select 1 from public.workspace_memberships m where m.workspace_id = new.agency_workspace_id
        and m.user_id = new.user_id) then
      raise exception 'agency_client_staff_invalid';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'ended'
      and (to_jsonb(new) - array['status','ended_by','ended_at']::text[])
        = (to_jsonb(old) - array['status','ended_by','ended_at']::text[]) then
      return new;
    end if;
    raise exception 'agency_client_staff_immutable';
  end if;
  if not exists (select 1 from public.workspaces where id = old.customer_workspace_id)
    or not exists (select 1 from public.workspaces where id = old.agency_workspace_id)
    or not exists (select 1 from public.users where id = old.user_id) then
    return old;
  end if;
  raise exception 'agency_client_staff_immutable';
end;
$$;
create trigger agency_client_staff_guard before insert or update or delete on public.agency_client_staff
  for each row execute function public.agency_client_staff_guard();

-- Ending a seat ends its staff rows. Ending the provider of record ends that
-- agency's seat on the business. Same actor and time, same transaction.
create function public.provider_seat_end_staff() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.agency_client_staff set status = 'ended', ended_by = new.ended_by, ended_at = new.ended_at
    where customer_workspace_id = new.customer_workspace_id and agency_workspace_id = new.agency_workspace_id
      and status = 'active';
  return new;
end;
$$;
create trigger provider_seats_end_staff after update of status on public.provider_seats
  for each row when (old.status = 'active' and new.status = 'ended')
  execute function public.provider_seat_end_staff();

create function public.workspace_provider_end_seat() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.provider_seats set status = 'ended', ended_by = new.ended_by, ended_at = new.ended_at,
      end_reason = coalesce(new.end_reason, 'The provider of record ended.')
    where customer_workspace_id = new.customer_workspace_id and agency_workspace_id = new.provider_workspace_id
      and status = 'active';
  return new;
end;
$$;
create trigger workspace_providers_end_seat after update of status on public.workspace_providers
  for each row when (old.status = 'active' and new.status = 'ended')
  execute function public.workspace_provider_end_seat();

-- Leaving an agency ends the person's staff rows on its clients. Resolution
-- already requires current agency membership; this makes re-adding the
-- person a fresh start, staffed again by an owner/admin.
create function public.agency_membership_end_staff() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.agency_client_staff set status = 'ended', ended_at = clock_timestamp()
    where agency_workspace_id = old.workspace_id and user_id = old.user_id and status = 'active';
  return old;
end;
$$;
create trigger workspace_memberships_end_agency_staff after delete on public.workspace_memberships
  for each row execute function public.agency_membership_end_staff();

-- Open decision #241. The role an active provider seat resolves to, for
-- every agency alike. `admin` is operator-level direct access: the whole
-- business record, contacts and inquiries included, and the owner/admin write
-- rule. Answering `agency` instead would send seat holders down the partner
-- path (only delegated or assigned work, no contacts). Change it here only.
create function public.provider_seat_direct_role() returns text
language sql immutable set search_path = public, pg_temp as $$
  select 'admin'::text
$$;

-- The role this user holds in this customer business through a provider
-- seat, or null: an active seat of an agency the user is a direct member of,
-- and an active staff row for the user on that business. p_lock takes the
-- seat, staff and agency membership rows FOR SHARE for the caller's
-- transaction, so a concurrent end or removal waits for the write.
create function public.provider_seat_role(p_workspace_id uuid, p_user_id uuid, p_lock boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_workspace_id is null or p_user_id is null then return null; end if;
  if p_lock then
    perform 1 from public.provider_seats s
      join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
      join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      where s.customer_workspace_id = p_workspace_id and s.status = 'active'
      for share of s, am, st;
  else
    perform 1 from public.provider_seats s
      join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
      join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      where s.customer_workspace_id = p_workspace_id and s.status = 'active';
  end if;
  if not found then return null; end if;
  return public.provider_seat_direct_role();
end;
$$;

-- Same contract as 20261002120000, with the provider seat between direct
-- membership and a per-work assignment. Returns owner | admin | member | agency.
create or replace function public.business_record_assert_actor(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'business_record_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'business_record_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
    perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
    if not found then raise exception 'business_record_access_denied'; end if;
  end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null then
    actor_role := public.provider_seat_role(p_workspace_id, p_user_id, true);
  end if;
  if actor_role is null and exists (
    select 1
      from public.operational_assignments a
      join public.offering_provider_deliveries d
        on d.assignment_id = a.id and d.business_workspace_id = a.workspace_id
      join public.workspaces agency on agency.id = a.assignee_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = agency.id and am.user_id = p_user_id
      join public.workspaces customer on customer.id = a.workspace_id and customer.kind = 'customer'
      where a.workspace_id = p_workspace_id
        and a.assignee_kind = 'agency'
        and a.assignee_user_id = p_user_id
        and a.status = 'accepted' and a.expires_at > clock_timestamp()
        and d.status = 'accepted' and d.expires_at > clock_timestamp()
  ) then
    actor_role := 'agency';
  end if;
  if actor_role is null or (p_write and actor_role not in ('owner','admin','agency')) then
    raise exception 'business_record_access_denied';
  end if;
  if p_write and public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return actor_role;
end;
$$;

-- Same contract as 20261004120000: a provider seat is direct access, so its
-- holder reads through business_record_assert_actor like a direct member.
create or replace function public.system_actor_scope(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean,
  out access text, out work_ids uuid[]
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_write then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  elsif exists (select 1 from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id)
    or public.provider_seat_role(p_workspace_id, p_user_id, false) is not null then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  else
    access := 'agency';
  end if;
  if access <> 'agency' then
    work_ids := null;
    return;
  end if;
  work_ids := public.business_record_agency_work_ids(p_workspace_id, p_user_id, p_verified_email, p_write);
  if cardinality(work_ids) = 0 then raise exception 'business_record_access_denied'; end if;
end;
$$;

-- Customer businesses this verified user reaches through a provider seat and
-- holds no direct membership in, with the seat's role. Only roles the
-- Versions actor knows (owner, admin, member) are listed.
create function public.provider_seat_businesses(p_user_id uuid, p_verified_email text)
returns table (workspace_id uuid, role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct s.customer_workspace_id, public.provider_seat_direct_role()
    from public.provider_seats s
    join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
    join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
    join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
    join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
      and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
    join public.users u on u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where s.status = 'active'
      and public.provider_seat_direct_role() in ('owner', 'admin', 'member')
      and not exists (select 1 from public.workspace_memberships wm
        where wm.workspace_id = s.customer_workspace_id and wm.user_id = p_user_id)
$$;

-- As VersionActor.memberships: direct memberships, then provider seats
-- (`via: provider_seat`). Same shape as 20261007150000 plus `via`.
create or replace function public.read_version_actor(p_user_id uuid, p_verified_email text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('userId', p_user_id, 'memberships', coalesce((select jsonb_agg(m.body order by m.workspace_id, m.via)
    from (
      select wm.workspace_id, 'membership' as via,
          jsonb_build_object('businessId', wm.workspace_id, 'role', wm.role, 'via', 'membership') as body
        from public.workspace_memberships wm
        join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
        join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
        where wm.user_id = p_user_id
      union all
      select s.workspace_id, 'provider_seat',
          jsonb_build_object('businessId', s.workspace_id, 'role', s.role, 'via', 'provider_seat')
        from public.provider_seat_businesses(p_user_id, p_verified_email) s
    ) m), '[]'::jsonb))
$$;

-- Same contract as 20261007150000, plus the provider seat for a customer business.
create or replace function public.system_version_member_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select wm.role from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
      join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id),
    (select s.role from public.provider_seat_businesses(p_user_id, p_verified_email) s where s.workspace_id = p_workspace_id))
$$;

create or replace function public.system_version_actor_workspaces(p_user_id uuid, p_verified_email text)
returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct x.workspace_id), '{}') from (
    select wm.workspace_id from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
      join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      where wm.user_id = p_user_id
    union
    select s.workspace_id from public.provider_seat_businesses(p_user_id, p_verified_email) s
  ) x
$$;

-- Same contract as 20261005120000: a provider seat satisfies a permission the
-- way a direct membership with the seat's role would. Locked FOR SHARE.
create or replace function public.workspace_require(p_workspace_id uuid, p_user_id uuid, p_permission text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_membership_required';
  end if;
  select wm.role into actor_role
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
  for share;
  if actor_role is null then
    actor_role := public.provider_seat_role(p_workspace_id, p_user_id, true);
  end if;
  if actor_role is null then
    -- Validate the permission name even on the deny path so a typo can never
    -- hide behind "not a member".
    perform public.workspace_role_allows('member', p_permission);
    raise exception 'workspace_membership_required';
  end if;
  if not public.workspace_role_allows(actor_role, p_permission) then
    raise exception 'workspace_permission_denied';
  end if;
  return actor_role;
end;
$$;

-- Same shape as 20261007110000, plus `access`. A business is listed when the
-- agency is its active provider of record and the reader can open it: a
-- direct member, or through the agency's provider seat and the reader's staff row.
create or replace function public.list_provided_clients(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null or p_verified_email is null or p_agency_workspace_id is null then
    raise exception 'workspace_provider_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('customerWorkspaceId', p.customer_workspace_id, 'name', w.name,
        'role', coalesce(m.role, seat.role), 'access', case when m.role is not null then 'membership' else 'provider_seat' end,
        'source', p.source,
        'startedAt', to_char(p.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      order by w.name, p.customer_workspace_id)
    from public.workspace_providers p
    join public.workspaces w on w.id = p.customer_workspace_id and w.kind = 'customer'
    left join public.workspace_memberships m on m.workspace_id = p.customer_workspace_id and m.user_id = p_user_id
    left join public.provider_seat_businesses(p_user_id, p_verified_email) seat on seat.workspace_id = p.customer_workspace_id
      and exists (select 1 from public.provider_seats s where s.customer_workspace_id = p.customer_workspace_id
        and s.agency_workspace_id = p_agency_workspace_id and s.status = 'active')
    where p.provider_workspace_id = p_agency_workspace_id and p.status = 'active'
      and (m.role is not null or seat.role is not null)
  ), '[]'::jsonb);
end;
$$;

-- ---- owner and agency commands ----

-- The verified actor and the business, locked as a business-record write
-- (same advisory key and row lock as business_record_assert_actor). Raises
-- provider_seat_owner_required unless the actor is the business's direct owner.
create function public.provider_seat_assert_owner(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'provider_seat_owner_required';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'provider_seat_owner_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'provider_seat_owner_required'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner' for share;
  if not found then raise exception 'provider_seat_owner_required'; end if;
end;
$$;

-- The owner chooses the agency that operates the business: the provider of
-- record (attribution) and its provider seat (access), together. Choosing a
-- different agency ends the current provider row, which ends that agency's
-- seat and staff rows. Choosing the current provider again replays and
-- restores its seat if the seat was ended.
create function public.choose_business_provider(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_workspace_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_provider public.workspace_providers%rowtype;
  provider_row public.workspace_providers%rowtype;
  seat public.provider_seats%rowtype;
  replayed boolean := false;
begin
  perform public.provider_seat_assert_owner(p_workspace_id, p_user_id, p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  perform 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency' for share;
  if not found then raise exception 'provider_seat_invalid'; end if;
  select * into current_provider from public.workspace_providers
    where customer_workspace_id = p_workspace_id and status = 'active' for update;
  if found and current_provider.provider_workspace_id = p_agency_workspace_id then
    provider_row := current_provider;
    replayed := true;
  else
    if found then
      update public.workspace_providers set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp(),
          end_reason = 'The owner chose another provider.'
        where id = current_provider.id;
    end if;
    insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
      values (p_workspace_id, p_agency_workspace_id, 'business_choice', p_user_id)
      returning * into provider_row;
  end if;
  select * into seat from public.provider_seats
    where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active';
  if not found then
    insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
      values (p_workspace_id, p_agency_workspace_id, 'owner', p_user_id)
      returning * into seat;
    replayed := false;
  end if;
  return jsonb_build_object('customerWorkspaceId', p_workspace_id, 'agencyWorkspaceId', p_agency_workspace_id,
    'providerId', provider_row.id, 'source', provider_row.source, 'seatId', seat.id,
    'grantedByKind', seat.granted_by_kind, 'replayed', replayed);
end;
$$;

-- The owner ends the business's provider of record. Its seat and staff rows
-- end with it. Repeating returns ended = false.
create function public.end_business_provider(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare provider_row public.workspace_providers%rowtype;
begin
  if p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'provider_seat_invalid'; end if;
  perform public.provider_seat_assert_owner(p_workspace_id, p_user_id, p_verified_email);
  update public.workspace_providers set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp(),
      end_reason = coalesce(nullif(btrim(p_reason), ''), 'The owner ended the provider.')
    where customer_workspace_id = p_workspace_id and status = 'active'
    returning * into provider_row;
  return jsonb_build_object('customerWorkspaceId', p_workspace_id, 'ended', provider_row.id is not null,
    'agencyWorkspaceId', provider_row.provider_workspace_id);
end;
$$;

-- End one agency's seat on a business: the business owner revokes it, or an
-- owner/admin of that agency steps back. Attribution is not changed here.
create function public.end_provider_seat(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_workspace_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare seat public.provider_seats%rowtype; by_kind text;
begin
  if p_workspace_id is null or p_agency_workspace_id is null or p_user_id is null or p_verified_email is null
    or (p_reason is not null and char_length(btrim(p_reason)) not between 1 and 500) then
    raise exception 'provider_seat_invalid';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'provider_seat_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role = 'owner' for share of m;
  if found then
    by_kind := 'owner';
  else
    perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
      where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id and m.role in ('owner', 'admin') for share of m;
    if not found then raise exception 'provider_seat_access_denied'; end if;
    by_kind := 'agency';
  end if;
  update public.provider_seats set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp(),
      end_reason = coalesce(nullif(btrim(p_reason), ''),
        case by_kind when 'owner' then 'The owner ended the seat.' else 'The agency stepped back.' end)
    where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
    returning * into seat;
  return jsonb_build_object('customerWorkspaceId', p_workspace_id, 'agencyWorkspaceId', p_agency_workspace_id,
    'ended', seat.id is not null, 'endedByKind', by_kind);
end;
$$;

-- An agency owner/admin puts one of the agency's members on (or off) a client
-- the agency holds an active seat for. Repeating either is a no-op.
create function public.set_agency_client_staff(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_workspace_id uuid,
  p_staff_user_id uuid, p_active boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_value public.agency_client_staff%rowtype; changed boolean := false;
begin
  if p_user_id is null or p_verified_email is null or p_agency_workspace_id is null or p_workspace_id is null
    or p_staff_user_id is null or p_active is null then
    raise exception 'agency_client_staff_invalid';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'agency_client_staff_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id and m.role in ('owner', 'admin')
    for share of m;
  if not found then raise exception 'agency_client_staff_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  if p_active then
    perform 1 from public.provider_seats
      where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
      for share;
    if not found then raise exception 'provider_seat_required'; end if;
    perform 1 from public.workspace_memberships
      where workspace_id = p_agency_workspace_id and user_id = p_staff_user_id for share;
    if not found then raise exception 'agency_client_staff_invalid'; end if;
    select * into row_value from public.agency_client_staff
      where agency_workspace_id = p_agency_workspace_id and customer_workspace_id = p_workspace_id
        and user_id = p_staff_user_id and status = 'active';
    if not found then
      insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
        values (p_agency_workspace_id, p_workspace_id, p_staff_user_id, p_user_id)
        returning * into row_value;
      changed := true;
    end if;
  else
    update public.agency_client_staff set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
      where agency_workspace_id = p_agency_workspace_id and customer_workspace_id = p_workspace_id
        and user_id = p_staff_user_id and status = 'active'
      returning * into row_value;
    changed := row_value.id is not null;
  end if;
  return jsonb_build_object('agencyWorkspaceId', p_agency_workspace_id, 'customerWorkspaceId', p_workspace_id,
    'userId', p_staff_user_id, 'active', p_active, 'changed', changed);
end;
$$;

-- The agency's seats and who works on each client, for any member of the agency.
create function public.read_agency_provider_seats(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_workspace_id;
  if not found then raise exception 'provider_seat_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'customerWorkspaceId', s.customer_workspace_id, 'name', c.name, 'seatId', s.id,
      'grantedByKind', s.granted_by_kind,
      'grantedAt', to_char(s.granted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'staff', coalesce((select jsonb_agg(jsonb_build_object('userId', st.user_id, 'email', lower(u.email), 'agencyRole', am.role)
          order by lower(u.email), st.user_id)
        from public.agency_client_staff st
        join public.users u on u.id = st.user_id
        left join public.workspace_memberships am on am.workspace_id = st.agency_workspace_id and am.user_id = st.user_id
        where st.agency_workspace_id = s.agency_workspace_id and st.customer_workspace_id = s.customer_workspace_id
          and st.status = 'active'), '[]'::jsonb))
      order by c.name, s.customer_workspace_id)
    from public.provider_seats s
    join public.workspaces c on c.id = s.customer_workspace_id
    where s.agency_workspace_id = p_agency_workspace_id and s.status = 'active'), '[]'::jsonb);
end;
$$;

revoke all on function public.provider_seat_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_staff_guard() from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_end_staff() from public, anon, authenticated, service_role;
revoke all on function public.workspace_provider_end_seat() from public, anon, authenticated, service_role;
revoke all on function public.agency_membership_end_staff() from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_direct_role() from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_role(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_businesses(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_assert_owner(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.business_record_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.system_actor_scope(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.read_version_actor(uuid, text) from public, anon, authenticated;
revoke all on function public.system_version_member_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.system_version_actor_workspaces(uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_require(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.list_provided_clients(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.choose_business_provider(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.end_business_provider(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.end_provider_seat(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_agency_client_staff(uuid, text, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.read_agency_provider_seats(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.choose_business_provider(uuid, text, uuid, uuid) to service_role;
grant execute on function public.end_business_provider(uuid, text, uuid, text) to service_role;
grant execute on function public.end_provider_seat(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.set_agency_client_staff(uuid, text, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.read_agency_provider_seats(uuid, text, uuid) to service_role;
