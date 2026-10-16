-- Rollback for 20261028110000_agency_actor_person_name.sql: restores
-- application_action_actor_snapshot exactly as production runs it before this
-- migration (body from 20261021181000_application_actor_snapshots.sql; later
-- files such as 20261024123500, 20261024123600 and 20261027160100 only call it). Agency snapshots go back
-- to naming the agency alone. Snapshots already written with personName keep it:
-- History is evidence and is never rewritten. Refuses when the function body is
-- not the one 20261028110000 installed (a later migration changed it).
-- Prepared SQL only. Production execution requires a separately reviewed approval.
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';

do $guard$
declare current_body text;
begin
  select md5(p.prosrc) into current_body from pg_proc p
   where p.oid = 'public.application_action_actor_snapshot(uuid,uuid)'::regprocedure;
  if current_body is distinct from 'b09212f05eed923ed5eac932464edad7' then
    raise exception 'rollback_20261028110000_function_drift: application_action_actor_snapshot body %', current_body;
  end if;
end;
$guard$;

create or replace function public.application_action_actor_snapshot(p_workspace_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare agency_id uuid; agency_ids uuid[]; display_name text; metadata jsonb;
begin
  if p_user_id is null then return null; end if;
  if exists (select 1 from public.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.user_id = p_user_id) then
    select w.id into agency_id from public.workspaces w where w.id = p_workspace_id and w.kind = 'agency';
  else
    -- The event principal must still have its own agency membership and staff
    -- assignment in an active seat. The business's brand never selects it.
    select array_agg(distinct s.agency_workspace_id) into agency_ids
      from public.agency_client_staff s
      join public.workspace_memberships m on m.workspace_id = s.agency_workspace_id and m.user_id = s.user_id
      join public.provider_seats seat on seat.agency_workspace_id = s.agency_workspace_id
        and seat.customer_workspace_id = s.customer_workspace_id and seat.status = 'active'
      where s.customer_workspace_id = p_workspace_id and s.user_id = p_user_id and s.status = 'active';
    if cardinality(agency_ids) > 1 then return null; end if;
    agency_id := agency_ids[1];
  end if;
  if agency_id is not null then
    select coalesce(nullif(btrim(to_jsonb(w)->'agency_brand'->>'displayName'), ''), w.name)
      into display_name from public.workspaces w where w.id = agency_id and w.kind = 'agency';
    if nullif(btrim(display_name), '') is null then return null; end if;
    return jsonb_build_object('kind', 'agency', 'displayName', display_name);
  end if;
  -- to_jsonb keeps disposable Auth shims without metadata columns compatible.
  select to_jsonb(u)->'raw_user_meta_data' into metadata from auth.users u where u.id = p_user_id;
  display_name := coalesce(
    case when jsonb_typeof(metadata->'full_name') = 'string' then nullif(btrim(metadata->>'full_name'), '') end,
    case when jsonb_typeof(metadata->'name') = 'string' then nullif(btrim(metadata->>'name'), '') end);
  if display_name is null then return null; end if;
  return jsonb_build_object('kind', 'person', 'displayName', display_name);
end;
$$;

revoke all on function public.application_action_actor_snapshot(uuid, uuid) from public, anon, authenticated, service_role;
commit;
