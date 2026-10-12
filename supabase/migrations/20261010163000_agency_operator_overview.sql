-- Additive read for STRELVA_OPERATOR_QUEUE_RELEASE=1. The old overview and
-- every flags-off consumer keep their original read. No data migration.
begin;
set local lock_timeout = '2s';

create function public.agency_client_overview_v2(
  p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_cursor uuid default null, p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare overview jsonb; clients jsonb := '[]'; queue jsonb; client jsonb;
  business uuid; scope record; needs jsonb; decisions jsonb; receipt timestamptz;
begin
  -- Existing candidate, verified identity, provider and System scope rules
  -- remain the single authority; a provider relationship alone grants none.
  overview := public.agency_client_overview(p_agency_workspace_id,p_user_id,p_verified_email,p_cursor,p_limit);
  queue := overview->'queue';
  for client in select value from jsonb_array_elements(overview->'clients') loop
    business := (client->>'workspaceId')::uuid;
    if client->>'status' = 'ready' then
      scope := public.system_actor_scope(business,p_user_id,p_verified_email,false);
      if scope.work_ids is null then
        select jsonb_build_object('count',count(*),'oldestAt',public.system_version_ts(min(d.opened_at))) into needs
          from public.owner_decisions d where d.workspace_id=business and d.state='open' and d.route='owner_decides';
        -- Replace the retired operations-status approximation, not the
        -- client's own decision store. One row per decision, no bulk approval.
        select coalesce(jsonb_agg(q),'[]') into queue from jsonb_array_elements(queue) q
          where not (q->>'workspaceId'=business::text and q->>'kind'='needs_you');
        select coalesce(jsonb_agg(jsonb_build_object(
          'id','decision:'||d.id,'kind',case when d.delivery_state='bounced' then 'owner_email' else 'needs_you' end,
          'workspaceId',business,'clientName',client->>'name',
          'title',left(case when d.delivery_state='bounced' then 'Owner email bounced: '||d.title
            when d.delivery_state in ('sent','reminded_1','reminded_2') then d.title||' — owner has not decided'
            when d.delivery_state='suppressed' then d.title||' — owner email is paused' else d.title||' — owner has not been told' end,300),
          'systemId',case when exists(select 1 from public.systems s where s.id=d.system_id and s.business_workspace_id=business) then d.system_id end,
          'workId',null,'since',public.system_version_ts(d.opened_at),
          'href',case when exists(select 1 from public.systems s where s.id=d.system_id and s.business_workspace_id=business)
            then '/workspace?view=system&system='||d.system_id||'&workspaceId='||business
            else '/workspace?view=home&workspaceId='||business end
        ) order by d.opened_at,d.id),'[]') into decisions
          from public.owner_decisions d where d.workspace_id=business and d.state='open' and d.route='owner_decides';
        queue := queue || decisions;
        select max(at) into receipt from (
          select (client->>'lastReceiptAt')::timestamptz as at
          union all select max(coalesce(r.completed_at,r.created_at)) from public.google_listing_receipts r where r.workspace_id=business
          union all select max(r.created_at) from public.outside_write_receipts r where r.workspace_id=business
            or exists(select 1 from public.tenant_workspace_links l where l.workspace_id=business and l.tenant_stable_id=r.tenant_stable_id)
        ) receipts;
        client := client || jsonb_build_object('needsYou',needs,'lastReceiptAt',public.system_version_ts(receipt));
      end if;
    end if;
    clients := clients || jsonb_build_array(client);
  end loop;
  return overview || jsonb_build_object('clients',clients,'queue',queue);
end; $$;

revoke all on function public.agency_client_overview_v2(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.agency_client_overview_v2(uuid,uuid,text,uuid,integer) to service_role;
commit;
