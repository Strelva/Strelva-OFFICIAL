-- Per-workspace release flags (owner entry spec, docs/product/specs/owner-entry.md §3.7, §4).
--
-- Each release flag resolves per workspace, layered over its env flag:
--   env unset or 0   off everywhere; a row here can never turn it on (kill switch)
--   env `workspace`  on only where this table says `on` (or `operators`, for operators and testers)
--   env 1            on everywhere except where this table says `off`
-- The layering itself lives in src/platform/release-flags/resolve.ts. This
-- table only stores the per-workspace state, the named testers, and an
-- immutable history of every change with the operator and the reason.
--
-- Only a Strelva operator (an active super_admins row with a verified email)
-- changes a flag or a tester. Readers are server-only service-role functions.
-- RLS on, every table grant revoked, like website_documents.
--
-- Additive only. No tenant row, reb: key or /api/v1 contract changes.
set local lock_timeout = '3s';

create function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems']::text[]
$$;

create table public.workspace_release_flags (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  flag text not null check (flag = any(public.workspace_release_flag_names())),
  state text not null check (state in ('off', 'operators', 'on')),
  revision bigint not null default 1 check (revision > 0),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, flag)
);

-- People who see a workspace's `operators` state besides super admins.
create table public.workspace_release_testers (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  added_by uuid not null references public.users(id) on delete restrict,
  added_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, user_id)
);
create index workspace_release_testers_user_idx on public.workspace_release_testers(user_id, workspace_id);

-- Immutable. Deleting a workspace removes its history with it (cascade).
create table public.workspace_release_flag_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subject text not null check (subject = any(public.workspace_release_flag_names()) or subject = 'tester'),
  from_state text check (from_state in ('unset', 'off', 'operators', 'on', 'absent', 'present')),
  to_state text not null check (to_state in ('unset', 'off', 'operators', 'on', 'absent', 'present')),
  tester_user_id uuid references public.users(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp()
);
create index workspace_release_flag_changes_workspace_idx on public.workspace_release_flag_changes(workspace_id, changed_at desc, id);

alter table public.workspace_release_flags enable row level security;
alter table public.workspace_release_testers enable row level security;
alter table public.workspace_release_flag_changes enable row level security;
revoke all on public.workspace_release_flags, public.workspace_release_testers, public.workspace_release_flag_changes
  from public, anon, authenticated, service_role;

create function public.workspace_release_flag_change_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return old;
  end if;
  raise exception 'workspace_release_history_immutable';
end;
$$;
create trigger workspace_release_flag_changes_immutable_trg before update or delete on public.workspace_release_flag_changes
  for each row execute function public.workspace_release_flag_change_immutable();

