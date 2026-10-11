-- Presentation snapshots for native internal-tool receipts. No grants, gates,
-- authority or command arguments change. Existing History is never backfilled.
begin;

create function public.application_action_actor_snapshot(p_workspace_id uuid, p_user_id uuid)
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

create function public.application_capture_history_actor()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare latest jsonb; snapshot jsonb; principal uuid; index integer;
begin
  if new.product_id <> 'applications' then return new; end if;
  if tg_op = 'INSERT' then
    snapshot := null;
    if new.payload->'spec'->>'maintenanceOwner' = new.created_by::text then
      snapshot := public.application_action_actor_snapshot(new.workspace_id, new.created_by);
    end if;
    new.payload := new.payload || jsonb_build_object('maintenanceActor', snapshot);
    return new;
  end if;
  if jsonb_typeof(new.payload->'history') is distinct from 'array'
    or (new.payload->>'revision')::integer <= coalesce((old.payload->>'revision')::integer, 0) then return new; end if;
  index := jsonb_array_length(new.payload->'history') - 1;
  latest := new.payload->'history'->index;
  if index < 0 or (latest->>'revision')::integer <> (new.payload->>'revision')::integer then return new; end if;
  -- Command RPCs already record their authenticated p_user_id as actorId.
  -- Non-principal/system strings do not become a made-up platform actor.
  if latest->>'actorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  principal := (latest->>'actorId')::uuid;
  snapshot := public.application_action_actor_snapshot(new.workspace_id, principal);
  new.payload := jsonb_set(new.payload, array['history', index::text], latest || jsonb_build_object('actor', snapshot));
  return new;
end;
$$;

revoke all on function public.application_action_actor_snapshot(uuid, uuid), public.application_capture_history_actor()
  from public, anon, authenticated, service_role;
create trigger application_capture_history_actor before insert or update of payload on public.saved_product_work
  for each row execute function public.application_capture_history_actor();
commit;
