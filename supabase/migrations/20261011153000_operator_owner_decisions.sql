-- An operator never decides an item routed to the owner (#530, security
-- review M8).
--
-- claim_owner_decision already refuses p_by_kind = 'operator' on an
-- owner_decides item, but a signed-in session takes the member branch, and a
-- super admin who also holds an admin seat on the business passed it for any
-- item with admin_may_decide. That decided the owner's item as an
-- "admin_session". Now a session whose user is an active, verified super
-- admin decides as an owner only when their seat is the owner's; otherwise it
-- is refused like the operator branch ('owner_decision_owner_only').
--
-- Agency staff get the same treatment (#530 follow-up, ADR 0012). A member
-- of an agency that holds an active provider seat on the business
-- (20261009151000) is deciding for the agency, not as the owner, even when
-- they also hold a direct admin seat. Unless they are the business's owner
-- member, they are refused an owner item too. business_agency_seat answers
-- that for a business and tenant_agency_seat for a linked tenant, so the
-- tenant dashboard records their approvals as the agency's
-- (src/lib/operator-decisions.ts), never as owner_approval.
--
-- Only the member branch changes. Signature, grants and every other refusal
-- are as in 20261007120000_needs_you.sql. Rollback:
-- rollback-20261011153000_operator_owner_decisions.sql restores that body and
-- drops the two lookups. No data changes either way.

-- The agency this user decides for on this customer business: an agency with
-- an active provider seat on it that the user is a direct member of, the one
-- that staffs them first. Null for the business's owner member, and for
-- anyone else. Staffing isn't required: an unstaffed member of the provider
-- is still the agency, not the owner.
create function public.business_agency_seat(p_workspace_id uuid, p_user_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select s.agency_workspace_id
    from public.provider_seats s
    join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
    join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
    join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
    where s.customer_workspace_id = p_workspace_id and s.status = 'active'
      and not exists (select 1 from public.workspace_memberships wm
        where wm.workspace_id = s.customer_workspace_id and wm.user_id = p_user_id and wm.role = 'owner')
    order by exists (select 1 from public.agency_client_staff st
        where st.agency_workspace_id = s.agency_workspace_id and st.customer_workspace_id = s.customer_workspace_id
          and st.user_id = p_user_id and st.status = 'active') desc,
      s.granted_at, s.id
    limit 1
$$;

-- The same, for the business a managed-site tenant is linked to.
create function public.tenant_agency_seat(p_tenant_id text, p_user_id uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select public.business_agency_seat(l.workspace_id, p_user_id)
    from public.tenants t
    join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    where t.id = p_tenant_id
$$;

revoke all on function public.business_agency_seat(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tenant_agency_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.tenant_agency_seat(text, uuid) to service_role;

create or replace function public.claim_owner_decision(
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
    -- A Strelva operator holding a member seat (an admin seat, say) is still
    -- an operator: only an owner member decides an owner item as the owner.
    if actor_role <> 'owner' and public.needs_you_operator_id(p_user_id, p_verified_email) is not null then
      raise exception 'owner_decision_owner_only';
    end if;
    -- So is a member of the business's provider agency: they decide for the
    -- agency, never as the owner.
    if actor_role <> 'owner' and public.business_agency_seat(p_workspace_id, p_user_id) is not null then
      raise exception 'owner_decision_owner_only';
    end if;
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

revoke all on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_owner_decision(uuid, uuid, text, text, text, uuid, text, text) to service_role;
