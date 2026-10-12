-- Who may make or change an internal tool (docs/product/specs/systems-catalog.md
-- section 4). Only a Strelva operator acting inside the workspace, or an
-- agency with an active delegation into it, makes Systems. Owners, admins and
-- members use the tools a maker built and file a Request for new ones.
--
--   operator  an active public.super_admins row AND a direct membership in
--             the workspace (Strelva joins a converted business as a member)
--   agency    a member of an agency workspace that holds an active
--             workspace_delegations row into this customer workspace
--
-- `make_systems` is a named permission no workspace role grants. It joins the
-- role table so workspace_role_allows() and the TypeScript table stay in
-- parity; workspace_make_systems_authority() is the one place it resolves.
--
-- Gated here: save_workspace_work (member create path) and the new
-- save_system_work (agency create path, which needs no direct membership) for
-- products 'applications' and 'custom-applications'. Offering installs,
-- handoff destinations and plan-output receipts keep their own checks.
set local lock_timeout = '3s';

create or replace function public.workspace_role_allows(p_role text, p_permission text)
returns boolean
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_permission in ('create_work', 'create_handoff', 'record_calendar_receipt') then
    return p_role in ('owner', 'admin', 'member');
  elsif p_permission in (
    'manage_calendar', 'manage_delegations', 'manage_handoffs',
    'manage_work_authority', 'manage_ongoing', 'manage_offerings'
  ) then
    return p_role in ('owner', 'admin');
  elsif p_permission in ('invite_members', 'sponsor_assignment', 'exit_workspace', 'manage_members') then
    return p_role = 'owner';
  elsif p_permission in ('make_systems') then
    -- No role grants it. Resolved by workspace_make_systems_authority().
    return false;
  end if;
  raise exception 'workspace_permission_unknown';
end;
$$;

-- Returns 'operator', 'agency', 'member' (a direct member who may not make
-- Systems) or null (no relationship). Locks the membership row it read FOR
-- SHARE so a removal waits for the calling write.
create or replace function public.workspace_make_systems_authority(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  if p_workspace_id is null or p_user_id is null then return null; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
    for share;
  if actor_role is not null and exists (
    select 1 from public.super_admins sa where sa.user_id = p_user_id and sa.revoked_at is null
  ) then
    return 'operator';
  end if;
  if exists (
    select 1
      from public.workspace_delegations d
      join public.workspaces customer on customer.id = d.customer_workspace_id and customer.kind = 'customer'
      join public.workspaces agency on agency.id = d.agency_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = d.agency_workspace_id and am.user_id = p_user_id
      where d.customer_workspace_id = p_workspace_id and d.status = 'active'
  ) then
    return 'agency';
  end if;
  if actor_role is not null then return 'member'; end if;
  return null;
end;
$$;

create or replace function public.workspace_require_make_systems(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  authority text;
begin
  authority := public.workspace_make_systems_authority(p_workspace_id, p_user_id);
  if authority is null then raise exception 'workspace_membership_required'; end if;
  if authority not in ('operator', 'agency') then raise exception 'workspace_make_systems_required'; end if;
  return authority;
end;
$$;

-- Member create path. Unchanged except that internal tools need a maker.
create or replace function public.save_workspace_work(
  p_workspace_id uuid,
  p_user_id uuid,
  p_product_id text,
  p_resource_kind text,
  p_title text,
  p_payload jsonb,
  p_input jsonb,
  p_source_work_id uuid
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.workspace_require(p_workspace_id, p_user_id, 'create_work');
  if p_product_id in ('applications', 'custom-applications') then
    perform public.workspace_require_make_systems(p_workspace_id, p_user_id);
  end if;
  if p_payload is null then raise exception 'saved_work_invalid'; end if;
  return query
  insert into public.saved_product_work as w (
    workspace_id, product_id, resource_kind, title, payload, input, source_work_id, created_by
  ) values (
    p_workspace_id, p_product_id, p_resource_kind, p_title, p_payload, p_input, p_source_work_id, p_user_id
  )
  returning w.*;
end;
$$;

-- Maker create path. An agency is not a direct member of its client's
-- workspace, so this path checks the verified identity and make_systems
-- instead of create_work. The saved-work cap and the exit guard still apply
-- through their triggers on saved_product_work.
create or replace function public.save_system_work(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_product_id text,
  p_resource_kind text,
  p_title text,
  p_payload jsonb,
  p_input jsonb,
  p_source_work_id uuid
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then
    raise exception 'workspace_membership_required';
  end if;
  perform public.workspace_require_make_systems(p_workspace_id, p_user_id);
  if p_product_id not in ('applications', 'custom-applications') or p_payload is null then
    raise exception 'saved_work_invalid';
  end if;
  if public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if p_source_work_id is not null and not exists (
    select 1 from public.saved_product_work where id = p_source_work_id and workspace_id = p_workspace_id
  ) then
    raise exception 'workspace_access_denied';
  end if;
  return query
  insert into public.saved_product_work as w (
    workspace_id, product_id, resource_kind, title, payload, input, source_work_id, created_by
  ) values (
    p_workspace_id, p_product_id, p_resource_kind, p_title, p_payload, p_input, p_source_work_id, p_user_id
  )
  returning w.*;
end;
$$;

revoke all on function public.workspace_role_allows(text, text) from public, anon, authenticated;
revoke all on function public.workspace_make_systems_authority(uuid, uuid) from public, anon, authenticated;
revoke all on function public.workspace_require_make_systems(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_workspace_work(uuid, uuid, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_system_work(uuid, uuid, text, text, text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.workspace_make_systems_authority(uuid, uuid) to service_role;
grant execute on function public.save_workspace_work(uuid, uuid, text, text, text, jsonb, jsonb, uuid) to service_role;
grant execute on function public.save_system_work(uuid, uuid, text, text, text, text, jsonb, jsonb, uuid) to service_role;
