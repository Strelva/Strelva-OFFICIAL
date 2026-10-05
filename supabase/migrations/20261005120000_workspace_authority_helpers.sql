-- One SQL answer to "may this workspace role do this?" The table mirrors
-- WORKSPACE_ROLE_PERMISSIONS in src/platform/workspaces/permissions.ts; a
-- Vitest parity test reads both and fails if they drift.
--
-- Three tiers exist:
--   member and above  create_work, create_handoff, record_calendar_receipt
--   owner and admin   manage_calendar, manage_delegations, manage_handoffs,
--                     manage_work_authority, manage_ongoing, manage_offerings
--   owner only        invite_members, sponsor_assignment, exit_workspace,
--                     manage_members
--
-- Owner-only and the older owner/admin rules keep their own checks inside
-- their existing RPCs and triggers; the names are listed here so the table is
-- complete. There is no Strelva-staff bypass (docs/architecture/auth-tenancy.md): only a direct
-- workspace membership satisfies a permission. An unknown permission name is
-- an error, never a silent deny or allow.
--
-- Additive only. Nothing calls these helpers until 20261005120100 lands.
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
  end if;
  raise exception 'workspace_permission_unknown';
end;
$$;

-- Reads the actor's direct membership and locks it FOR SHARE for the rest of
-- the calling transaction. A concurrent removal or role change waits for the
-- write to commit, and a write that queues behind an uncommitted removal or
-- downgrade re-reads the committed row and is denied. Returns the role.
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

revoke all on function public.workspace_role_allows(text, text) from public, anon, authenticated;
revoke all on function public.workspace_require(uuid, uuid, text) from public, anon, authenticated;
