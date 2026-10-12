-- ADR 0015 (two doors): a business brings in agencies itself.
--   * Agencies opt into a directory. The owner sees a list, never a default;
--     at launch Strelva Agency is listed the same way any agency would be.
--   * The owner proposes an agency with scopes, each at a level: prepare
--     (the agency builds and stages; the owner approves) or full_control (the
--     agency approves within that scope). One full_control agency per scope.
--   * The agency accepts before anything happens. Acceptance opens an
--     ordinary provider seat; the first accepted agency becomes the agency of
--     record when the business has none. Payer, adding and ending agencies,
--     data and exit stay owner-only.
--   * A staffed member of an agency with full_control decides that scope's
--     Needs you items as the agency (agency_session), never as the owner.
-- Nothing here sends a message, charges, or changes an existing seat.
begin;
set local lock_timeout = '5s';

create table public.agency_directory_listings (
  agency_workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  summary text not null check (char_length(btrim(summary)) between 1 and 280),
  listed_by uuid not null references public.users(id) on delete restrict,
  listed_at timestamptz not null default clock_timestamp()
);
alter table public.agency_directory_listings enable row level security;
revoke all on public.agency_directory_listings from public, anon, authenticated;

create table public.agency_scope_grants (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null check (scope in ('website','inquiries','bookings','google','internal_tools')),
  level text not null check (level in ('prepare','full_control')),
  status text not null default 'proposed' check (status in ('proposed','active','declined','ended')),
  consent text not null check (char_length(btrim(consent)) between 1 and 2000),
  proposed_by uuid not null references public.users(id) on delete restrict,
  proposed_at timestamptz not null default clock_timestamp(),
  responded_by uuid references public.users(id) on delete restrict,
  responded_at timestamptz,
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  check (customer_workspace_id <> agency_workspace_id),
  check ((status in ('active','declined')) = (responded_at is not null and responded_by is not null) or status = 'ended'),
  check ((status = 'ended') = (ended_at is not null and ended_by is not null))
);
create unique index agency_scope_grants_one_open_idx on public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope)
  where status in ('proposed','active');
create unique index agency_scope_grants_one_full_control_idx on public.agency_scope_grants(customer_workspace_id, scope)
  where level = 'full_control' and status in ('proposed','active');
create index agency_scope_grants_agency_idx on public.agency_scope_grants(agency_workspace_id, status);
alter table public.agency_scope_grants enable row level security;
revoke all on public.agency_scope_grants from public, anon, authenticated;

