begin;
set local lock_timeout = '3s';

-- Minimal shared Home read. No resolver token, decision hash, payer, exit,
-- contact data or approval capability is returned. Read grants are rechecked
-- without locks, using the same authority as opening the client's Systems.
create function public.read_agency_client_home(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record; decisions jsonb; changes jsonb; requests jsonb; checks jsonb;
begin
  scope := public.system_read_scope(p_workspace_id,p_user_id,p_verified_email,false);
  if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then
    raise exception 'business_record_access_denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'systemId',d.system_id,
    'since',public.system_version_ts(d.opened_at),'state',d.state) order by d.opened_at,d.id),'[]') into decisions
  from public.owner_decisions d
  where d.workspace_id=p_workspace_id and d.route='owner_decides'
    and d.change_kind in ('copy.routine','copy.marketing','structure','google.post','google.photo',
      'system.go_live','system.change_live','system.pause','running.approve','request.scope','health.fix','verify.failed')
    and (d.state='open' or d.updated_at>statement_timestamp()-interval '30 days')
    and (exists(select 1 from public.systems s where s.id=d.system_id and s.business_workspace_id=p_workspace_id
      and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))
      or (scope.work_ids is null and d.system_id is null and d.source_lifecycle in ('service_request','provider_delivery','standing_responsibility','work_responsibility')));
  select coalesce(jsonb_agg(row order by at desc),'[]') into changes from (
    select r.created_at at,jsonb_build_object('id',r.id,'systemId',r.system_id,
      'title',coalesce(r.summary,s.name||' changed'),'at',public.system_version_ts(r.created_at)) row
    from public.system_revisions r join public.systems s on s.id=r.system_id and s.business_workspace_id=p_workspace_id
    where r.business_workspace_id=p_workspace_id and r.created_at>statement_timestamp()-interval '7 days'
      and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids)
    order by r.created_at desc,r.id limit 100
  ) q;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.outcome,
    'stage',case when r.status='withdrawn' or r.provider_acceptance='declined' then 'closed'
      when r.provider_acceptance<>'accepted' or r.delivery_commitment is null then 'asked'
      when r.delivery_commitment->>'status'='proposed' then 'needs_you'
      when r.delivery_commitment->>'status'='submitted' then 'ready_for_review'
      when r.delivery_commitment->>'status'='accepted' then 'done'
      when r.delivery_commitment->>'status'='cancelled' then 'closed' else 'in_progress' end,
    'provider',case when r.provider_kind='agency' then jsonb_build_object('kind','agency','agencyWorkspaceId',r.provider_agency_workspace_id) else jsonb_build_object('kind','strelva') end,
    'servingAgencyName',case when a.kind='agency' then case when coalesce(nullif(a.agency_brand->>'displayName',''),a.name)='Strelva' then 'Strelva Agency' else coalesce(nullif(a.agency_brand->>'displayName',''),a.name) end end,
    'dueAt',r.delivery_commitment->>'dueAt','updatedAt',public.system_version_ts(r.updated_at)) order by r.updated_at desc,r.id),'[]') into requests
  from public.service_requests r left join public.workspaces a on a.id=r.provider_agency_workspace_id
  where r.business_workspace_id=p_workspace_id and r.status<>'draft'
    and (exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id)
      or (r.status='requested' and exists(select 1 from public.provider_seats seat
        join public.workspace_memberships m on m.workspace_id=seat.agency_workspace_id and m.user_id=p_user_id
        join public.agency_client_staff staff on staff.agency_workspace_id=seat.agency_workspace_id
          and staff.customer_workspace_id=seat.customer_workspace_id and staff.user_id=p_user_id and staff.status='active'
        where seat.customer_workspace_id=p_workspace_id and seat.agency_workspace_id=r.provider_agency_workspace_id and seat.status='active')));
  select coalesce(jsonb_agg(jsonb_build_object('key',key,'title',title,'systemId',system_id,'status',status,'at',public.system_version_ts(at)) order by at,key),'[]') into checks from (
    select 'listing:'||r.id key,'Google listing change'::text title,null::uuid system_id,r.readback status,r.created_at at
      from public.google_listing_receipts r where r.workspace_id=p_workspace_id and scope.work_ids is null
        and r.status='posted_unverified' and r.readback in ('failed','differs')
    union all
    select 'outside:'||r.id,case when r.provider='google_business' then 'Google change' else 'Website change' end,r.system_id,r.readback,r.created_at
      from public.outside_write_receipts r where coalesce(r.workspace_id,
        (select l.workspace_id from public.tenant_workspace_links l where l.tenant_stable_id=r.tenant_stable_id
          group by l.workspace_id having (select count(*) from public.tenant_workspace_links t where t.tenant_stable_id=r.tenant_stable_id)=1))=p_workspace_id and r.acceptance='accepted' and r.readback in ('failed','differs')
        and (r.system_id is null and scope.work_ids is null or exists(select 1 from public.systems s where s.id=r.system_id
          and s.business_workspace_id=p_workspace_id and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids)))
    union all
    select 'website:'||r.id,'Website deployment',r.system_id,r.read_back,r.recorded_at
      from public.website_change_receipts r where r.workspace_id=p_workspace_id and r.kind='deployed' and r.read_back in ('not_confirmed','not_checked')
        and exists(select 1 from public.systems s where s.id=r.system_id and s.business_workspace_id=p_workspace_id
          and public.system_in_scope(p_workspace_id,s.origin_kind,s.origin_ref,scope.work_ids))
  ) q;
  return jsonb_build_object('workspaceId',p_workspace_id,'decisions',decisions,'changes',changes,'deliveries',requests,'deliveryChecks',checks);
