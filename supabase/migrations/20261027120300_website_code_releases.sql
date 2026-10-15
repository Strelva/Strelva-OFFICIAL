-- Sites by code, owner door: an owner's own coding agent records the production
-- commit it shipped to the owner's own repo, with no agency Request. The record is
-- immutable and becomes a numbered Release on the website System, the same way a
-- deployed Request receipt does. Agencies never use this path: their deploys follow
-- an accepted Request and the owner's approval (20261027120200).
--
-- reconcile_website_system_releases is a verbatim copy of the newest definition
-- (20261010113000_website_system_releases.sql) plus one more source branch.
begin;
set local lock_timeout='3s';

create schema website_code_releases_rollback;
revoke all on schema website_code_releases_rollback from public,anon,authenticated,service_role;
create table website_code_releases_rollback.functions(signature text primary key,before_definition text,after_fingerprint text);
alter table website_code_releases_rollback.functions enable row level security;
revoke all on website_code_releases_rollback.functions from public,anon,authenticated,service_role;
insert into website_code_releases_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean)']) signature;

create table public.website_code_releases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_id uuid not null,
  tenant_stable_id uuid not null,
  request_key uuid not null,
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  deployment_url text not null check (deployment_url ~ '^https://[^\s]+$' and char_length(deployment_url) <= 500),
  read_back text not null check (read_back in ('confirmed','not_confirmed','not_checked')),
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  reported_by uuid not null references public.users(id) on delete restrict,
  reported_by_connection uuid references public.assistant_connections(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, request_key)
);
create index website_code_releases_system_idx on public.website_code_releases(workspace_id, system_id, recorded_at desc);
alter table public.website_code_releases enable row level security;
revoke all on public.website_code_releases from public,anon,authenticated,service_role;
create trigger website_code_release_immutable_trg before update or delete on public.website_code_releases
  for each row execute function public.website_document_immutable();

-- The owner's own site behind a System: linked to this business, and the System id it derives.
create function public.website_code_release_site(p_workspace_id uuid, p_system_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare site record;
begin
  select t.id, t.stable_id into site from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
    where l.workspace_id=p_workspace_id and public.system_origin_id(p_workspace_id,'tenant',t.stable_id::text)=p_system_id limit 1;
  if site.id is null then raise exception 'system_not_found'; end if;
  return jsonb_build_object('tenantId',site.id,'tenantStableId',site.stable_id);
end $$;
revoke all on function public.website_code_release_site(uuid,uuid) from public,anon,authenticated,service_role;

-- Which tenant a release would be for, so the app can check that site's live commit first.
create function public.agent_website_code_release_target(p_token_hash text,p_resource text,p_workspace_id uuid,p_system_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens;
begin
  t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:code',p_workspace_id);
  if t.agency_id is not null then raise exception 'website_change_operator_required'; end if;
  return public.website_code_release_site(t.workspace_id,p_system_id);
end $$;

create function public.agent_record_website_code_release(p_token_hash text,p_resource text,p_workspace_id uuid,p_system_id uuid,p_request_key uuid,
  p_commit_sha text,p_deployment_url text,p_read_back text,p_summary text) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; site jsonb; saved public.website_code_releases; sha text:=lower(btrim(coalesce(p_commit_sha,'')));
begin
  t:=public.lock_agent_oauth_token(p_token_hash,p_resource,'website:code',p_workspace_id);
  if t.agency_id is not null then raise exception 'website_change_operator_required'; end if;
  site:=public.website_code_release_site(t.workspace_id,p_system_id);
  if p_request_key is null then raise exception 'website_release_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('website-code-release:'||t.workspace_id::text||':'||p_request_key::text,7420));
  select * into saved from public.website_code_releases where workspace_id=t.workspace_id and request_key=p_request_key;
  if found then
    if saved.system_id<>p_system_id or saved.commit_sha<>sha or saved.deployment_url<>coalesce(p_deployment_url,'') or saved.summary<>btrim(coalesce(p_summary,'')) then
      raise exception 'website_release_conflict';
    end if;
  else
    insert into public.website_code_releases(workspace_id,system_id,tenant_stable_id,request_key,commit_sha,deployment_url,read_back,summary,reported_by,reported_by_connection)
      values(t.workspace_id,p_system_id,(site->>'tenantStableId')::uuid,p_request_key,sha,p_deployment_url,p_read_back,btrim(coalesce(p_summary,'')),t.user_id,t.connection_id)
      returning * into saved;
  end if;
  return jsonb_build_object('id',saved.id,'systemId',saved.system_id,'commitSha',saved.commit_sha,'deploymentUrl',saved.deployment_url,
    'readBack',saved.read_back,'summary',saved.summary,'recordedAt',saved.recorded_at);
exception when check_violation then raise exception 'website_release_invalid';
end $$;

revoke all on function public.agent_website_code_release_target(text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.agent_record_website_code_release(text,text,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.agent_website_code_release_target(text,text,uuid,uuid) to service_role;
grant execute on function public.agent_record_website_code_release(text,text,uuid,uuid,uuid,text,text,text,text) to service_role;

create or replace function public.reconcile_website_system_releases(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
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
    -- Alias cr: c is already the connected-site variable above.
    select 'code:'||cr.id::text,cr.recorded_at,cr.reported_by,
      jsonb_build_object('kind',case when p_content_reading then 'custom_repo_content' else 'custom_repo' end,
        'ref','code:'||cr.id::text||'@'||cr.commit_sha),
      case when cr.read_back='confirmed' then 'Released website code; live read-back confirmed.' else 'Released website code; live read-back not confirmed.' end
      from public.website_code_releases cr where cr.workspace_id=p_workspace_id and cr.system_id=p_system_id
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

update website_code_releases_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=to_regprocedure(s.signature);
notify pgrst,'reload schema';
commit;
