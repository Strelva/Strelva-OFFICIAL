-- Manual inverse for an unused schema only. Never reopen kind mutation beneath
-- retained Systems. No history or data is discarded to make reversal possible.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
lock table public.systems in access exclusive mode;
do $$ begin
  if exists (select 1 from public.systems) then
    raise exception 'system_kind_rollback_requires_data_preservation';
  end if;
end $$;
drop trigger systems_kind_guard on public.systems;
drop function public.system_kind_guard();

-- Restore the exact predecessor command, retaining its existing ACL.
create or replace function public.update_business_system(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_expected_change bigint, p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; v record;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, true);
  s := public.system_load(p_workspace_id, p_system_id, true, v.work_ids);
  if s.change_number <> p_expected_change then raise exception 'system_change_conflict'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
    or (p_patch - array['name','purpose','kind']::text[]) <> '{}'::jsonb
    or (p_patch ? 'name' and jsonb_typeof(p_patch->'name') <> 'string')
    or (p_patch ? 'kind' and jsonb_typeof(p_patch->'kind') <> 'string') then
    raise exception 'system_input_invalid';
  end if;
  update public.systems set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
    kind = case when p_patch ? 'kind' then p_patch->>'kind' else kind end,
    change_number = change_number + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  return public.system_json(s);
end;
$$;
commit;
