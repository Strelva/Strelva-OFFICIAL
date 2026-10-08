-- Agency 1.0 #255 (1 of 2): client-resource mandates and the one
-- acting-provider predicate (audits A AG-05, C SY-T1, H RL-03, E AP-1, B
-- MO-05; company ADR 0012; research strelva-agency-money-and-verification
-- 2026-10-07 section 10). Additive. Local only until Jacob's yes.
--
-- Why. Batch 7A made an agency eligible for an outside effect platform-wide
-- (agency_verifications, agency_effect_allowed). Eligibility is not
-- authorization: nothing said which business let which agency touch which
-- domain, Google location, sender or payment account. A mandate is that
-- grant: one business, one agency, one effect, one named resource.
--
--   effect    resource_kind     resource_ref
--   publish   website           the website System id
--   publish   domain            a hostname
--   google    google_location   the Google location id
--   email     sender            the sending domain
--   payments  payment_account   the Stripe account id (acct_...)
--
-- The owner grants a mandate, only while the agency holds an active provider
-- seat. For a converted business that has no owner yet, a platform operator
-- may record one at conversion, on a conversion seat, with a note; once an
-- owner exists, only the owner grants. The owner ends any mandate; an agency
-- owner/admin may step back from its own. Ending the seat ends its mandates,
-- and a seat granted again starts with none. Rows only go from active to
-- ended, so the history stays.
--
-- acting_provider(business, user, effect, kind, ref) is the one check for a
-- person acting for a business as its provider:
--   an active provider seat on the business
--   AND the user's current membership in that agency
--   AND the user's active staff row on that business
--   AND (effect given) agency_effect_allowed(agency, effect)
--   AND (effect given) an active mandate for that effect and resource.
-- With no effect it answers the seat question alone: work inside the
-- business (drafts, Needs you, making Systems) needs no verification;
-- building stays free (ADR 0012 rule 4). Every agency is checked the same
-- way, Strelva's own included. Nothing here reads super_admins except the
-- operator-recorded conversion mandate, which names the operator and whether
-- they belong to the agency.
--
-- What verification requires is Jacob's decision #233. This is mechanism.
--
-- Depends on 20261004120000 (systems), 20261009151000 (provider seats) and
-- 20261009152000 (agency verifications).

set local lock_timeout = '3s';

create function public.client_resource_kinds(p_effect text) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select (case p_effect
    when 'publish' then array['website', 'domain']
    when 'google' then array['google_location']
    when 'email' then array['sender']
    when 'payments' then array['payment_account'] end)::text[]
$$;

-- The one spelling of a resource reference, or null when it is not one.
create function public.client_resource_ref(p_kind text, p_ref text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare v text := btrim(coalesce(p_ref, ''));
begin
  if p_kind = 'website' then
    if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return lower(v); end if;
  elsif p_kind in ('domain', 'sender') then
    v := lower(v);
    if char_length(v) <= 253 and v ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then return v; end if;
  elsif p_kind = 'google_location' then
    if v ~ '^[A-Za-z0-9_-]{1,64}$' then return v; end if;
  elsif p_kind = 'payment_account' then
    if v ~ '^acct_[A-Za-z0-9]{1,64}$' then return v; end if;
  end if;
  return null;
end;
$$;

create table public.client_resource_mandates (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  effect text not null check (effect in ('publish', 'google', 'email', 'payments')),
  resource_kind text not null,
  resource_ref text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  granted_by_kind text not null check (granted_by_kind in ('owner', 'conversion')),
  granted_by uuid not null references public.users(id) on delete restrict,
  granter_is_agency_member boolean not null,
  grant_note text check (grant_note is null or char_length(grant_note) between 1 and 500),
  granted_at timestamptz not null default clock_timestamp(),
  ended_by_kind text check (ended_by_kind is null or ended_by_kind in ('owner', 'agency', 'seat_ended')),
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) between 1 and 500),
  check (customer_workspace_id <> agency_workspace_id),
  check (resource_kind = any(public.client_resource_kinds(effect))),
  check (resource_ref = public.client_resource_ref(resource_kind, resource_ref)),
  check (granted_by_kind <> 'conversion' or grant_note is not null),
  check ((status = 'ended') = (ended_at is not null)),
  check ((status = 'ended') = (ended_by is not null and ended_by_kind is not null and end_reason is not null))
);
create unique index client_resource_mandates_one_active_idx
  on public.client_resource_mandates(customer_workspace_id, agency_workspace_id, effect, resource_kind, resource_ref)
  where status = 'active';
