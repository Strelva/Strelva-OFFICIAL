-- Reverses 20261013120000_owner_recipient_trust.sql.
-- WARNING: this restores the old resolvers, so owner links go again to
-- whatever owner_recipient the working record holds, including one an
-- operator or agency wrote (#524). Run only to unblock a failed release,
-- before 20261011133700's rollback, and reapply the forward migration before
-- rollout. The trust rows, their change log and link bindings are dropped;
-- the business record and owner decisions are untouched.
begin;
set local lock_timeout = '3s';

create or replace function public.resolve_tenant_owner_recipient(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tenant_row record; ws uuid; fact jsonb; fallback jsonb;
begin
  select t.id, t.stable_id, t.owner_email into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then return null; end if;
  select l.workspace_id into ws from public.tenant_workspace_links l where l.tenant_stable_id = tenant_row.stable_id;
  if ws is not null then
    select jsonb_build_object('email', f.value->>'email', 'name', f.value->>'name', 'from', 'record',
        'workspaceId', ws, 'tenantId', tenant_row.id)
      into fact from public.business_record_facts f
      where f.workspace_id = ws and f.fact_key = 'owner_recipient';
    if fact is not null then return fact; end if;
  end if;
  if nullif(btrim(tenant_row.owner_email), '') is not null then
    return jsonb_build_object('email', lower(btrim(tenant_row.owner_email)), 'name', null, 'from', 'tenant',
      'workspaceId', ws, 'tenantId', tenant_row.id);
  end if;
  if ws is not null then
    fallback := public.resolve_business_owner_recipient(ws);
    if fallback is not null then
      return jsonb_build_object('email', fallback->>'email', 'name', fallback->>'name', 'from', 'linked_tenant',
        'workspaceId', ws, 'tenantId', fallback->>'tenantId');
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.resolve_business_owner_recipient(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare fact jsonb; fallback record;
begin
  select jsonb_build_object('email', f.value->>'email', 'name', f.value->>'name', 'from', 'record',
      'source', f.source, 'verified', f.verified, 'tenantId', null)
    into fact from public.business_record_facts f
    where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient';
  if fact is not null then return fact; end if;
  select t.id, t.owner_email into fallback
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id and nullif(btrim(t.owner_email), '') is not null
    order by l.linked_at, l.id limit 1;
  if fallback.id is null then return null; end if;
  return jsonb_build_object('email', lower(btrim(fallback.owner_email)), 'name', null, 'from', 'tenant_fallback',
    'source', null, 'verified', false, 'tenantId', fallback.id);
end;
$$;

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

create or replace function public.record_owner_decision_delivery(
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

create or replace function public.business_trusted_owner_recipient(p_workspace_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select lower(btrim(c.state->'value'->>'email')) from public.business_record_confirmed c
      where c.workspace_id = p_workspace_id and c.entity = 'fact' and c.entity_id = 'owner_recipient'),
    (select lower(btrim(f.value->>'email')) from public.business_record_facts f
      where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient' and f.source = 'tenant_import'),
    (select case when exists (select 1 from public.business_record_facts f
        where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient') then null
      else lower(btrim(t.owner_email)) end
      from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
      where l.workspace_id = p_workspace_id and nullif(btrim(t.owner_email), '') is not null
      order by l.linked_at, l.id limit 1))
$$;

drop trigger business_record_revisions_owner_recipient_log on public.business_record_revisions;
drop trigger business_record_confirmed_owner_recipient_trust on public.business_record_confirmed;
drop trigger tenant_workspace_links_owner_recipient_trust on public.tenant_workspace_links;
drop function public.business_owner_recipient_log_write();
drop function public.business_owner_recipient_trust_confirmed();
drop function public.business_owner_recipient_trust_conversion();
drop function public.business_owner_recipient_set_trust(uuid, text, text, text, boolean, text, uuid, uuid, bigint, text, text);
drop function public.business_owner_recipient_actor_kind(uuid, text, uuid);
drop table public.owner_decision_link_bindings;
drop table public.business_owner_recipient_events;
drop function public.business_owner_recipient_events_immutable();
drop table public.business_owner_recipient_trust;
commit;
