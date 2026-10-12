-- The agency surface in one read. Additive only; it writes nothing.
--
-- agency_client_overview returns one page of every customer business an
-- agency serves, the agency Queue across them and the agency Team. It
-- replaces one GET /api/workspace per client (MAX_AGENCY_CLIENT_LOADS = 8).
--
-- Who counts as a client. A customer business is a candidate when it names
-- this agency through:
--   * an active work delegation (workspace_delegations),
--   * an accepted, unexpired agency assignment (operational_assignments), or
--   * a provider mark (workspace_providers, status active, not ended), when
--     that table exists. It is added by another 1.0.0 stream; until it is
--     migrated the read says so (providersRead = false) and Strelva's
--     converted clients, reached only through admin membership, do not list.
-- A candidate is never access. Each row is then read under
-- system_actor_scope for that business exactly as opening it would be: a
-- direct member sees every System, an agency only the Systems of its
-- delegated or assigned work. A business the actor cannot reach is left out.
-- A business that fails for any other reason is returned by name with
-- status 'unavailable', and the rest still load.

create function public.agency_overview_providers(p_agency_workspace_id uuid, out read boolean, out customers uuid[])
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  read := false;
  customers := '{}';
  if to_regclass('public.workspace_providers') is null then return; end if;
  begin
    execute 'select coalesce(array_agg(distinct customer_workspace_id), ''{}'') from public.workspace_providers
      where provider_workspace_id = $1 and status = ''active'' and ended_at is null'
      into customers using p_agency_workspace_id;
    read := true;
  exception when undefined_column or undefined_table then
    customers := '{}';
  end;
end;
$$;

-- One client row in the actor's scope. Raises business_record_access_denied
-- when the actor cannot open this business.
create function public.agency_overview_client(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid,
  p_provider boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record; systems jsonb; needs jsonb; requests integer; improvements integer; receipt timestamptz;
begin
  scope := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'lifecycle', s.lifecycle,
      'versionContext', v.context_label) order by s.created_at, s.id), '[]'::jsonb)
    into systems
    from public.systems s
    left join public.system_versions v on v.version_system_id = s.id
    where s.business_workspace_id = p_workspace_id
      and not exists (select 1 from public.system_version_sources src where src.system_id = s.id and src.hidden)
      and public.system_in_scope(p_workspace_id, s.origin_kind, s.origin_ref, scope.work_ids);
  select jsonb_build_object('count', count(*), 'oldestAt', public.system_version_ts(min(w.updated_at)))
    into needs
    from public.saved_product_work w
    where w.workspace_id = p_workspace_id and w.product_id = 'operations'
      and w.payload->>'status' in ('needs_attention','proposed')
      and (scope.work_ids is null or w.id = any(scope.work_ids));
  select count(*) into requests from public.service_requests r
    where r.business_workspace_id = p_workspace_id and r.status = 'requested' and r.provider_acceptance <> 'declined'
      and (scope.work_ids is null or r.provider_agency_workspace_id = p_agency_workspace_id);
  select count(*) into improvements from public.system_versions v
    join public.systems vs on vs.id = v.version_system_id
    where v.business_workspace_id = p_workspace_id
      and public.system_in_scope(p_workspace_id, vs.origin_kind, vs.origin_ref, scope.work_ids)
      and exists (select 1 from public.system_version_source_revisions r where r.source_system_id = v.source_system_id
        and r.number > v.baseline_revision
        and not exists (select 1 from public.system_version_decisions d where d.version_id = v.id and d.source_revision = r.number));
  select max(at) into receipt from (
    select max(created_at) as at from public.website_document_receipts where workspace_id = p_workspace_id and scope.work_ids is null
    union all
    select max(r.created_at) from public.system_revisions r
      join public.systems s on s.id = r.system_id
      where r.business_workspace_id = p_workspace_id
        and public.system_in_scope(p_workspace_id, s.origin_kind, s.origin_ref, scope.work_ids)
  ) receipts;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'name', (select name from public.workspaces where id = p_workspace_id),
    'reach', case when scope.access = 'agency' then 'agency' else 'member' end,
    'role', scope.access,
    'provider', p_provider,
    'status', 'ready',
    'systems', systems,
    'needsYou', needs,
    'openRequests', requests,
    'improvementsWaiting', improvements,
    'lastReceiptAt', public.system_version_ts(receipt));
end;
$$;

