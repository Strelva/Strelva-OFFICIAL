-- Rollback for 20261011153000_operator_owner_decisions.sql: restores
-- claim_owner_decision exactly as 20261007120000_needs_you.sql defined it,
-- and drops business_agency_seat and tenant_agency_seat. No data changes
-- either way. Re-opens #530 M8: a super admin or a provider agency's member
-- with an admin seat can again decide an admin_may_decide owner item.

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

drop function public.tenant_agency_seat(text, uuid);
drop function public.business_agency_seat(uuid, uuid);
