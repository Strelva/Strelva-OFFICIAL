-- XA-3 (October 16, 2026): an agency actor snapshot also records the agency
-- member who acted, by their own account name, so owner screens can say
-- "Maya at North Studio" instead of the agency alone. Presentation only: no
-- grant, gate, authority or command argument changes. Existing History is
-- never backfilled; snapshots without personName keep naming the agency.
begin;

create or replace function public.application_action_actor_snapshot(p_workspace_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare agency_id uuid; agency_ids uuid[]; display_name text; person_name text; metadata jsonb;
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
  -- to_jsonb keeps disposable Auth shims without metadata columns compatible.
  select to_jsonb(u)->'raw_user_meta_data' into metadata from auth.users u where u.id = p_user_id;
  person_name := left(coalesce(
    case when jsonb_typeof(metadata->'full_name') = 'string' then nullif(btrim(metadata->>'full_name'), '') end,
    case when jsonb_typeof(metadata->'name') = 'string' then nullif(btrim(metadata->>'name'), '') end), 80);
  if agency_id is not null then
    select coalesce(nullif(btrim(to_jsonb(w)->'agency_brand'->>'displayName'), ''), w.name)
      into display_name from public.workspaces w where w.id = agency_id and w.kind = 'agency';
    if nullif(btrim(display_name), '') is null then return null; end if;
    if person_name is null then return jsonb_build_object('kind', 'agency', 'displayName', display_name); end if;
    return jsonb_build_object('kind', 'agency', 'displayName', display_name, 'personName', person_name);
  end if;
  if person_name is null then return null; end if;
  return jsonb_build_object('kind', 'person', 'displayName', person_name);
end;
$$;

revoke all on function public.application_action_actor_snapshot(uuid, uuid) from public, anon, authenticated, service_role;
commit;
