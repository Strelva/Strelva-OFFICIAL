-- Needs you policy settings (docs/product/specs/needs-you.md sections 3.3,
-- 6 step 5 and 7). Additive only: it adds one receipt table and service-role
-- functions on top of 20261007120000_needs_you.sql, and replaces nothing.
--
--   decision_policy_tenant_imports  one immutable receipt per converted
--       tenant setting moved into decision_policies: the tenant's content
--       autonomy (copy.routine) and review reply mode (review.reply). It
--       records today's value and, when the new floor or Strelva's default
--       does not carry it over, why. Once a tenant has a receipt for a kind,
--       decision_policies is that kind's authority for the tenant; until
--       then the Redis key (reb:content-autonomy, reb:reply-voice) is.
--
--   read_tenant_decision_routes     the effective route of both kinds for a
--       linked tenant, and which kinds were moved. Null when unlinked.
--   set_tenant_decision_route       the tenant-dashboard and operator-console
--       write: owner layer for a tenant member with settings:write (editor
--       and up) or a business owner; Strelva's layer for an operator. Same
--       floor and "owner only tightens" rules as set_decision_policy, and the
--       same history receipt.
--   list_owner_decisions_not_told   operators only: owner decisions whose
--       owner was never told (suppressed, bounced or never sent).
--   list_decision_policy_businesses operators only: customer businesses and
--       how many policy rows each has, for the operator policy screen.

create table public.decision_policy_tenant_imports (
  tenant_stable_id uuid not null,
  change_kind text not null check (change_kind in ('copy.routine','review.reply')),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  today_value text not null check (char_length(today_value) between 1 and 40),
  not_migrated text check (not_migrated is null or char_length(not_migrated) <= 300),
  imported_by uuid not null references public.users(id) on delete restrict,
  imported_via text not null check (imported_via in ('seed','owner_save','operator_save')),
  imported_at timestamptz not null default clock_timestamp(),
  primary key (tenant_stable_id, change_kind)
);
create index decision_policy_tenant_imports_workspace_idx on public.decision_policy_tenant_imports(workspace_id, imported_at);
alter table public.decision_policy_tenant_imports enable row level security;
revoke all on public.decision_policy_tenant_imports from public, anon, authenticated, service_role;

create function public.decision_policy_tenant_imports_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then return old; end if;
  raise exception 'decision_policy_import_immutable';
end;
$$;
create trigger decision_policy_tenant_imports_immutable before update or delete on public.decision_policy_tenant_imports
  for each row execute function public.decision_policy_tenant_imports_immutable();

-- The workspace a tenant is linked to, by stable id (rename-safe).
create function public.needs_you_tenant_link(p_tenant_id text, out workspace_id uuid, out tenant_stable_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select l.workspace_id, l.tenant_stable_id
    from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    join public.workspaces w on w.id = l.workspace_id and w.kind = 'customer'
    where t.id = p_tenant_id
    limit 1
$$;

create function public.read_tenant_decision_routes(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare link record;
begin
  select * into link from public.needs_you_tenant_link(p_tenant_id);
  if link.workspace_id is null then return null; end if;
  return jsonb_build_object(
    'workspaceId', link.workspace_id,
    'imported', coalesce((select jsonb_agg(i.change_kind order by i.change_kind) from public.decision_policy_tenant_imports i
      where i.tenant_stable_id = link.tenant_stable_id and i.workspace_id = link.workspace_id), '[]'::jsonb),
    'routes', jsonb_build_object(
      'copy.routine', public.read_decision_policy_state(link.workspace_id, null, 'copy.routine'),
      'review.reply', public.read_decision_policy_state(link.workspace_id, null, 'review.reply')));
end;
$$;

-- One tenant setting, written to decision_policies for the linked business.
-- p_route null clears that layer's row ("back to default"). The import
-- receipt is written once per tenant and kind, with today's value.
create function public.set_tenant_decision_route(
  p_tenant_id text, p_user_id uuid, p_verified_email text, p_layer text, p_kind text, p_route text,
  p_today_value text, p_not_migrated text, p_via text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  link record;
  current_row public.decision_policies%rowtype;
  current_version bigint;
  strelva_route text;
  reason text;
  history_reason text;
  verified boolean;
  is_operator boolean;
begin
  if p_kind not in ('copy.routine','review.reply') then raise exception 'decision_policy_invalid'; end if;
  if p_layer not in ('strelva','owner') then raise exception 'decision_policy_invalid'; end if;
  if p_via not in ('seed','owner_save','operator_save') then raise exception 'decision_policy_invalid'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) is null then raise exception 'decision_policy_invalid'; end if;
  if p_today_value is null or char_length(p_today_value) not between 1 and 40 then raise exception 'decision_policy_invalid'; end if;
  select * into link from public.needs_you_tenant_link(p_tenant_id);
  if link.workspace_id is null then raise exception 'decision_policy_not_linked'; end if;
  select exists (select 1 from public.users u where u.id = p_user_id and u.verified_at is not null
      and lower(u.email) = lower(btrim(coalesce(p_verified_email, '')))) into verified;
  if not verified then raise exception 'decision_policy_access_denied'; end if;
  is_operator := public.needs_you_operator_id(p_user_id, p_verified_email) is not null;
  if p_via = 'seed' then
    -- The seed moves the owner's existing choice; only an operator runs it.
    if not is_operator then raise exception 'decision_policy_access_denied'; end if;
    reason := 'seed';
  elsif p_layer = 'owner' then
    if p_via <> 'owner_save' then raise exception 'decision_policy_invalid'; end if;
    if not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_user_id
          and m.role in ('editor','admin','owner'))
      and public.needs_you_member_role(link.workspace_id, p_user_id, p_verified_email) is distinct from 'owner' then
      raise exception 'decision_policy_access_denied';
    end if;
    reason := 'owner_setting';
  else
    if p_via <> 'operator_save' or not is_operator then raise exception 'decision_policy_access_denied'; end if;
    reason := 'strelva_default';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('decision_policy:' || link.workspace_id::text, 0));
  if p_route is not null and public.needs_you_route_rank(p_route) < public.needs_you_route_rank(public.needs_you_kind_floor(p_kind)) then
    raise exception 'decision_policy_below_floor';
  end if;
  if p_layer = 'owner' and p_route is not null then
    strelva_route := public.needs_you_strelva_route(link.workspace_id, '*', p_kind);
    if public.needs_you_route_rank(p_route) < public.needs_you_route_rank(strelva_route) then
      raise exception 'decision_policy_looser_than_default';
    end if;
  end if;
  select * into current_row from public.decision_policies
    where workspace_id = link.workspace_id and system_key = '*' and change_kind = p_kind and layer = p_layer for update;
  current_version := coalesce(current_row.version, 0);
  if p_route is null then
    if current_row.workspace_id is not null then
      delete from public.decision_policies where workspace_id = link.workspace_id and system_key = '*'
        and change_kind = p_kind and layer = p_layer;
      history_reason := case when p_layer = 'owner' then 'owner_reset' else 'strelva_reset' end;
    end if;
  elsif current_row.route is distinct from p_route then
    insert into public.decision_policies(workspace_id, system_key, change_kind, layer, route, set_by, set_reason, version)
      values (link.workspace_id, '*', p_kind, p_layer, p_route, p_user_id, reason, current_version + 1)
      on conflict (workspace_id, system_key, change_kind, layer) do update
        set route = excluded.route, set_by = excluded.set_by, set_reason = excluded.set_reason,
            version = excluded.version, updated_at = clock_timestamp();
    history_reason := reason;
  end if;
  if history_reason is not null then
    insert into public.decision_policy_history(workspace_id, system_key, change_kind, layer, old_route, new_route, set_by, set_reason, version)
      values (link.workspace_id, '*', p_kind, p_layer, current_row.route, p_route, p_user_id, history_reason, current_version + 1);
  end if;
  insert into public.decision_policy_tenant_imports(tenant_stable_id, change_kind, workspace_id, today_value, not_migrated, imported_by, imported_via)
    values (link.tenant_stable_id, p_kind, link.workspace_id, p_today_value, left(nullif(btrim(coalesce(p_not_migrated, '')), ''), 300), p_user_id, p_via)
    on conflict (tenant_stable_id, change_kind) do nothing;
  return jsonb_build_object('workspaceId', link.workspace_id,
    'state', public.read_decision_policy_state(link.workspace_id, null, p_kind));
