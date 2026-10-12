-- Batch 7A (3 of 4): the service actor serves every verified agency's clients
-- (agency 1.0 #248, audits A AG-07, C SY-T2, G LT-02, H RL-04). Additive.
-- Local only until Jacob's yes.
--
-- Before: "Strelva (system)" opened Needs you items and resumed Make real only
-- for a business Strelva runs (strelva_runs_business: converted from a tenant,
-- or provided by Strelva's designated agency), reading as the business's
-- oldest owner, else its oldest admin, which on a converted business is the
-- Strelva operator's personal membership. Strelva's clients got the platform
-- promise "nobody has to sign in"; no other agency's clients could.
--
-- After: the platform serves a customer business for an effect when its
-- active provider of record (workspace_providers) is an agency verified for
-- that effect (agency_effect_allowed, 20261009152000). Same rule for every
-- agency; Strelva's agency gets today's behavior once it is verified through
-- the same record. A converted business with no provider row is no longer
-- served: conversion names the provider, not the tenant link.
--
--   purpose            effect   why
--   needs_you_sync     email    the item reaches the owner by email
--   make_real_resume   publish  Make real puts the owner's plan live
--   make_real_link     publish  same, approved by the owner's signed link
--
-- The session still carries a member identity, because the existing RPCs
-- recheck one: the verified owner, else a verified direct admin, else a
-- verified staff member of the serving provider's seat (20261009151000),
-- when the seat resolves to owner or admin. Each session now logs the
-- provider it served (provider_workspace_id), so every Strelva (system)
-- action names the agency of record.
--
-- A session is rechecked at every use, not trusted for its 30 minutes:
-- strelva_service_session and record_strelva_service_action require that the
-- session's provider still serves the business for the purpose's effect and
-- that its member identity still qualifies, in the same role. Ending the
-- provider, revoking its verification, or removing or demoting the person
-- stops an open session at its next action.
--
-- strelva_runs_business keeps its name for callers in flight (w6/owner-ask):
-- it now means "served for email". New code calls platform_serves_business.
-- The visible label stays "Strelva (system)": naming the agency on receipts
-- is the TypeScript half of #248.

set local lock_timeout = '3s';

alter table public.strelva_service_actions
  add column provider_workspace_id uuid references public.workspaces(id) on delete set null;

create function public.platform_service_effect(p_purpose text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_purpose
    when 'needs_you_sync' then 'email'
    when 'make_real_resume' then 'publish'
    when 'make_real_link' then 'publish' end
$$;

-- The agency the platform serves this customer business for, for this
-- effect: its active provider of record, when that agency is verified for
-- the effect. Null otherwise.
create function public.platform_serving_provider(p_workspace_id uuid, p_effect text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select p.provider_workspace_id
    from public.workspace_providers p
    join public.workspaces c on c.id = p.customer_workspace_id and c.kind = 'customer'
    where p.customer_workspace_id = p_workspace_id and p.status = 'active'
      and public.agency_effect_allowed(p.provider_workspace_id, p_effect)
$$;

create function public.platform_serves_business(p_workspace_id uuid, p_effect text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.platform_serving_provider(p_workspace_id, p_effect) is not null
$$;

-- Kept for callers written before 7A. Means "the platform serves this
-- business for email" and is the same for every agency.
create or replace function public.strelva_runs_business(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.platform_serves_business(p_workspace_id, 'email')
$$;

-- The member identity a session reads as: verified owner, else verified
-- direct admin, else a verified staff member on the provider's active seat
-- (only while a seat resolves to owner or admin, and only for someone with no
-- direct membership: a direct member is resolved by that role, never the seat).
create function public.platform_service_identity(p_workspace_id uuid, p_provider_workspace_id uuid,
  out user_id uuid, out email text, out role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select x.user_id, x.email, x.role from (
    select u.id as user_id, lower(u.email) as email, wm.role,
        case wm.role when 'owner' then 0 else 1 end as rank, wm.created_at as at
      from public.workspace_memberships wm
      join public.users u on u.id = wm.user_id and u.verified_at is not null
      where wm.workspace_id = p_workspace_id and wm.role in ('owner', 'admin')
    union all
    select u.id, lower(u.email), public.provider_seat_direct_role(), 2, st.assigned_at
      from public.provider_seats s
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.status = 'active'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = st.user_id
      join public.users u on u.id = st.user_id and u.verified_at is not null
      where s.customer_workspace_id = p_workspace_id and s.agency_workspace_id = p_provider_workspace_id
        and s.status = 'active' and public.provider_seat_direct_role() in ('owner', 'admin')
        and not exists (select 1 from public.workspace_memberships wm
          where wm.workspace_id = p_workspace_id and wm.user_id = st.user_id)
  ) x order by x.rank, x.at, x.user_id limit 1
$$;

-- Whether this person may still be a session's member identity, in this
-- role: a verified direct owner/admin, or a verified staff member, still in
-- the agency, on the provider's active seat. The sources of
-- platform_service_identity, at any rank.
create function public.platform_service_identity_holds(p_workspace_id uuid, p_provider_workspace_id uuid,
  p_user_id uuid, p_role text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.workspace_memberships wm
      join public.users u on u.id = wm.user_id and u.verified_at is not null
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and wm.role in ('owner', 'admin')
        and wm.role = p_role)
    or exists (select 1 from public.provider_seats s
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = st.user_id
      join public.users u on u.id = st.user_id and u.verified_at is not null
      where s.customer_workspace_id = p_workspace_id and s.agency_workspace_id = p_provider_workspace_id
        and s.status = 'active' and public.provider_seat_direct_role() in ('owner', 'admin')
        and public.provider_seat_direct_role() = p_role
        and not exists (select 1 from public.workspace_memberships wm
          where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id))
$$;

-- A session row still in force: inside its 30 minutes (20261009100000), its
-- provider still the one the platform serves this business through for the
-- purpose's effect, and its member identity still holding.
create function public.platform_service_session_holds(p_session public.strelva_service_actions) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_session.action = 'session'
    and p_session.created_at > clock_timestamp() - interval '30 minutes'
    and public.platform_serving_provider(p_session.workspace_id, public.platform_service_effect(p_session.purpose))
      = p_session.provider_workspace_id
    and public.platform_service_identity_holds(p_session.workspace_id, p_session.provider_workspace_id,
      p_session.on_behalf_user_id, p_session.on_behalf_role), false)
$$;

-- Same contract as 20261009100000, served by the neutral rule; also returns
-- providerWorkspaceId and logs it on the session.
create or replace function public.strelva_service_reader(p_workspace_id uuid, p_purpose text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  provider uuid;
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_purpose is null or p_purpose not in ('needs_you_sync', 'make_real_resume') then
    raise exception 'strelva_service_invalid';
  end if;
  provider := public.platform_serving_provider(p_workspace_id, public.platform_service_effect(p_purpose));
  if provider is null then return null; end if;
  select * into reader from public.platform_service_identity(p_workspace_id, provider);
  if reader.user_id is null then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role, provider_workspace_id)
    values (p_workspace_id, p_purpose, 'session', reader.user_id, reader.role, provider)
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', p_purpose,
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email,
    'providerWorkspaceId', provider);
end;
$$;

-- Same contract as 20261009131000, served by the neutral rule for publish.
create or replace function public.strelva_make_real_link_session(p_workspace_id uuid, p_decision_id uuid, p_recipient text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.owner_decisions%rowtype;
  owner_recipient jsonb;
  provider uuid;
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_decision_id is null or p_recipient is null or btrim(p_recipient) = '' then
    raise exception 'strelva_service_invalid';
  end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id;
  if not found or item.source_lifecycle <> 'make_real' or item.route <> 'owner_decides'
    or item.sign_in_required or item.state <> 'open' then
    raise exception 'strelva_service_access_denied';
  end if;
  owner_recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if owner_recipient is null or lower(btrim(owner_recipient->>'email')) <> lower(btrim(p_recipient)) then
    raise exception 'owner_decision_recipient_not_owner';
  end if;
  -- An owner with an account decides as themselves (needs_you_owner_actor).
  if public.needs_you_owner_actor(p_workspace_id, p_recipient) is not null then
    raise exception 'strelva_service_owner_has_account';
  end if;
  provider := public.platform_serving_provider(p_workspace_id, public.platform_service_effect('make_real_link'));
  if provider is null then return null; end if;
  select * into reader from public.platform_service_identity(p_workspace_id, provider);
  if reader.user_id is null then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role, subject, detail,
      provider_workspace_id)
    values (p_workspace_id, 'make_real_link', 'session', reader.user_id, reader.role, 'owner_decision:' || item.id::text,
      'Signed owner link for a Make real plan; the owner has no account.', provider)
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', 'make_real_link',
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email,
    'decisionId', item.id, 'providerWorkspaceId', provider);
end;
$$;

-- Same contract as 20261009100000, rechecked: a live session of this business
-- for this purpose that still holds, or access denied.
create or replace function public.strelva_service_session(p_workspace_id uuid, p_session_id uuid, p_purpose text)
returns public.strelva_service_actions
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare row_value public.strelva_service_actions;
begin
  select * into row_value from public.strelva_service_actions
    where id = p_session_id and workspace_id = p_workspace_id and purpose = p_purpose and action = 'session';
  if not found or not public.platform_service_session_holds(row_value) then
    raise exception 'strelva_service_access_denied';
  end if;
  return row_value;
end;
$$;

-- Same contract as 20261009131000, rechecked the same way.
create or replace function public.record_strelva_service_action(
  p_workspace_id uuid, p_session_id uuid, p_action text, p_subject text, p_detail text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  created uuid;
  session_row public.strelva_service_actions%rowtype;
  item public.owner_decisions%rowtype;
begin
  if p_action is null or p_action not in ('resume', 'run', 'reconcile', 'rollback')
    or p_subject is null or char_length(p_subject) not between 1 and 300 then
    raise exception 'strelva_service_invalid';
  end if;
  select * into session_row from public.strelva_service_actions
    where id = p_session_id and workspace_id = p_workspace_id and action = 'session'
      and purpose in ('make_real_resume', 'make_real_link');
  if not found or not public.platform_service_session_holds(session_row) then
    raise exception 'strelva_service_access_denied';
  end if;
  if session_row.purpose = 'make_real_link' then
    -- One run, for the one decision the session was started for, once the owner's link approved it.
    if p_action <> 'run' then raise exception 'strelva_service_access_denied'; end if;
    select * into item from public.owner_decisions
      where workspace_id = p_workspace_id and id::text = split_part(session_row.subject, ':', 2);
    if not found or item.source_lifecycle <> 'make_real' or item.state <> 'approved'
      or item.decided_by_kind is distinct from 'owner_link' or item.outcome is not null then
      raise exception 'strelva_service_access_denied';
    end if;
    if exists (select 1 from public.strelva_service_actions where session_id = p_session_id and action = 'run') then
      raise exception 'strelva_service_access_denied';
    end if;
  end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, session_id, subject, detail)
    values (p_workspace_id, session_row.purpose, p_action, p_session_id, p_subject, left(p_detail, 500))
    returning id into created;
  return created;
end;
$$;

revoke all on function public.platform_service_effect(text) from public, anon, authenticated, service_role;
revoke all on function public.platform_serving_provider(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.platform_serves_business(uuid, text) from public, anon, authenticated;
revoke all on function public.strelva_runs_business(uuid) from public, anon, authenticated, service_role;
revoke all on function public.platform_service_identity(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.platform_service_identity_holds(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.platform_service_session_holds(public.strelva_service_actions) from public, anon, authenticated, service_role;
revoke all on function public.strelva_service_session(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_strelva_service_action(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.strelva_service_reader(uuid, text) from public, anon, authenticated;
revoke all on function public.strelva_make_real_link_session(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_serves_business(uuid, text) to service_role;
grant execute on function public.strelva_service_reader(uuid, text) to service_role;
grant execute on function public.strelva_make_real_link_session(uuid, uuid, text) to service_role;
grant execute on function public.record_strelva_service_action(uuid, uuid, text, text, text) to service_role;
