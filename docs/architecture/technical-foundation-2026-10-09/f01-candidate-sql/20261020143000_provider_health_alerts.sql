-- #271: read-only provider queue context. No notifications, grants, retries or
-- source-state changes. The active provider relationship AND seat AND staff
-- AND verified agency membership must all still hold on every read.
set lock_timeout = '3s';
create function public.read_provider_health_alerts(
  p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text, p_workspace_ids uuid[]
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare allowed uuid[];
begin
  if cardinality(p_workspace_ids) > 100 or p_workspace_ids is null then raise exception 'system_input_invalid'; end if;
  if not exists(select 1 from public.workspaces where id=p_agency_workspace_id and kind='agency')
    or public.system_version_member_role(p_agency_workspace_id,p_user_id,p_verified_email) is null then
    raise exception 'business_record_access_denied';
  end if;
  select coalesce(array_agg(distinct p.customer_workspace_id),'{}') into allowed
    from public.workspace_providers p
    join public.provider_seats s on s.customer_workspace_id=p.customer_workspace_id
      and s.agency_workspace_id=p.provider_workspace_id and s.status='active'
    join public.agency_client_staff st on st.customer_workspace_id=s.customer_workspace_id
      and st.agency_workspace_id=s.agency_workspace_id and st.user_id=p_user_id and st.status='active'
    where p.provider_workspace_id=p_agency_workspace_id and p.status='active'
      and p.customer_workspace_id=any(p_workspace_ids);
  return jsonb_build_object(
    'workspaceIds', to_jsonb(allowed),
    'links',coalesce((select jsonb_agg(jsonb_build_object('workspaceId',l.workspace_id,'tenantId',t.id,'systemId',s.id))
      from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
      join public.systems s on s.business_workspace_id=l.workspace_id and s.origin_kind='tenant' and s.origin_ref=l.tenant_stable_id::text
      where l.workspace_id=any(allowed)),'[]'::jsonb),
    'alerts',coalesce((select jsonb_agg(item order by since,id) from (
      select r.id::text id,r.created_at since,jsonb_build_object('id','listing:'||r.id,'workspaceId',r.workspace_id,'systemId',null,
        'title','Google accepted '||r.action||'; read-back '||r.readback||'. Do not resend.','since',r.created_at,'label','Read-back failed') item
        from public.google_listing_receipts r where r.workspace_id=any(allowed) and r.status='posted_unverified' and r.readback in ('failed','differs')
      union all
      select d.domain,d.updated_at,jsonb_build_object('id','domain-claim:'||d.tenant_id||':'||d.domain,'workspaceId',l.workspace_id,'systemId',s.id,
        'title',d.domain||' still needs domain verification ('||d.status||').','since',d.created_at,'label','Domain verification')
        from public.domain_claims d join public.tenants t on t.id=d.tenant_id
        join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
        join public.systems s on s.business_workspace_id=l.workspace_id and s.origin_kind='tenant' and s.origin_ref=t.stable_id::text
        where l.workspace_id=any(allowed) and d.role<>'admin' and d.status<>'verified' and d.created_at<=now()-interval '7 days'
      union all
      select r.id::text,r.created_at,jsonb_build_object('id','receipt:'||r.id,'workspaceId',coalesce(r.workspace_id,l.workspace_id),'systemId',r.system_id,
        'title','Provider accepted '||r.write_kind||'; read-back '||r.readback||'. Do not resend.','since',r.created_at,'label','Read-back failed')
        from public.outside_write_receipts r left join public.tenants t on t.id=r.tenant_id
        left join public.tenant_workspace_links l on l.tenant_stable_id=coalesce(r.tenant_stable_id,t.stable_id) and r.workspace_id is null
        where coalesce(r.workspace_id,l.workspace_id)=any(allowed) and r.acceptance='accepted' and r.readback in ('failed','differs','pending','not_possible')
      union all
      select c.id::text,c.updated_at,jsonb_build_object('id','calendar:'||c.id,'workspaceId',c.workspace_id,'systemId',null,
        'title','Booking calendar needs reconnecting ('||c.status||').','since',c.updated_at,'label','Booking calendar')
        from public.workspace_calendar_connections c where c.workspace_id=any(allowed) and c.status in ('error','revoked')
          and exists(select 1 from public.systems s where s.business_workspace_id=c.workspace_id and s.kind in ('booking','bookings') and s.lifecycle='live')
      union all
      select p.website_work_id::text,coalesce(h.checked_at,p.published_at),jsonb_build_object('id','hosted:'||p.website_work_id,'workspaceId',p.workspace_id,'systemId',s.id,
        'title',case when h.status is null then 'Published website revision has no matching health check.'
          when h.checked_at<now()-interval '50 hours' or h.checked_at>now() then 'Published website revision needs a recent health check.'
          else 'Published website could not be verified ('||h.status||').' end,
        'since',coalesce(h.checked_at,p.published_at),'label','Site health',
        'gap',case when h.status is null or h.checked_at<now()-interval '50 hours' or h.checked_at>now()
          then 'A published website revision has missing or stale health evidence.' else null end)
        from public.website_document_publications p
        join public.website_documents d using(workspace_id,website_work_id,revision)
        left join lateral (select h0.* from public.website_document_health h0
          where h0.workspace_id=p.workspace_id and h0.website_work_id=p.website_work_id and h0.revision=p.revision
            and h0.content_hash=p.content_hash and h0.content_hash=d.content_hash and h0.checked_at>=p.published_at
          order by h0.checked_at desc limit 1) h on true
        left join public.systems s on s.business_workspace_id=p.workspace_id and s.origin_kind='saved_work' and s.origin_ref=p.website_work_id::text
        where p.workspace_id=any(allowed) and (h.status is null or h.status<>'healthy' or h.checked_at<now()-interval '50 hours' or h.checked_at>now())
    ) a),'[]'::jsonb));
end $$;
revoke all on function public.read_provider_health_alerts(uuid,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.read_provider_health_alerts(uuid,uuid,text,uuid[]) to service_role;
