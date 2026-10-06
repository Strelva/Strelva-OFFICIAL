-- Which workspace is Strelva's own agency. Additive only.
--
-- Strelva-authored sources (offering definitions, Strelva's inquiry intake)
-- live in one real agency workspace. Before this, code named that business
-- with the string "strelva" (STRELVA_AUTHOR_BUSINESS_ID). Now it is a row,
-- set by a Strelva operator and read by the server.
--
-- The mark grants nothing: being Strelva's agency workspace gives no access
-- to any customer business. Access still comes only from membership,
-- delegation or assignment.

create table public.platform_workspaces (
  role text primary key check (role in ('strelva_agency')),
  workspace_id uuid not null unique references public.workspaces(id) on delete restrict,
  set_by uuid not null references public.users(id) on delete restrict,
  set_at timestamptz not null default clock_timestamp()
);
alter table public.platform_workspaces enable row level security;
revoke all on public.platform_workspaces from public, anon, authenticated, service_role;

create function public.read_platform_workspace(p_role text) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select workspace_id from public.platform_workspaces where role = p_role
$$;

-- An operator (super admin) names an agency workspace. Changing it later is
-- allowed only to another agency workspace, and is recorded by who and when.
create function public.set_platform_workspace(p_operator_email text, p_role text, p_workspace_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_role is distinct from 'strelva_agency' then raise exception 'platform_workspace_role_invalid'; end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and kind = 'agency') then
    raise exception 'platform_workspace_not_agency';
  end if;
  insert into public.platform_workspaces(role, workspace_id, set_by) values (p_role, p_workspace_id, operator_id)
    on conflict (role) do update set workspace_id = excluded.workspace_id, set_by = excluded.set_by, set_at = clock_timestamp();
  return p_workspace_id;
end;
$$;

revoke all on function public.read_platform_workspace(text) from public, anon, authenticated;
revoke all on function public.set_platform_workspace(text, text, uuid) from public, anon, authenticated;
grant execute on function public.read_platform_workspace(text) to service_role;
grant execute on function public.set_platform_workspace(text, text, uuid) to service_role;