create index client_resource_mandates_agency_idx
  on public.client_resource_mandates(agency_workspace_id, status, granted_at);
create index client_resource_mandates_business_idx
  on public.client_resource_mandates(customer_workspace_id, granted_at desc);

alter table public.client_resource_mandates enable row level security;
revoke all on public.client_resource_mandates from public, anon, authenticated, service_role;

-- A mandate is written only on an active seat, may only end, and is deleted
-- only with a workspace.
create function public.client_resource_mandate_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'active'
      or not exists (select 1 from public.workspaces where id = new.customer_workspace_id and kind = 'customer')
      or not exists (select 1 from public.workspaces where id = new.agency_workspace_id and kind = 'agency')
      or not exists (select 1 from public.provider_seats s where s.customer_workspace_id = new.customer_workspace_id
        and s.agency_workspace_id = new.agency_workspace_id and s.status = 'active') then
      raise exception 'client_resource_mandate_invalid';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'ended'
      and (to_jsonb(new) - array['status','ended_by_kind','ended_by','ended_at','end_reason']::text[])
        = (to_jsonb(old) - array['status','ended_by_kind','ended_by','ended_at','end_reason']::text[]) then
      return new;
    end if;
    raise exception 'client_resource_mandate_immutable';
  end if;
  if not exists (select 1 from public.workspaces where id = old.customer_workspace_id)
    or not exists (select 1 from public.workspaces where id = old.agency_workspace_id) then
    return old;
  end if;
  raise exception 'client_resource_mandate_immutable';
end;
$$;
create trigger client_resource_mandates_guard before insert or update or delete on public.client_resource_mandates
  for each row execute function public.client_resource_mandate_guard();

-- Ending a seat ends that agency's mandates on the business. Same actor and
-- time, same transaction.
create function public.provider_seat_end_mandates() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.client_resource_mandates set status = 'ended', ended_by_kind = 'seat_ended',
      ended_by = new.ended_by, ended_at = new.ended_at, end_reason = 'The provider seat ended.'
    where customer_workspace_id = new.customer_workspace_id and agency_workspace_id = new.agency_workspace_id
      and status = 'active';
  return new;
end;
$$;
create trigger provider_seats_end_mandates after update of status on public.provider_seats
  for each row when (old.status = 'active' and new.status = 'ended')
  execute function public.provider_seat_end_mandates();