-- Which scope a Needs you item belongs to. Null: always the owner's.
create function public.owner_decision_scope(p_change_kind text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_change_kind in ('fact.owner_stated','fact.inferred','copy.routine','copy.marketing','structure') then 'website'
    when p_change_kind in ('google.post','google.photo','review.reply','review.reply_critical') then 'google'
    when p_change_kind = 'customer.message' then 'inquiries'
    when p_change_kind = 'customer.commitment' then 'bookings'
    when p_change_kind in ('system.go_live','system.change_live','system.pause') then 'internal_tools'
    else null
  end
$$;

-- The agency holding full control of a scope, or null.
create function public.business_scope_full_control(p_business_id uuid, p_scope text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select g.agency_workspace_id from public.agency_scope_grants g
    join public.provider_seats s on s.customer_workspace_id = g.customer_workspace_id
      and s.agency_workspace_id = g.agency_workspace_id and s.status = 'active'
    where g.customer_workspace_id = p_business_id and g.scope = p_scope
      and g.level = 'full_control' and g.status = 'active'
    limit 1
$$;

create function public.agency_directory_assert_manager(p_agency_id uuid, p_user_id uuid, p_verified_email text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_id and m.role in ('owner','admin')
    for share of m;
  if not found then raise exception 'agency_directory_denied'; end if;
end;
$$;

create function public.set_agency_directory_listing(p_user_id uuid, p_verified_email text, p_agency_id uuid, p_summary text, p_listed boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  if p_listed then
    if p_summary is null or char_length(btrim(p_summary)) not between 1 and 280 then raise exception 'agency_directory_summary_invalid'; end if;
    insert into public.agency_directory_listings(agency_workspace_id, summary, listed_by)
      values (p_agency_id, btrim(p_summary), p_user_id)
      on conflict (agency_workspace_id) do update set summary = excluded.summary, listed_by = excluded.listed_by, listed_at = clock_timestamp();
  else
    delete from public.agency_directory_listings where agency_workspace_id = p_agency_id;
  end if;
  return jsonb_build_object('agencyWorkspaceId', p_agency_id, 'listed', p_listed);
end;
$$;

-- Every listed agency, in name order. No ranking and no featured slot.
create function public.read_agency_directory(p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'agency_directory_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('agencyWorkspaceId', w.id, 'name', w.name, 'summary', l.summary) order by lower(w.name), w.id)
    from public.agency_directory_listings l join public.workspaces w on w.id = l.agency_workspace_id and w.kind = 'agency'), '[]'::jsonb);
end;
$$;

-- The owner proposes an agency with scopes; replaces that agency's open proposal.
create function public.bring_in_agency(p_user_id uuid, p_verified_email text, p_business_id uuid, p_agency_id uuid, p_scopes jsonb, p_consent text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; v_scope text; v_level text; seen text[] := '{}';
begin
  perform public.provider_seat_assert_owner(p_business_id, p_user_id, p_verified_email);
  if public.workspace_exit_completed(p_business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not exists (select 1 from public.agency_directory_listings l join public.workspaces w on w.id = l.agency_workspace_id and w.kind = 'agency'
      where l.agency_workspace_id = p_agency_id)
    and not exists (select 1 from public.provider_seats where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'active') then
    raise exception 'agency_not_listed';
  end if;
  if jsonb_typeof(p_scopes) is distinct from 'array' or jsonb_array_length(p_scopes) not between 1 and 5 then raise exception 'agency_scopes_invalid'; end if;
  if p_consent is null or char_length(btrim(p_consent)) not between 1 and 2000 then raise exception 'agency_consent_required'; end if;
  update public.agency_scope_grants set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
  for item in select * from jsonb_array_elements(p_scopes) loop
    v_scope := item->>'scope'; v_level := item->>'level';
    if v_scope is null or v_level is null or v_scope = any(seen) then raise exception 'agency_scopes_invalid'; end if;
    seen := seen || v_scope;
    -- Raising the level of a scope this agency already holds replaces that grant on acceptance.
    insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, consent, proposed_by)
      values (p_business_id, p_agency_id, v_scope, v_level, btrim(p_consent), p_user_id);
  end loop;
  return public.read_business_agencies(p_user_id, p_verified_email, p_business_id);
exception when unique_violation then
  raise exception 'agency_scope_taken';
end;
$$;

-- The agency's owner or admin accepts or declines everything proposed to it.
create function public.respond_to_agency_proposal(p_user_id uuid, p_verified_email text, p_agency_id uuid, p_business_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare proposer uuid; seat_exists boolean;
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 7415));
  select proposed_by into proposer from public.agency_scope_grants
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed'
    order by proposed_at limit 1 for update;
  if proposer is null then raise exception 'agency_proposal_not_found'; end if;
  if public.workspace_exit_completed(p_business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not p_accept then
    update public.agency_scope_grants set status = 'declined', responded_by = p_user_id, responded_at = clock_timestamp()
      where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
    return jsonb_build_object('status', 'declined');
  end if;
  -- Accepted scopes replace this agency's earlier grants for the same scope.
  update public.agency_scope_grants old set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
    where old.customer_workspace_id = p_business_id and old.agency_workspace_id = p_agency_id and old.status = 'active'
      and exists (select 1 from public.agency_scope_grants n where n.customer_workspace_id = p_business_id
        and n.agency_workspace_id = p_agency_id and n.status = 'proposed' and n.scope = old.scope);
  update public.agency_scope_grants set status = 'active', responded_by = p_user_id, responded_at = clock_timestamp()
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
  select exists (select 1 from public.provider_seats where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'active') into seat_exists;
  if not seat_exists then
    insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
      values (p_business_id, p_agency_id, 'owner', proposer);
  end if;
  if not exists (select 1 from public.workspace_providers where customer_workspace_id = p_business_id and status = 'active') then
    insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
      values (p_business_id, p_agency_id, 'business_choice', proposer);
  end if;
  return jsonb_build_object('status', 'accepted');
end;
$$;

-- The owner ends one agency: its grants and its seat. Other agencies stay.
create function public.end_agency_for_business(p_user_id uuid, p_verified_email text, p_business_id uuid, p_agency_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.provider_seat_assert_owner(p_business_id, p_user_id, p_verified_email);
  update public.agency_scope_grants set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status in ('proposed','active');
  update public.provider_seats set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp(),
      end_reason = coalesce(nullif(btrim(p_reason), ''), 'The owner ended this agency''s access.')
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'active';
  update public.workspace_providers set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp(),
      end_reason = coalesce(nullif(btrim(p_reason), ''), 'The owner ended this agency''s access.')
    where customer_workspace_id = p_business_id and provider_workspace_id = p_agency_id and status = 'active';
  return public.read_business_agencies(p_user_id, p_verified_email, p_business_id);
end;
$$;

-- What a business member sees: each agency, its scopes and levels.
create function public.read_business_agencies(p_user_id uuid, p_verified_email text, p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_business_id;
  if not found then raise exception 'agency_directory_denied'; end if;
  return coalesce((select jsonb_agg(x order by x->>'name') from (
    select jsonb_build_object('agencyWorkspaceId', w.id, 'name', w.name,
      'seat', exists (select 1 from public.provider_seats s where s.customer_workspace_id = p_business_id and s.agency_workspace_id = w.id and s.status = 'active'),
      'ofRecord', exists (select 1 from public.workspace_providers p where p.customer_workspace_id = p_business_id and p.provider_workspace_id = w.id and p.status = 'active'),
      'scopes', coalesce((select jsonb_agg(jsonb_build_object('scope', g.scope, 'level', g.level, 'status', g.status) order by g.scope)
        from public.agency_scope_grants g where g.customer_workspace_id = p_business_id and g.agency_workspace_id = w.id and g.status in ('proposed','active')), '[]'::jsonb)) as x
    from public.workspaces w
    where w.kind = 'agency' and (
      exists (select 1 from public.provider_seats s where s.customer_workspace_id = p_business_id and s.agency_workspace_id = w.id and s.status = 'active')
      or exists (select 1 from public.agency_scope_grants g where g.customer_workspace_id = p_business_id and g.agency_workspace_id = w.id and g.status in ('proposed','active')))
  ) agencies), '[]'::jsonb);
end;
$$;

-- An agency's open proposals, for its owners and admins.
create function public.read_agency_proposals(p_user_id uuid, p_verified_email text, p_agency_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  return coalesce((select jsonb_agg(jsonb_build_object('businessWorkspaceId', b.id, 'businessName', b.name,
      'consent', min(g.consent), 'proposedAt', min(g.proposed_at),
      'scopes', jsonb_agg(jsonb_build_object('scope', g.scope, 'level', g.level) order by g.scope)) order by min(g.proposed_at))
    from public.agency_scope_grants g join public.workspaces b on b.id = g.customer_workspace_id
    where g.agency_workspace_id = p_agency_id and g.status = 'proposed'
    group by b.id, b.name), '[]'::jsonb);
end;
$$;

-- Full control: a staffed agency member decides that scope's items as the agency.
alter table public.owner_decisions drop constraint if exists owner_decisions_decided_by_kind_check;
alter table public.owner_decisions add constraint owner_decisions_decided_by_kind_check check (decided_by_kind is null or decided_by_kind in
  ('owner_link','owner_session','admin_session','member_session','agency_session','operator','expiry','system'));

alter function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text) rename to claim_owner_decision_before_two_doors;
revoke all on function public.claim_owner_decision_before_two_doors(uuid,uuid,text,text,text,uuid,text,text) from public, anon, authenticated, service_role;
create function public.claim_owner_decision(
  p_workspace_id uuid, p_decision_id uuid, p_revision_hash text, p_decision text, p_by_kind text,
  p_user_id uuid, p_verified_email text, p_recipient text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype; v_scope text; v_agency uuid;
begin
  if p_by_kind <> 'agency' then
    return public.claim_owner_decision_before_two_doors(p_workspace_id, p_decision_id, p_revision_hash, p_decision, p_by_kind, p_user_id, p_verified_email, p_recipient);
  end if;
  if p_decision not in ('approve','not_yet') then raise exception 'owner_decision_invalid'; end if;
  perform 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'owner_decision_permission_denied'; end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if item.state <> 'open' then
    return jsonb_build_object('status', case when item.state = 'superseded' then 'changed' else 'already_handled' end, 'item', public.owner_decision_json(item));
  end if;
  if item.revision_hash <> p_revision_hash then return jsonb_build_object('status', 'changed', 'item', public.owner_decision_json(item)); end if;
  if clock_timestamp() >= item.expires_at then return jsonb_build_object('status', 'expired', 'item', public.owner_decision_json(item)); end if;
  if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
  v_scope := public.owner_decision_scope(item.change_kind);
  if v_scope is null then raise exception 'owner_decision_owner_only'; end if;
  v_agency := public.business_scope_full_control(p_workspace_id, v_scope);
  if v_agency is null or not exists (select 1 from public.agency_client_staff st
      join public.workspace_memberships m on m.workspace_id = st.agency_workspace_id and m.user_id = st.user_id
      where st.agency_workspace_id = v_agency and st.customer_workspace_id = p_workspace_id and st.user_id = p_user_id and st.status = 'active') then
    raise exception 'owner_decision_owner_only';
  end if;
  update public.owner_decisions set state = case when p_decision = 'approve' then 'approved' else 'declined' end,
      decided_at = clock_timestamp(), decided_by_kind = 'agency_session', decided_by = p_user_id::text
    where id = item.id returning * into item;
  return jsonb_build_object('status', 'claimed', 'item', public.owner_decision_json(item));
end;
$$;

revoke all on function public.owner_decision_scope(text) from public, anon, authenticated;
revoke all on function public.business_scope_full_control(uuid, text) from public, anon, authenticated;
revoke all on function public.agency_directory_assert_manager(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.set_agency_directory_listing(uuid, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.read_agency_directory(uuid, text) from public, anon, authenticated;
revoke all on function public.bring_in_agency(uuid, text, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.respond_to_agency_proposal(uuid, text, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.end_agency_for_business(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_business_agencies(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.read_agency_proposals(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.business_scope_full_control(uuid, text) to service_role;
grant execute on function public.set_agency_directory_listing(uuid, text, uuid, text, boolean) to service_role;
grant execute on function public.read_agency_directory(uuid, text) to service_role;
grant execute on function public.bring_in_agency(uuid, text, uuid, uuid, jsonb, text) to service_role;
grant execute on function public.respond_to_agency_proposal(uuid, text, uuid, uuid, boolean) to service_role;
grant execute on function public.end_agency_for_business(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.read_business_agencies(uuid, text, uuid) to service_role;
grant execute on function public.read_agency_proposals(uuid, text, uuid) to service_role;
grant execute on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) to service_role;
commit;