end;
$$;

-- Operators only: owner decisions the owner was never told about. Open items
-- whose email was suppressed, bounced or never sent, and items that lapsed in
-- the last 30 days without one sent email. An unseen ask is not an
-- unanswered one.
create function public.list_owner_decisions_not_told(p_user_id uuid, p_verified_email text, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.needs_you_operator_id(p_user_id, p_verified_email) is null then raise exception 'owner_decision_access_denied'; end if;
  return coalesce((select jsonb_agg(row_json order by opened_at, id) from (
    select public.owner_decision_json(d) || jsonb_build_object(
        'businessName', w.name,
        'recipientKnown', public.resolve_business_owner_recipient(d.workspace_id) is not null,
        'lastDelivery', (select jsonb_build_object('kind', x.kind, 'status', x.status, 'reason', x.reason, 'at', x.created_at)
          from public.owner_decision_deliveries x where x.decision_id = d.id order by x.created_at desc, x.id desc limit 1)) as row_json,
      d.opened_at, d.id
    from public.owner_decisions d join public.workspaces w on w.id = d.workspace_id
    where d.route = 'owner_decides'
      and ((d.state = 'open' and d.delivery_state in ('not_sent','suppressed','bounced'))
        or (d.state = 'expired' and d.decided_at > clock_timestamp() - interval '30 days'
          and not exists (select 1 from public.owner_decision_deliveries x where x.decision_id = d.id and x.status = 'sent')))
    order by d.opened_at, d.id
    limit greatest(1, least(coalesce(p_limit, 200), 1000))) not_told), '[]'::jsonb);
end;
$$;

-- Operators only: every customer business, with its policy rows counted.
create function public.list_decision_policy_businesses(p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.needs_you_operator_id(p_user_id, p_verified_email) is null then raise exception 'decision_policy_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name,
      'strelvaRows', (select count(*) from public.decision_policies p where p.workspace_id = w.id and p.layer = 'strelva'),
      'ownerRows', (select count(*) from public.decision_policies p where p.workspace_id = w.id and p.layer = 'owner'))
    order by lower(w.name), w.id)
    from public.workspaces w where w.kind = 'customer'), '[]'::jsonb);
end;
$$;

revoke all on function public.decision_policy_tenant_imports_immutable() from public, anon, authenticated, service_role;
revoke all on function public.needs_you_tenant_link(text) from public, anon, authenticated, service_role;
revoke all on function public.read_tenant_decision_routes(text) from public, anon, authenticated;
revoke all on function public.set_tenant_decision_route(text, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_owner_decisions_not_told(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.list_decision_policy_businesses(uuid, text) from public, anon, authenticated;
grant execute on function public.read_tenant_decision_routes(text) to service_role;
grant execute on function public.set_tenant_decision_route(text, uuid, text, text, text, text, text, text, text) to service_role;
grant execute on function public.list_owner_decisions_not_told(uuid, text, integer) to service_role;
grant execute on function public.list_decision_policy_businesses(uuid, text) to service_role;