create function public.client_resource_mandate_json(m public.client_resource_mandates) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', m.id, 'customerWorkspaceId', m.customer_workspace_id,
    'agencyWorkspaceId', m.agency_workspace_id, 'effect', m.effect, 'resourceKind', m.resource_kind,
    'resourceRef', m.resource_ref, 'status', m.status, 'grantedByKind', m.granted_by_kind,
    'grantedBy', m.granted_by, 'granterIsAgencyMember', m.granter_is_agency_member, 'grantNote', m.grant_note,
    'grantedAt', to_char(m.granted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'endedByKind', m.ended_by_kind, 'endedBy', m.ended_by, 'endReason', m.end_reason,
    'endedAt', case when m.ended_at is not null then to_char(m.ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end)
$$;

-- Validates an effect and resource pair, returning the normalized reference.
create function public.client_resource_assert(p_effect text, p_resource_kind text, p_resource_ref text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare ref text;
begin
  if p_effect is null or not (p_effect = any(public.agency_effect_names())) then raise exception 'agency_effect_unknown'; end if;
  if p_resource_kind is null or not (p_resource_kind = any(public.client_resource_kinds(p_effect))) then
    raise exception 'client_resource_mandate_invalid';
  end if;
  ref := public.client_resource_ref(p_resource_kind, p_resource_ref);
  if ref is null then raise exception 'client_resource_mandate_invalid'; end if;
  return ref;
end;
$$;

-- ---- the predicate ----

-- The agency this user acts for on this business, or null with the reason:
-- not_staffed (no seat, not in the agency, or not on the business),
-- unverified (no staffed agency is verified for the effect) or no_mandate
-- (verified, but the business has not granted this resource). The seat,
-- agency membership, staff and mandate rows it relies on are held FOR SHARE,
-- and the agency's verification key is held shared, so an end, a removal or
-- a revocation racing this transaction waits for it.
create function public.acting_provider_check(
  p_workspace_id uuid, p_user_id uuid, p_effect text, p_resource_kind text, p_resource_ref text,
  out agency_workspace_id uuid, out reason text
)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  seat record;
  ref text;
  best text := 'not_staffed';
begin
  if p_effect is null then
    if p_resource_kind is not null or p_resource_ref is not null then raise exception 'client_resource_mandate_invalid'; end if;
  else
    ref := public.client_resource_assert(p_effect, p_resource_kind, p_resource_ref);
  end if;
  reason := 'not_staffed';
  if p_workspace_id is null or p_user_id is null then return; end if;
  for seat in
    select s.agency_workspace_id as agency
      from public.provider_seats s
      join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
      join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      join public.users u on u.id = p_user_id and u.verified_at is not null
      where s.customer_workspace_id = p_workspace_id and s.status = 'active'
      order by s.agency_workspace_id
      for share of s, am, st
  loop
    if p_effect is null then
      agency_workspace_id := seat.agency; reason := null; return;
    end if;
    perform pg_advisory_xact_lock_shared(hashtextextended('agency-verification:' || seat.agency::text, 0));
    if not public.agency_effect_allowed(seat.agency, p_effect) then
      if best = 'not_staffed' then best := 'unverified'; end if;
      continue;
    end if;
    perform 1 from public.client_resource_mandates m
      where m.customer_workspace_id = p_workspace_id and m.agency_workspace_id = seat.agency
        and m.effect = p_effect and m.resource_kind = p_resource_kind and m.resource_ref = ref and m.status = 'active'
      for share;
    if not found then best := 'no_mandate'; continue; end if;
    agency_workspace_id := seat.agency; reason := null; return;
  end loop;
  reason := best;
end;
$$;

create function public.acting_provider(
  p_workspace_id uuid, p_user_id uuid, p_effect text, p_resource_kind text, p_resource_ref text
) returns uuid
language sql volatile security definer set search_path = public, pg_temp as $$
  select (public.acting_provider_check(p_workspace_id, p_user_id, p_effect, p_resource_kind, p_resource_ref)).agency_workspace_id
$$;

-- The agency, or acting_provider_not_staffed | _unverified | _no_mandate.
create function public.acting_provider_assert(
  p_workspace_id uuid, p_user_id uuid, p_effect text, p_resource_kind text, p_resource_ref text
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare result record;
begin
  select * into result from public.acting_provider_check(p_workspace_id, p_user_id, p_effect, p_resource_kind, p_resource_ref);
  if result.agency_workspace_id is null then raise exception 'acting_provider_%', result.reason; end if;
  return result.agency_workspace_id;
end;
$$;

-- For the app, before an outside call it makes itself (a Google write): the
-- verified person, then acting_provider_assert.
create function public.assert_acting_provider(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_effect text, p_resource_kind text, p_resource_ref text
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null
    for key share;
  if not found then raise exception 'acting_provider_not_staffed'; end if;
  return public.acting_provider_assert(p_workspace_id, p_user_id, p_effect, p_resource_kind, p_resource_ref);
end;
$$;

-- When nobody acts in person (a cron, a queued send): the agency the
-- platform serves this business for, for this effect and resource. The
-- agency must hold an active seat, be verified for the effect, and hold the
-- mandate. p_agency_workspace_id null means the provider of record.
create function public.platform_provider_for_resource(
  p_workspace_id uuid, p_agency_workspace_id uuid, p_effect text, p_resource_kind text, p_resource_ref text
) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare agency uuid; ref text;
begin
  ref := public.client_resource_assert(p_effect, p_resource_kind, p_resource_ref);
  if p_workspace_id is null then return null; end if;
  agency := coalesce(p_agency_workspace_id, (select p.provider_workspace_id from public.workspace_providers p
    where p.customer_workspace_id = p_workspace_id and p.status = 'active'));
  if agency is null then return null; end if;
  perform 1 from public.provider_seats s
    join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
    where s.customer_workspace_id = p_workspace_id and s.agency_workspace_id = agency and s.status = 'active'
    for share of s;
  if not found then return null; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('agency-verification:' || agency::text, 0));
  if not public.agency_effect_allowed(agency, p_effect) then return null; end if;
  perform 1 from public.client_resource_mandates m
    where m.customer_workspace_id = p_workspace_id and m.agency_workspace_id = agency
      and m.effect = p_effect and m.resource_kind = p_resource_kind and m.resource_ref = ref and m.status = 'active'
    for share;
  if not found then return null; end if;
  return agency;
end;
$$;

-- The email gate for a send made for a business by its agency (send.ts).
create function public.provider_email_send_allowed(p_workspace_id uuid, p_agency_workspace_id uuid, p_sender text)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if public.client_resource_ref('sender', p_sender) is null then return false; end if;
  return public.platform_provider_for_resource(p_workspace_id, p_agency_workspace_id, 'email', 'sender', p_sender) is not null;
end;
$$;

-- ---- owner, agency and conversion commands ----

-- Whether this website System belongs to the business: a stored System, or
-- the deterministic id of one of its website drafts.
create function public.client_resource_website_belongs(p_workspace_id uuid, p_system_id text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.systems s where s.id::text = p_system_id and s.business_workspace_id = p_workspace_id)
    or exists (select 1 from public.saved_product_work w
      where w.workspace_id = p_workspace_id and w.product_id = 'websites' and w.resource_kind = 'website'
        and public.system_origin_id(p_workspace_id, 'saved_work', w.id::text)::text = p_system_id)
$$;

create function public.client_resource_mandate_insert(
  p_workspace_id uuid, p_agency_workspace_id uuid, p_effect text, p_resource_kind text, p_ref text,
  p_kind text, p_by uuid, p_note text, out mandate public.client_resource_mandates, out replayed boolean
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.provider_seats
    where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
      and (p_kind = 'owner' or granted_by_kind = 'conversion')
    for share;
  if not found then raise exception 'provider_seat_required'; end if;
  if p_resource_kind = 'website' and not public.client_resource_website_belongs(p_workspace_id, p_ref) then
    raise exception 'client_resource_mandate_invalid';
  end if;
  select * into mandate from public.client_resource_mandates
    where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_workspace_id
      and effect = p_effect and resource_kind = p_resource_kind and resource_ref = p_ref and status = 'active';
  replayed := found;
  if not replayed then
    insert into public.client_resource_mandates(customer_workspace_id, agency_workspace_id, effect, resource_kind,
        resource_ref, granted_by_kind, granted_by, granter_is_agency_member, grant_note)
      values (p_workspace_id, p_agency_workspace_id, p_effect, p_resource_kind, p_ref, p_kind, p_by,
        exists (select 1 from public.workspace_memberships m where m.workspace_id = p_agency_workspace_id and m.user_id = p_by),
        p_note)
      returning * into mandate;
  end if;
end;
$$;

-- The owner lets the agency on a provider seat do one effect to one named
-- resource. Granting it again replays.
create function public.grant_client_resource_mandate(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_agency_workspace_id uuid,
  p_effect text, p_resource_kind text, p_resource_ref text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare ref text; result record;
begin
  ref := public.client_resource_assert(p_effect, p_resource_kind, p_resource_ref);
  perform public.provider_seat_assert_owner(p_workspace_id, p_user_id, p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  select * into result from public.client_resource_mandate_insert(p_workspace_id, p_agency_workspace_id, p_effect,
    p_resource_kind, ref, 'owner', p_user_id, null);
  return public.client_resource_mandate_json(result.mandate) || jsonb_build_object('replayed', result.replayed);
end;
$$;

-- At conversion, for a business that has no owner yet: a platform operator
-- records the mandate the client already gave offline, on the conversion
-- seat, with a note saying where it came from. Once an owner exists, only
-- the owner grants.
create function public.record_conversion_resource_mandate(
  p_operator_email text, p_workspace_id uuid, p_agency_workspace_id uuid,
  p_effect text, p_resource_kind text, p_resource_ref text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; ref text; note text := nullif(btrim(coalesce(p_note, '')), ''); result record;
begin
  ref := public.client_resource_assert(p_effect, p_resource_kind, p_resource_ref);
  if note is null or char_length(note) > 500 then raise exception 'client_resource_mandate_invalid'; end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'client_resource_mandate_invalid'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = p_workspace_id and role = 'owner') then
    raise exception 'client_resource_mandate_owner_decides';
  end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  select * into result from public.client_resource_mandate_insert(p_workspace_id, p_agency_workspace_id, p_effect,
    p_resource_kind, ref, 'conversion', operator_id, note);
  return public.client_resource_mandate_json(result.mandate) || jsonb_build_object('replayed', result.replayed);
end;
$$;

-- The business owner ends a mandate, or an owner/admin of its agency steps
-- back from it. Repeating returns ended = false.
create function public.end_client_resource_mandate(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_mandate_id uuid, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare row_value public.client_resource_mandates%rowtype; by_kind text; reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_workspace_id is null or p_mandate_id is null or (reason is not null and char_length(reason) > 500) then
    raise exception 'client_resource_mandate_invalid';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null
    for key share;
  if not found then raise exception 'client_resource_mandate_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  select * into row_value from public.client_resource_mandates
    where id = p_mandate_id and customer_workspace_id = p_workspace_id for update;
  if not found then raise exception 'client_resource_mandate_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role = 'owner' for share of m;
  if found then
    by_kind := 'owner';
  else
    perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
      where m.workspace_id = row_value.agency_workspace_id and m.user_id = p_user_id and m.role in ('owner', 'admin')
      for share of m;
    if not found then raise exception 'client_resource_mandate_access_denied'; end if;
    by_kind := 'agency';
  end if;
  if row_value.status <> 'active' then
    return public.client_resource_mandate_json(row_value) || jsonb_build_object('ended', false);
  end if;
  update public.client_resource_mandates set status = 'ended', ended_by_kind = by_kind, ended_by = p_user_id,
      ended_at = clock_timestamp(),
      end_reason = coalesce(reason, case by_kind when 'owner' then 'The owner ended it.' else 'The agency stepped back.' end)
    where id = row_value.id returning * into row_value;
  return public.client_resource_mandate_json(row_value) || jsonb_build_object('ended', true);
end;
$$;

-- A business's mandates, newest first, with history. Its direct members see
-- every agency's; a member of an agency with an active seat sees its own.
create function public.read_client_resource_mandates(p_user_id uuid, p_verified_email text, p_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare everyone boolean;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null;
  if not found then raise exception 'client_resource_mandate_access_denied'; end if;
  everyone := exists (select 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    and w.kind = 'customer' where m.workspace_id = p_workspace_id and m.user_id = p_user_id);
  if not everyone and not exists (select 1 from public.provider_seats s
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
      where s.customer_workspace_id = p_workspace_id and s.status = 'active') then
    raise exception 'client_resource_mandate_access_denied';
  end if;
  return coalesce((select jsonb_agg(public.client_resource_mandate_json(m) order by m.granted_at desc, m.id)
    from (select * from public.client_resource_mandates x
      where x.customer_workspace_id = p_workspace_id
        and (everyone or exists (select 1 from public.provider_seats s
          join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
          where s.customer_workspace_id = p_workspace_id and s.agency_workspace_id = x.agency_workspace_id and s.status = 'active'))
      order by x.granted_at desc, x.id limit 200) m), '[]'::jsonb);
end;
$$;

revoke all on function public.client_resource_kinds(text) from public, anon, authenticated, service_role;
revoke all on function public.client_resource_ref(text, text) from public, anon, authenticated, service_role;
revoke all on function public.client_resource_mandate_guard() from public, anon, authenticated, service_role;
revoke all on function public.provider_seat_end_mandates() from public, anon, authenticated, service_role;
revoke all on function public.client_resource_mandate_json(public.client_resource_mandates) from public, anon, authenticated, service_role;
revoke all on function public.client_resource_assert(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.acting_provider_check(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.acting_provider(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.acting_provider_assert(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.assert_acting_provider(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.platform_provider_for_resource(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.provider_email_send_allowed(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.client_resource_website_belongs(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.client_resource_mandate_insert(uuid, uuid, text, text, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.grant_client_resource_mandate(uuid, text, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_conversion_resource_mandate(text, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.end_client_resource_mandate(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_client_resource_mandates(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.assert_acting_provider(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.provider_email_send_allowed(uuid, uuid, text) to service_role;
grant execute on function public.grant_client_resource_mandate(uuid, text, uuid, uuid, text, text, text) to service_role;
grant execute on function public.record_conversion_resource_mandate(text, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.end_client_resource_mandate(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.read_client_resource_mandates(uuid, text, uuid) to service_role;