end $$;

-- Display names belong to each authorized Request, independent of the
-- reader's membership in the serving agency. A missing identity stays null.
create function public.read_service_request_agency_names(p_user_id uuid,p_verified_email text,p_request_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare request_id uuid; item public.service_requests; rows jsonb:='[]'; agency_name text;
begin
  if cardinality(p_request_ids)>1000 then raise exception 'system_input_invalid'; end if;
  foreach request_id in array p_request_ids loop
    begin
      select * into item from public.read_service_request(p_user_id,p_verified_email,request_id);
      select case when coalesce(nullif(w.agency_brand->>'displayName',''),w.name)='Strelva' then 'Strelva Agency' else coalesce(nullif(w.agency_brand->>'displayName',''),w.name) end into agency_name
        from public.workspaces w where w.id=item.provider_agency_workspace_id and w.kind='agency';
      rows:=rows||jsonb_build_array(jsonb_build_object('requestId',request_id,'displayName',agency_name));
    exception when others then
      if sqlerrm not in ('service_request_not_found','service_request_access_denied','service_request_provider_ineligible') then raise; end if;
      rows:=rows||jsonb_build_array(jsonb_build_object('requestId',request_id,'displayName',null));
    end;
  end loop;
  return rows;
end $$;

-- Ordinary agency scope, always. Exact decision/Request identities survive
-- the portfolio-to-client transition; titles match the owner's own item.
create function public.agency_client_overview_v3(p_agency_workspace_id uuid,p_user_id uuid,p_verified_email text,p_cursor uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare overview jsonb; clients jsonb:='[]'; queue jsonb:='[]'; client jsonb; projection jsonb; item jsonb; can_build boolean;
begin
  overview:=public.agency_client_overview(p_agency_workspace_id,p_user_id,p_verified_email,p_cursor,p_limit);
  for client in select value from jsonb_array_elements(overview->'clients') loop
    if client->>'status'='ready' then
      projection:=public.read_agency_client_home((client->>'workspaceId')::uuid,p_user_id,p_verified_email);
      -- Eligibility mirrors the existing authoring gate without acquiring its
      -- writer locks. Execution still calls require_agency_authoring_scope.
      can_build:=exists(select 1 from public.workspace_memberships m where m.workspace_id=p_agency_workspace_id
        and m.user_id=p_user_id and m.role in ('owner','admin'))
        and (client->>'role') in ('owner','admin')
        and (public.provider_seat_read_role((client->>'workspaceId')::uuid,p_user_id,false) is not null
          or exists(select 1 from public.workspace_delegations delegation
            join public.workspace_memberships m on m.workspace_id=delegation.agency_workspace_id and m.user_id=p_user_id
            where delegation.customer_workspace_id=(client->>'workspaceId')::uuid and delegation.status='active'))
        and not public.workspace_exit_completed((client->>'workspaceId')::uuid);
      client:=client||jsonb_build_object('canBuild',can_build,'needsYou',jsonb_build_object(
        'count',(select count(*) from jsonb_array_elements(projection->'decisions') d where d->>'state'='open'),
        'oldestAt',(select min(d->>'since') from jsonb_array_elements(projection->'decisions') d where d->>'state'='open')));
      for item in select value from jsonb_array_elements(projection->'decisions') where value->>'state'='open' loop
        queue:=queue||jsonb_build_array(jsonb_build_object('id','decision:'||(item->>'id'),'decisionId',item->'id',
          'kind','needs_you','workspaceId',client->'workspaceId','clientName',client->'name','title',item->'title',
          'systemId',item->'systemId','workId',null,'since',item->'since','label','Waiting on '||(client->>'name'),
          'href','/workspace?view=needs-you&workspaceId='||(client->>'workspaceId')||'&decision='||(item->>'id')));
      end loop;
      for item in select value from jsonb_array_elements(projection->'deliveries') where value->>'stage' not in ('done','closed') loop
        queue:=queue||jsonb_build_array(jsonb_build_object('id','request:'||(item->>'id'),'deliveryId',item->'id',
          'kind','request','workspaceId',client->'workspaceId','clientName',client->'name','title',left(item->>'title',300),
          'systemId',null,'workId',null,'since',item->'updatedAt',
          'label',case when item->>'stage' in ('needs_you','ready_for_review') then 'Waiting on '||(client->>'name')
            when item->>'stage'='asked' then case when item->>'servingAgencyName' is null then 'Agency identity unavailable' else 'Ready for '||(item->>'servingAgencyName')||'''s review' end else 'In progress' end,
          'href','/workspace/delivery/'||(item->>'id')));
      end loop;
    end if;
    clients:=clients||jsonb_build_array(client);
  end loop;
  -- Improvements and explicitly shared finite work keep their scoped IDs.
  select queue||coalesce(jsonb_agg(q),'[]') into queue from jsonb_array_elements(overview->'queue') q
    where q->>'kind'='improvement' or (q->>'kind'='needs_you' and q->>'workId' is not null);
  return overview||jsonb_build_object('clients',clients,'queue',queue);
end $$;
-- Keep the original checksum-pinned delivery Queue intact. Its additive
-- reader excludes owner-only decisions before they enter an agency response.
do $queue$
declare definition text; old_filter text := 'where d.route=''owner_decides'' and';
begin
  definition:=pg_get_functiondef('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)'::regprocedure);
  if md5(definition) is distinct from (select definition_hash from public.provider_client_queue_catalog_guard)
    or position(old_filter in definition)=0 then raise exception 'agency_queue_reader_predecessor_drift'; end if;
  definition:=replace(definition,'FUNCTION public.read_provider_client_queue(', 'FUNCTION public.read_provider_client_queue_v2(');
  definition:=replace(definition,old_filter,$filter$where d.route='owner_decides'
      and d.change_kind in ('copy.routine','copy.marketing','structure','google.post','google.photo',
        'system.go_live','system.change_live','system.pause','running.approve','request.scope','health.fix','verify.failed')
      and$filter$);
  execute definition;
end $queue$;
revoke all on function public.read_provider_client_queue_v2(uuid,text,uuid,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.read_provider_client_queue_v2(uuid,text,uuid,timestamptz,text,integer) to service_role;

revoke all on function public.read_agency_client_home(uuid,uuid,text),public.read_service_request_agency_names(uuid,text,uuid[]),public.agency_client_overview_v3(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.read_agency_client_home(uuid,uuid,text),public.read_service_request_agency_names(uuid,text,uuid[]),public.agency_client_overview_v3(uuid,uuid,text,uuid,integer) to service_role;
notify pgrst,'reload schema';
commit;