create function public.workspace_release_assert_operator(p_operator_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  select u.id into operator_id from public.users u
    join public.super_admins sa on sa.user_id = u.id and sa.revoked_at is null
    where lower(u.email) = lower(btrim(coalesce(p_operator_email, ''))) and u.verified_at is not null
    for key share of u;
  if operator_id is null then raise exception 'workspace_release_operator_required'; end if;
  return operator_id;
end;
$$;

create function public.workspace_release_assert_workspace(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'workspace_release_workspace_invalid'; end if;
end;
$$;

-- Server-only read of one workspace's flag rows and testers. Callers decide
-- what a viewer sees with the resolver; this returns configuration, not data.
create function public.read_workspace_release_flags(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_workspace_id is null then raise exception 'workspace_release_workspace_invalid'; end if;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'flags', coalesce((select jsonb_object_agg(f.flag, jsonb_build_object('state', f.state, 'revision', f.revision, 'changedAt', f.changed_at))
      from public.workspace_release_flags f where f.workspace_id = p_workspace_id), '{}'::jsonb),
    'testers', coalesce((select jsonb_agg(t.user_id order by t.added_at, t.user_id)
      from public.workspace_release_testers t where t.workspace_id = p_workspace_id), '[]'::jsonb),
    'testerEmails', coalesce((select jsonb_agg(u.email order by t.added_at, t.user_id)
      from public.workspace_release_testers t join public.users u on u.id = t.user_id where t.workspace_id = p_workspace_id), '[]'::jsonb));
end;
$$;

-- Operator change. p_state 'unset' removes the row (the env value applies
-- again). p_expected_revision guards against two operators racing: pass the
-- revision read (0 when unset); a mismatch is a conflict, never a silent win.
create function public.set_workspace_release_flag(
  p_operator_email text, p_workspace_id uuid, p_flag text, p_state text, p_reason text, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; current_row public.workspace_release_flags%rowtype; previous text; next_revision bigint;
begin
  operator_id := public.workspace_release_assert_operator(p_operator_email);
  if p_flag is null or not (p_flag = any(public.workspace_release_flag_names())) then raise exception 'workspace_release_flag_unknown'; end if;
  if p_state is null or p_state not in ('unset', 'off', 'operators', 'on') then raise exception 'workspace_release_state_invalid'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'workspace_release_reason_required'; end if;
  perform public.workspace_release_assert_workspace(p_workspace_id);
  select * into current_row from public.workspace_release_flags where workspace_id = p_workspace_id and flag = p_flag for update;
  previous := coalesce(current_row.state, 'unset');
  if p_expected_revision is null or p_expected_revision <> coalesce(current_row.revision, 0) then
    raise exception 'workspace_release_revision_conflict';
  end if;
  if previous = p_state then
    return public.read_workspace_release_flags(p_workspace_id);
  end if;
  if p_state = 'unset' then
    delete from public.workspace_release_flags where workspace_id = p_workspace_id and flag = p_flag;
  else
    next_revision := coalesce(current_row.revision, 0) + 1;
    insert into public.workspace_release_flags(workspace_id, flag, state, revision, changed_by)
      values (p_workspace_id, p_flag, p_state, next_revision, operator_id)
      on conflict (workspace_id, flag) do update set state = excluded.state, revision = excluded.revision,
        changed_by = excluded.changed_by, changed_at = clock_timestamp();
  end if;
  insert into public.workspace_release_flag_changes(workspace_id, subject, from_state, to_state, reason, changed_by)
    values (p_workspace_id, p_flag, previous, p_state, btrim(p_reason), operator_id);
  return public.read_workspace_release_flags(p_workspace_id);
end;
$$;

-- Operator adds or removes a named tester, by the tester's verified email.
create function public.set_workspace_release_tester(
  p_operator_email text, p_workspace_id uuid, p_tester_email text, p_present boolean, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; tester_id uuid; existed boolean;
begin
  operator_id := public.workspace_release_assert_operator(p_operator_email);
  if p_present is null then raise exception 'workspace_release_state_invalid'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'workspace_release_reason_required'; end if;
  perform public.workspace_release_assert_workspace(p_workspace_id);
  select id into tester_id from public.users
    where lower(email) = lower(btrim(coalesce(p_tester_email, ''))) and verified_at is not null;
  if tester_id is null then raise exception 'workspace_release_tester_unknown'; end if;
  existed := exists (select 1 from public.workspace_release_testers where workspace_id = p_workspace_id and user_id = tester_id);
  if existed = p_present then return public.read_workspace_release_flags(p_workspace_id); end if;
  if p_present then
    insert into public.workspace_release_testers(workspace_id, user_id, added_by) values (p_workspace_id, tester_id, operator_id);
  else
    delete from public.workspace_release_testers where workspace_id = p_workspace_id and user_id = tester_id;
  end if;
  insert into public.workspace_release_flag_changes(workspace_id, subject, from_state, to_state, tester_user_id, reason, changed_by)
    values (p_workspace_id, 'tester', case when existed then 'present' else 'absent' end,
      case when p_present then 'present' else 'absent' end, tester_id, btrim(p_reason), operator_id);
  return public.read_workspace_release_flags(p_workspace_id);
end;
$$;

create function public.read_workspace_release_flag_history(p_operator_email text, p_workspace_id uuid, p_limit integer)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'workspace_release_limit_invalid'; end if;
  return coalesce((select jsonb_agg(row_to_json(page)::jsonb) from (
    select c.id, c.subject, c.from_state as "fromState", c.to_state as "toState",
      tu.email as "testerEmail", c.reason, cu.email as "changedBy", c.changed_at as "changedAt"
    from public.workspace_release_flag_changes c
      join public.users cu on cu.id = c.changed_by
      left join public.users tu on tu.id = c.tester_user_id
    where c.workspace_id = p_workspace_id
    order by c.changed_at desc, c.id desc limit p_limit) page), '[]'::jsonb);
end;
$$;

-- Owner entry, for one signed-in person on one tenant's host. Server-only:
-- the caller passes the session's user id and verified email; a mismatch
-- resolves as a stranger. Returns the linked workspace (or null), the tenant's
-- stable id (the website System's identity), the owner
-- entry row state, and what this person is there: workspace role, named
-- tester, super admin. It never says anything about another workspace.
create function public.resolve_tenant_owner_entry(p_tenant_id text, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare linked_workspace uuid; stable uuid; verified boolean; member_role text; tester boolean := false; operator boolean := false; entry_state text;
begin
  select l.workspace_id, t.stable_id into linked_workspace, stable
    from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    where t.id = p_tenant_id;
  if linked_workspace is null then
    return jsonb_build_object('workspaceId', null, 'tenantStableId', null, 'ownerEntry', null, 'role', null, 'tester', false, 'operator', false);
  end if;
  verified := p_user_id is not null and exists (select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null);
  if verified then
    select role into member_role from public.workspace_memberships where workspace_id = linked_workspace and user_id = p_user_id;
    tester := exists (select 1 from public.workspace_release_testers where workspace_id = linked_workspace and user_id = p_user_id);
    operator := exists (select 1 from public.super_admins where user_id = p_user_id and revoked_at is null);
  end if;
  select state into entry_state from public.workspace_release_flags where workspace_id = linked_workspace and flag = 'owner_entry';
  return jsonb_build_object('workspaceId', linked_workspace, 'tenantStableId', stable, 'ownerEntry', entry_state, 'role', member_role,
    'tester', tester, 'operator', operator);
end;
$$;

revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;
revoke all on function public.workspace_release_flag_change_immutable() from public, anon, authenticated, service_role;
revoke all on function public.workspace_release_assert_operator(text) from public, anon, authenticated, service_role;
revoke all on function public.workspace_release_assert_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_workspace_release_flags(uuid) from public, anon, authenticated;
revoke all on function public.set_workspace_release_flag(text, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.set_workspace_release_tester(text, uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.read_workspace_release_flag_history(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.resolve_tenant_owner_entry(text, uuid, text) from public, anon, authenticated;
grant execute on function public.read_workspace_release_flags(uuid) to service_role;
grant execute on function public.set_workspace_release_flag(text, uuid, text, text, text, bigint) to service_role;
grant execute on function public.set_workspace_release_tester(text, uuid, text, boolean, text) to service_role;
grant execute on function public.read_workspace_release_flag_history(text, uuid, integer) to service_role;
grant execute on function public.resolve_tenant_owner_entry(text, uuid, text) to service_role;
