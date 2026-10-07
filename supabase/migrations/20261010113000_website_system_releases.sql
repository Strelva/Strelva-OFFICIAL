-- Website release snapshots and stable connected-site rebuild lineage.
-- No provider writes, tenant changes or public contract changes. Server calls
-- are gated by STRELVA_SYSTEMS_RELEASE (off by default).
begin;
set local lock_timeout = '3s';

create table public.website_rebuild_origins (
  website_work_id uuid primary key,
  workspace_id uuid not null,
  connected_site_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (website_work_id,workspace_id) references public.saved_product_work(id,workspace_id) on delete cascade,
  foreign key (connected_site_id,workspace_id) references public.connected_sites(id,business_workspace_id) on delete restrict
);
alter table public.website_rebuild_origins enable row level security;
revoke all on public.website_rebuild_origins from public,anon,authenticated,service_role;

create function public.website_rebuild_connected_origin(p_workspace_id uuid,p_work_id uuid) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    (select connected_site_id from public.website_rebuild_origins where workspace_id=p_workspace_id and website_work_id=p_work_id),
    (select c.id from public.saved_product_work w join public.connected_sites c
      on c.business_workspace_id=w.workspace_id
      and c.site_host=lower(regexp_replace(split_part(split_part(coalesce(w.input->'intake'->>'url',w.input->>'url'),'://',2),'/',1), ':[0-9]+$', ''))
      where w.workspace_id=p_workspace_id and w.id=p_work_id and w.product_id='websites' and w.resource_kind='website'
        and c.verified_at is not null and c.status='active'
        and not exists(select 1 from public.website_linked_publications l where l.website_work_id=w.id)
      order by c.created_at,c.id limit 1));
$$;
revoke all on function public.website_rebuild_connected_origin(uuid,uuid) from public,anon,authenticated,service_role;

-- Append a source receipt exactly once. Source timestamps prevent a repaired
-- older observation from moving the current pointer backwards. The System
-- row lock serializes concurrent observers and revision-number allocation.
create function public.append_website_system_release(p_workspace_id uuid,p_system_id uuid,p_release_key text,
  p_implementation jsonb,p_summary text,p_actor uuid,p_at timestamptz) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.systems; r public.system_revisions; cur public.system_revisions; command uuid;
begin
  select * into s from public.systems where id=p_system_id and business_workspace_id=p_workspace_id and kind='website' for update;
  if not found then raise exception 'system_not_found'; end if;
  command:=public.system_origin_id(p_workspace_id,'website-release',p_system_id::text||':'||p_release_key);
  if exists(select 1 from public.system_revisions where business_workspace_id=p_workspace_id and command_id=command) then return 0; end if;
  select * into cur from public.system_revisions where id=s.current_revision_id;
  insert into public.system_revisions(system_id,business_workspace_id,number,implementation,summary,command_id,command_digest,created_by,created_at)
    values(s.id,p_workspace_id,coalesce((select max(number) from public.system_revisions where system_id=s.id),0)+1,
      p_implementation,left(p_summary,500),command,encode(sha256(convert_to(p_implementation::text,'UTF8')),'hex'),p_actor,p_at) returning * into r;
  if cur.id is null or cur.summary='Adopted at conversion.' or cur.implementation->>'ref' like '%@initial'
      or r.created_at>=cur.created_at then
    update public.systems set current_revision_id=r.id,current_revision_number=r.number,
      change_number=change_number+1,updated_at=clock_timestamp() where id=s.id;
  end if;
  return 1;
end;
$$;
revoke all on function public.append_website_system_release(uuid,uuid,text,jsonb,text,uuid,timestamptz) from public,anon,authenticated,service_role;

-- Rebuild the revision projection from the immutable stores, never from a
-- caller-provided implementation. Readers may repair already-authorized
-- releases; membership/agency scope is rechecked before every source read.
create function public.reconcile_website_system_releases(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
  p_system_id uuid,p_origin_kind text,p_origin_ref text,p_content_reading boolean default false) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope record; t public.tenants; w public.saved_product_work; c public.connected_sites;
  s public.systems; cur public.system_revisions; source record; v_command uuid; adopted boolean:=false; work_ids uuid[]:='{}'; initial jsonb; n integer:=0;
  source_actor uuid; source_name text; source_live boolean; origin_id uuid;
