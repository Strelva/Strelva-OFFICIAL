-- Manual rollback; leave immutable System revisions intact. Disable Systems first.
set lock_timeout='3s';
create or replace function public.read_existing_business_systems(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare linked_tenants uuid[]; v record; ids uuid[]; work_tenants uuid[];
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  ids := v.work_ids;
  work_tenants := case when ids is null then null else public.system_scope_tenants(p_workspace_id, ids) end;
  -- The tenants this business holds now, by the same rule as managedWebsites:
  -- its tenant_workspace_links, plus an active binding only for a tenant with
  -- no link anywhere. A stale binding to a tenant linked to another business
  -- never shows that business's inquiries here.
  select coalesce(array_agg(distinct stable_id), '{}') into linked_tenants from (
    select b.tenant_stable_id as stable_id from public.offering_website_bindings b
      where b.business_workspace_id = p_workspace_id and b.status = 'active' and b.tenant_stable_id is not null
        and not exists (select 1 from public.tenant_workspace_links l2 where l2.tenant_stable_id = b.tenant_stable_id)
    union
    select tenant_stable_id from public.tenant_workspace_links
      where workspace_id = p_workspace_id and tenant_stable_id is not null
  ) t;
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'scope', case when ids is null then 'business' else 'assigned' end,
    'savedWork', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'productId', w.product_id, 'resourceKind', w.resource_kind, 'title', w.title,
        'createdAt', w.created_at, 'updatedAt', w.updated_at,
        'applicationStatus', a.lifecycle_status, 'applicationRelease', a.current_release_version,
        'customApplicationStatus', ca.lifecycle_status, 'customApplicationRelease', ca.current_release_version,
        'websiteHeadRevision', h.revision, 'websiteApprovedRevision', h.approved_revision,
        'websitePublishedRevision', p.revision, 'websitePublishedHash', p.content_hash,
        'hostedTenantStableId', coalesce(hr.tenant_stable_id, pt.stable_id), 'hostedTenantId', coalesce(hr.tenant_id, p.tenant_id),
        -- True when this work row created its own hosted tenant (native first).
        -- Otherwise the tenant came first and the System keeps its identity.
        'hostedTenantReserved', hr.website_work_id is not null,
        -- The schedule's own pause; a booking System adopted from it is Paused.
        'schedulePaused', case when w.product_id = 'scheduling' then w.payload ? 'pause' end)
        order by w.created_at, w.id)
      from public.saved_product_work w
      left join public.application_states a on a.work_id = w.id and a.workspace_id = w.workspace_id
      left join public.custom_application_states ca on ca.work_id = w.id and ca.workspace_id = w.workspace_id
      left join public.website_document_heads h on h.website_work_id = w.id and h.workspace_id = w.workspace_id
      left join public.website_document_publications p on p.website_work_id = w.id and p.workspace_id = w.workspace_id
      left join public.tenants pt on pt.id = p.tenant_id
      left join public.website_hosted_tenant_reservations hr on hr.website_work_id = w.id and hr.workspace_id = w.workspace_id
      where w.workspace_id = p_workspace_id and (ids is null or w.id = any(ids))
        and (w.product_id, w.resource_kind) in (('websites','website'),('applications','application'),
          ('custom-applications','custom-application'),('scheduling','schedule'),('inquiry','inquiry_capability'),
          ('onboarding','case'),('documents','document'),('tracker','tracker'))), '[]'::jsonb),
    -- One row per linked tenant. tenant_workspace_links is the canonical
    -- workspace<->tenant link; an active offering_website_bindings row is read
    -- only for a tenant that has no link yet.
    'managedWebsites', coalesce((select jsonb_agg(m order by m->>'linkedAt', m->>'tenantStableId') from (
        select jsonb_build_object('link', 'tenant_link', 'tenantStableId', l.tenant_stable_id,
          'tenantId', coalesce(t.id, l.tenant_slug_at_link), 'siteName', coalesce(t.site_name, l.tenant_slug_at_link),
          'tenantActive', coalesce(t.active, false), 'linkedAt', l.linked_at) as m
        from public.tenant_workspace_links l left join public.tenants t on t.stable_id = l.tenant_stable_id
        where l.workspace_id = p_workspace_id and l.tenant_stable_id is not null
          and (work_tenants is null or l.tenant_stable_id = any(work_tenants))
        union all
        select jsonb_build_object('link', 'website_binding', 'tenantStableId', b.tenant_stable_id,
          'tenantId', coalesce(t.id, b.tenant_id_at_binding), 'siteName', coalesce(t.site_name, b.site_name_at_binding),
          'tenantActive', coalesce(t.active, false), 'linkedAt', b.created_at)
        from public.offering_website_bindings b left join public.tenants t on t.stable_id = b.tenant_stable_id
        where b.business_workspace_id = p_workspace_id and b.status = 'active' and b.tenant_stable_id is not null
          and not exists (select 1 from public.tenant_workspace_links l2 where l2.tenant_stable_id = b.tenant_stable_id)
          and (work_tenants is null or b.tenant_stable_id = any(work_tenants))
      ) x), '[]'::jsonb),
    'inquiryWorkspaces', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tenantStableId', i.tenant_stable_id,
        'businessId', i.business_id, 'createdAt', i.created_at, 'updatedAt', i.updated_at) order by i.created_at, i.id)
      from public.inquiry_workspaces i where ids is null and i.tenant_stable_id = any(linked_tenants)), '[]'::jsonb),
    'bookingGrants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'tenantStableId', g.tenant_stable_id,
        'workId', g.work_id, 'displayName', g.display_name, 'provider', g.provider, 'status', g.status)
        order by g.published_at, g.id)
      from public.public_website_booking_grants g where g.business_workspace_id = p_workspace_id
        and (ids is null or g.work_id = any(ids))), '[]'::jsonb),
    'calendarConnections', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'provider', c.provider,
        'calendarName', c.calendar_name, 'status', c.status) order by c.created_at, c.id)
      from public.workspace_calendar_connections c where c.workspace_id = p_workspace_id and ids is null), '[]'::jsonb));
end;
$$;
create or replace function public.observe_tenant_content(p_tenant_id text, p_version_ref text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; s record; n integer := 0;
begin
  if p_tenant_id is null or p_version_ref is null or char_length(p_version_ref) not between 1 and 200 then
    raise exception 'system_possibility_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return 0; end if;
  for s in select id, business_workspace_id from public.systems
      where origin_kind = 'tenant' and origin_ref = v_stable::text and kind = 'website' and current_revision_id is not null loop
    if public.observe_system_revision(s.business_workspace_id, s.id,
        jsonb_build_object('kind', 'tenant_content', 'ref', v_stable::text || '@' || p_version_ref),
        'Website content changed.') = 'observed' then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
drop function public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean);
drop function public.append_website_system_release(uuid,uuid,text,jsonb,text,uuid,timestamptz);
drop function public.website_rebuild_connected_origin(uuid,uuid);
drop table public.website_rebuild_origins;
