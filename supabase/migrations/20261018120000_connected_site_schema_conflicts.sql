-- Record-only published-fact disagreements in the existing owner decision store.
-- No provider writes, email, or membership assumption. New RPCs only.
create function public.record_connected_site_schema_conflict(p_public_key text, p_origin text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare site public.connected_sites;
begin
  site := public.connected_site_for_write(p_public_key, p_origin);
  if not site.inject_schema or p_item->>'kind' is distinct from 'fact.inferred'
    or p_item->>'route' is distinct from 'owner_decides'
    or p_item->>'sourceLifecycle' is distinct from 'connected_site_schema'
    or p_item->>'sourceId' is distinct from site.id::text then
    raise exception 'connected_site_invalid';
  end if;
  return public.open_owner_decision(site.business_workspace_id, p_item);
end $$;

create function public.read_connected_site_schema_conflict(p_workspace_id uuid, p_site_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.owner_decision_json(d) from public.owner_decisions d
  join public.connected_sites s on s.id = p_site_id and s.business_workspace_id = p_workspace_id
  where s.status = 'active' and s.verified_at is not null and s.inject_schema
    and d.workspace_id = p_workspace_id and d.source_lifecycle = 'connected_site_schema'
    and d.source_id = p_site_id::text and d.state = 'open'
  order by d.opened_at desc, d.id limit 1
$$;

revoke all on function public.record_connected_site_schema_conflict(text,text,jsonb), public.read_connected_site_schema_conflict(uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_connected_site_schema_conflict(text,text,jsonb), public.read_connected_site_schema_conflict(uuid,uuid) to service_role;