begin
  scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,false);
  if p_origin_kind not in ('tenant','saved_work','connected_site') or p_origin_ref is null
      or p_system_id is distinct from public.system_origin_id(p_workspace_id,p_origin_kind,p_origin_ref) then raise exception 'system_not_found'; end if;
  if p_origin_kind='tenant' then
    select * into t from public.tenants where stable_id::text=p_origin_ref;
    if t.id is null or not exists(
      select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id
      union all select 1 from public.offering_website_bindings where business_workspace_id=p_workspace_id and tenant_stable_id=t.stable_id and status='active'
    ) or not public.system_in_scope(p_workspace_id,p_origin_kind,p_origin_ref,scope.work_ids) then raise exception 'system_not_found'; end if;
    select coalesce(array_agg(distinct x.website_work_id),'{}') into work_ids from (
      select p.website_work_id from public.website_document_publications p where p.workspace_id=p_workspace_id and p.tenant_id=t.id
      union all select l.website_work_id from public.website_linked_publications l where l.workspace_id=p_workspace_id and l.tenant_stable_id=t.stable_id
    ) x;
    initial:=jsonb_build_object('kind',case when t.delivery_model='platform_template' then 'platform_template'
      when p_content_reading then 'custom_repo_content' else 'custom_repo' end,'ref',t.stable_id::text||'@initial');
    source_actor:=coalesce((select linked_by from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id limit 1),p_user_id);
    source_name:=coalesce(nullif(btrim(t.site_name),''),t.id); source_live:=coalesce(t.active,false);
  elsif p_origin_kind='saved_work' then
    select * into w from public.saved_product_work where id::text=p_origin_ref and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website';
    if w.id is null or not public.system_in_scope(p_workspace_id,p_origin_kind,p_origin_ref,scope.work_ids)
      or public.website_rebuild_connected_origin(p_workspace_id,w.id) is not null then raise exception 'system_not_found'; end if;
    -- An existing tenant is the identity unless this work reserved it first.
    if exists(select 1 from public.website_linked_publications where website_work_id=w.id) then raise exception 'system_not_found'; end if;
    work_ids:=array[w.id]; initial:=jsonb_build_object('kind','website_document','ref',w.id::text||'@initial');
    source_actor:=w.created_by; source_name:=w.title; source_live:=false;
  else
    if scope.work_ids is not null then raise exception 'system_not_found'; end if;
    select * into c from public.connected_sites where id::text=p_origin_ref and business_workspace_id=p_workspace_id;
    if c.id is null then raise exception 'system_not_found'; end if;
    select coalesce(array_agg(x.id),'{}') into work_ids from public.saved_product_work x
      where x.workspace_id=p_workspace_id and x.product_id='websites' and x.resource_kind='website'
        and public.website_rebuild_connected_origin(p_workspace_id,x.id)=c.id;
    foreach origin_id in array work_ids loop
      insert into public.website_rebuild_origins(website_work_id,workspace_id,connected_site_id)
        values(origin_id,p_workspace_id,c.id) on conflict(website_work_id) do nothing;
    end loop;
    initial:=jsonb_build_object('kind','connected_site','ref',c.id::text||'@initial');
    source_actor:=c.created_by; source_name:=c.label; source_live:=c.verified_at is not null and c.status='active';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('website-releases:'||p_system_id::text,7419));
  select * into s from public.systems where id=p_system_id;
  if not found then
    v_command:=public.system_origin_id(p_workspace_id,'website-adopt',p_system_id::text);
    insert into public.systems(id,business_workspace_id,name,kind,lifecycle,origin_kind,origin_ref,command_id,command_digest,created_by,updated_by)
      values(p_system_id,p_workspace_id,left(source_name,160),'website','draft',p_origin_kind,p_origin_ref,v_command,
        encode(sha256(convert_to(initial::text,'UTF8')),'hex'),source_actor,source_actor);
    n:=public.append_website_system_release(p_workspace_id,p_system_id,'initial',initial,'Adopted website implementation.',source_actor,
      coalesce(w.created_at,c.created_at,clock_timestamp()));
    adopted:=true;
    if source_live then
      update public.systems set lifecycle='live',change_number=change_number+1 where id=p_system_id;
    elsif t.id is not null then
      update public.systems set lifecycle='live',change_number=change_number+1 where id=p_system_id;
      update public.systems set lifecycle='paused',change_number=change_number+1 where id=p_system_id;
    end if;
  end if;
  select * into cur from public.system_revisions where id=(select current_revision_id from public.systems where id=p_system_id);
  if cur.implementation->>'kind'='tenant_content' then
    n:=n+public.append_website_system_release(p_workspace_id,p_system_id,'implementation-baseline',
      initial,'Recorded the website implementation kind.',source_actor,cur.created_at);
  end if;
  if t.id is not null and to_regclass('public.content_versions') is not null then
    for source in execute 'select id::text,created_at,data,section from public.content_versions where tenant_id=$1 order by created_at,id' using t.id loop
      n:=n+public.append_website_system_release(p_workspace_id,p_system_id,'content:'||source.id,
        jsonb_build_object('kind',case when t.delivery_model='platform_template' then 'platform_template' else 'custom_repo_content' end,
          'ref',t.stable_id::text||'@'||source.id,'contentHash',encode(sha256(convert_to(source.data::text,'UTF8')),'hex')),
        'Published website content: '||source.section,source_actor,source.created_at);
    end loop;
  end if;
  for source in
    select r.id::text as release_key,r.created_at as at,d.created_by as actor,
      jsonb_build_object('kind','website_document','ref',r.website_work_id::text||'@'||r.revision::text,'contentHash',d.content_hash) as implementation,
      'Published website revision '||r.revision::text as summary
      from public.website_document_receipts r join public.website_documents d using(workspace_id,website_work_id,revision)
      where r.workspace_id=p_workspace_id and r.website_work_id=any(work_ids) and r.receipt->>'status'='published'
    union all
    select r.id::text,r.recorded_at,r.recorded_by,
      jsonb_build_object('kind',case when p_content_reading then 'custom_repo_content' else 'custom_repo' end,
        'ref','deploy:'||r.id::text||'@'||r.commit_sha),
      case when r.read_back='confirmed' then 'Deployed website; live read-back confirmed.' else 'Deployed website; live read-back not confirmed.' end
      from public.website_change_receipts r where r.workspace_id=p_workspace_id and r.system_id=p_system_id and r.kind='deployed'
    union all
    select 'undo:'||u.command_id::text,u.created_at,u.restored_by,
      jsonb_build_object('kind',case when p_content_reading then 'custom_repo_content' else 'custom_repo' end,
        'ref','cutover-undo:'||u.command_id::text), 'Restored the previous website after a rebuild.'
      from public.website_cutover_undos u where u.workspace_id=p_workspace_id and u.tenant_stable_id=t.stable_id
    order by at,release_key
  loop
    n:=n+public.append_website_system_release(p_workspace_id,p_system_id,source.release_key,source.implementation,source.summary,source.actor,source.at);
  end loop;
  -- A native-first site's lifecycle follows publication only at first adoption;
  -- later pause is owner intent and must survive observation.
  if adopted and source_live=false and cardinality(work_ids)>0 then
    select * into s from public.systems where id=p_system_id;
    if s.lifecycle='draft' and exists(select 1 from public.website_document_publications where workspace_id=p_workspace_id and website_work_id=any(work_ids)) then
      update public.systems set lifecycle='live',change_number=change_number+1,updated_at=clock_timestamp() where id=s.id;
    end if;
  end if;
  return n;
