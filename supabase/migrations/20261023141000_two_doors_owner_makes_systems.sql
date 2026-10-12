-- ADR 0015 (two doors): a business can run Strelva itself, so its owners and
-- admins make Systems in their own business. Before this, only an acting
-- provider or a delegated agency could; an owner was a 'member' and refused.
-- Ordinary members stay refused. Provider and agency answers are unchanged and
-- still win, so their funding and authority paths are untouched.
begin;
set local lock_timeout = '5s';

create or replace function public.workspace_make_systems_authority(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
  workspace_kind text;
begin
  if p_workspace_id is null or p_user_id is null then return null; end if;
  select wm.role, w.kind into actor_role, workspace_kind
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
    for share of wm;
  if public.acting_provider(p_workspace_id, p_user_id, null, null, null) is not null then
    return 'provider';
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
  if actor_role in ('owner', 'admin') and workspace_kind = 'customer' then return 'owner'; end if;
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
  if authority not in ('provider', 'agency', 'owner') then raise exception 'workspace_make_systems_required'; end if;
  return authority;
end;
$$;
commit;