-- Queue items for one client already known to be in the actor's scope.
create function public.agency_overview_queue(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record; client_name text;
begin
  scope := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  select name into client_name from public.workspaces where id = p_workspace_id;
  return coalesce((select jsonb_agg(item) from (
    select jsonb_build_object('id', 'request:' || r.id, 'kind', 'request', 'workspaceId', p_workspace_id, 'clientName', client_name,
        'title', left(btrim(r.request_text), 300), 'systemId', null, 'workId', null, 'since', public.system_version_ts(r.created_at)) item
      from public.service_requests r
      where r.business_workspace_id = p_workspace_id and r.status = 'requested' and r.provider_acceptance <> 'declined'
        and (scope.work_ids is null or r.provider_agency_workspace_id = p_agency_workspace_id)
    union all
    select jsonb_build_object('id', 'needs_you:' || w.id, 'kind', 'needs_you', 'workspaceId', p_workspace_id, 'clientName', client_name,
        'title', coalesce(nullif(btrim(w.title), ''), 'Waiting on a decision'), 'systemId', null, 'workId', w.id,
        'since', public.system_version_ts(w.updated_at))
      from public.saved_product_work w
      where w.workspace_id = p_workspace_id and w.product_id = 'operations' and w.payload->>'status' in ('needs_attention','proposed')
        and (scope.work_ids is null or w.id = any(scope.work_ids))
    union all
    select jsonb_build_object('id', 'improvement:' || v.id || ':' || r.number, 'kind', 'improvement', 'workspaceId', p_workspace_id,
        'clientName', client_name, 'title', left(vs.name || ': ' || r.summary, 300), 'systemId', v.version_system_id, 'workId', null,
        'since', public.system_version_ts(r.published_at))
      from public.system_versions v
      join public.systems vs on vs.id = v.version_system_id
      join lateral (select * from public.system_version_source_revisions r2 where r2.source_system_id = v.source_system_id
        order by r2.number desc limit 1) r on true
      where v.business_workspace_id = p_workspace_id and r.number > v.baseline_revision
        and public.system_in_scope(p_workspace_id, vs.origin_kind, vs.origin_ref, scope.work_ids)
        and not exists (select 1 from public.system_version_decisions d where d.version_id = v.id and d.source_revision = r.number)
  ) q), '[]'::jsonb);
end;
$$;

create function public.agency_client_overview(
  p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text, p_cursor uuid, p_limit integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare providers record; candidates uuid[]; page uuid[]; client uuid; row jsonb; rows jsonb := '[]'::jsonb;
  queue jsonb := '[]'::jsonb; ready uuid[] := '{}'; next_cursor uuid; total integer; lim integer;
  cursor_name text; team jsonb; member record; reached jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'system_input_invalid'; end if;
  lim := p_limit;
  if not exists (select 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency')
    or public.system_version_member_role(p_agency_workspace_id, p_user_id, p_verified_email) is null then
    raise exception 'business_record_access_denied';
  end if;
  providers := public.agency_overview_providers(p_agency_workspace_id);
  select coalesce(array_agg(distinct c), '{}') into candidates from (
    select d.customer_workspace_id c from public.workspace_delegations d
      where d.agency_workspace_id = p_agency_workspace_id and d.status = 'active'
    union
    select a.workspace_id from public.operational_assignments a
      where a.assignee_workspace_id = p_agency_workspace_id and a.assignee_kind = 'agency'
        and a.status = 'accepted' and a.expires_at > clock_timestamp()
    union
    select unnest(providers.customers)
  ) x join public.workspaces w on w.id = x.c and w.kind = 'customer';
  total := cardinality(candidates);
  if p_cursor is not null then
    select lower(name) into cursor_name from public.workspaces where id = p_cursor;
  end if;
  select array_agg(id order by lower(name), id) into page from (
    select w.id, w.name from public.workspaces w
      where w.id = any(candidates)
        and (p_cursor is null or (lower(w.name), w.id) > (coalesce(cursor_name, ''), p_cursor))
      order by lower(w.name), w.id
      limit lim + 1
  ) p;
  page := coalesce(page, '{}');
  if cardinality(page) > lim then
    next_cursor := page[lim];
    page := page[1:lim];
  end if;
  foreach client in array page loop
    begin
      row := public.agency_overview_client(client, p_user_id, p_verified_email, p_agency_workspace_id, client = any(providers.customers));
      queue := queue || public.agency_overview_queue(client, p_user_id, p_verified_email, p_agency_workspace_id);
      ready := ready || client;
    exception when others then
      if sqlerrm = 'business_record_access_denied' then
        row := null;
        total := total - 1;
      else
        row := jsonb_build_object('workspaceId', client, 'name', (select name from public.workspaces where id = client),
          'reach', 'member', 'role', null, 'provider', client = any(providers.customers), 'status', 'unavailable',
          'systems', '[]'::jsonb, 'needsYou', jsonb_build_object('count', 0, 'oldestAt', null), 'openRequests', 0,
          'improvementsWaiting', 0, 'lastReceiptAt', null);
      end if;
    end;
    if row is not null then rows := rows || jsonb_build_array(row); end if;
  end loop;

  -- Team: the agency's members and which loaded clients each one reaches,
  -- each checked under that member's own scope.
  team := '[]'::jsonb;
  for member in select wm.user_id, wm.role, u.email from public.workspace_memberships wm
      join public.users u on u.id = wm.user_id
      where wm.workspace_id = p_agency_workspace_id order by u.email loop
    reached := '[]'::jsonb;
    foreach client in array ready loop
      begin
        perform public.system_actor_scope(client, member.user_id, member.email, false);
        reached := reached || jsonb_build_array(jsonb_build_object('workspaceId', client,
          'name', (select name from public.workspaces where id = client)));
      exception when others then
        if sqlerrm <> 'business_record_access_denied' then raise; end if;
      end;
    end loop;
    team := team || jsonb_build_array(jsonb_build_object('userId', member.user_id, 'email', member.email, 'role', member.role,
      'clients', reached));
  end loop;

  return jsonb_build_object(
    'agencyWorkspaceId', p_agency_workspace_id,
    'clients', rows,
    'queue', queue,
    'team', team,
    'total', greatest(total, 0),
    'nextCursor', next_cursor,
    'providersRead', providers.read);
end;
$$;

revoke all on function public.agency_overview_providers(uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_overview_client(uuid, uuid, text, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.agency_overview_queue(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_client_overview(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.agency_client_overview(uuid, uuid, text, uuid, integer) to service_role;