end;
$$;
revoke all on function public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean) to service_role;

-- The read projection carries the same connected identity before and after launch.
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
        'connectedSiteId', public.website_rebuild_connected_origin(p_workspace_id,w.id),
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

-- Tenant content writes already call this observer behind the Systems flag.
-- Use the same immutable source key as reconciliation, so observation and
-- repair cannot mint two revisions for one publish.
create or replace function public.observe_tenant_content(p_tenant_id text,p_version_ref text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants; s record; v record; n integer:=0;
begin
  if p_tenant_id is null or p_version_ref is null or char_length(p_version_ref) not between 1 and 200 then raise exception 'system_possibility_invalid'; end if;
  select * into t from public.tenants where id=p_tenant_id;
  if t.id is null or to_regclass('public.content_versions') is null then return 0; end if;
  execute 'select id::text,created_at,data,section from public.content_versions where tenant_id=$1 and id::text=$2' into v using t.id,p_version_ref;
  if v.id is null then return 0; end if;
  for s in select x.* from public.systems x
    where x.origin_kind='tenant' and x.origin_ref=t.stable_id::text and x.kind='website'
      and not exists(select 1 from public.workspace_release_flags f where f.workspace_id=x.business_workspace_id and f.flag='systems' and f.state='off') loop
    n:=n+public.append_website_system_release(s.business_workspace_id,s.id,'content:'||v.id,
      jsonb_build_object('kind',case when t.delivery_model='platform_template' then 'platform_template' else 'custom_repo_content' end,
        'ref',t.stable_id::text||'@'||v.id,'contentHash',encode(sha256(convert_to(v.data::text,'UTF8')),'hex')),
      'Published website content: '||v.section,s.updated_by,v.created_at);
  end loop;
  return n;
end;
$$;

commit;
