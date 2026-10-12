-- Per-workspace release rows on agency workspaces (release packet finding 6).
--
-- Under STRELVA_SYSTEMS_RELEASE=workspace a surface is on only where its
-- workspace's row says so. The agency library, Clients, Queue and Team are
-- read for an agency workspace, but 20261007130000 accepted rows on customer
-- (business) workspaces only, so those surfaces could never turn on per
-- workspace. This accepts agency workspaces too. Personal workspaces stay
-- refused. Same signature, grants re-asserted; nothing else changes.
--
-- Rollback: re-run the function body from 20261007130000 (kind = 'customer').
-- Rows already set on agency workspaces then stay readable but can't change.

set local lock_timeout = '3s';

create or replace function public.workspace_release_assert_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id and kind in ('customer', 'agency') for update;
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
end;
$$;

revoke all on function public.workspace_release_assert_workspace(uuid) from public, anon, authenticated, service_role;
