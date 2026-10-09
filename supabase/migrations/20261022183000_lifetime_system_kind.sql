-- Prepared lifetime-kind contract. Does not infer or rewrite historical kinds.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';

-- Keep the existing identity/lifecycle guard and every native command intact.
-- A row invariant also covers current and future native persisted update paths.
create function public.system_kind_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'system_kind_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.system_kind_guard() from public, anon, authenticated, service_role;
create trigger systems_kind_guard before update on public.systems
  for each row execute function public.system_kind_guard();

-- The current command has no renamed wrapper. Keep its current helper chain:
-- system_actor_scope (including private/package successors) -> locked load ->
-- exact change number. An unchanged legacy kind conveys no mutation authority.
create or replace function public.update_business_system(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_expected_change bigint, p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; v record;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, true);
  s := public.system_load(p_workspace_id, p_system_id, true, v.work_ids);
  if p_expected_change is null or s.change_number <> p_expected_change then raise exception 'system_change_conflict'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
    or (p_patch - array['name','purpose','kind']::text[]) <> '{}'::jsonb
    or (p_patch ? 'name' and (jsonb_typeof(p_patch->'name') <> 'string'
      or char_length(p_patch->>'name') not between 1 and 160 or p_patch->>'name' <> btrim(p_patch->>'name')))
    or (p_patch ? 'purpose' and (jsonb_typeof(p_patch->'purpose') not in ('string','null')
      or char_length(p_patch->>'purpose') > 1000))
    or (p_patch ? 'kind' and (jsonb_typeof(p_patch->'kind') <> 'string'
      or p_patch->>'kind' !~ '^[a-z][a-z0-9_]{0,39}$')) then
    raise exception 'system_input_invalid';
  end if;
  if p_patch ? 'kind' and p_patch->>'kind' <> s.kind then raise exception 'system_kind_immutable'; end if;
  if p_patch - 'kind' = '{}'::jsonb then return public.system_json(s); end if;
  update public.systems set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
    change_number = change_number + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  return public.system_json(s);
end;
$$;
-- CREATE OR REPLACE retains the existing command ACL; do not broaden it.
commit;
