-- Native publishing uses workspace targets, the existing event approvals and receipt ledgers.
begin;
set local lock_timeout = '2s';
create table public.workspace_collection_entries (
  workspace_id uuid not null references public.workspaces(id),
  system_id uuid not null,
  type text not null check (type in ('blog','video','product')),
  slug text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  status text not null check (status in ('draft','published')),
  data jsonb not null check (jsonb_typeof(data)='object' and octet_length(data::text)<=14000),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,system_id,type,slug)
);
alter table public.workspace_collection_entries enable row level security;
revoke all on public.workspace_collection_entries from public,anon,authenticated,service_role;

create function public.native_publishing_require_system(p_workspace_id uuid,p_system_id uuid,p_kind text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer') then raise exception 'publishing_business_required'; end if;
  if not exists(select 1 from public.systems where business_workspace_id=p_workspace_id and id=p_system_id and kind=p_kind)
    and not (p_kind='website' and exists(select 1 from public.saved_product_work w where w.workspace_id=p_workspace_id and w.product_id='websites' and w.resource_kind='website'
      and public.system_origin_id(p_workspace_id,'saved_work',w.id::text)=p_system_id))
    and not (p_kind='website' and exists(select 1 from public.connected_sites c where c.business_workspace_id=p_workspace_id
      and public.system_origin_id(p_workspace_id,'connected_site',c.id::text)=p_system_id)) then raise exception 'publishing_system_not_owned'; end if;
end; $$;

create function public.read_native_workspace_collection(p_workspace_id uuid,p_system_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.native_publishing_require_system(p_workspace_id,p_system_id,'website');
  return coalesce((select jsonb_agg(to_jsonb(r)) from (select type,slug,status,data from public.workspace_collection_entries
    where workspace_id=p_workspace_id and system_id=p_system_id order by updated_at desc limit 300) r),'[]');
end; $$;

create function public.publish_native_workspace_collection(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_workspace uuid := (p_input->>'workspaceId')::uuid; v_system uuid := (p_input->>'systemId')::uuid;
  v_scope text := 'workspace-'||v_workspace; v_type text := p_input->>'type'; v_slug text := p_input->>'slug';
  v_status text := coalesce(p_input->>'status','published'); v_key text := 'workspace-collection:'||(p_input->>'eventId');
  v_current public.workspace_collection_entries%rowtype; v_baseline jsonb; v_receipt jsonb;
begin
  perform public.native_publishing_require_system(v_workspace,v_system,'website');
  if p_input->>'tenantId' is distinct from v_scope then raise exception 'publishing_scope_invalid'; end if;
  if v_status not in ('draft','published') or v_type not in ('blog','video','product') or v_slug !~ '^[a-z0-9-]{1,80}$'
    or jsonb_typeof(p_input->'data')<>'object' or octet_length((p_input->'data')::text)>14000 then raise exception 'publishing_entry_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('native-collection:'||v_workspace||':'||v_system||':'||v_type||':'||v_slug,0));
  select public.outside_write_receipt_row(id) into v_receipt from public.outside_write_receipts where command_key=v_key;
  if found then
    if v_receipt->>'workspaceId' is distinct from v_workspace::text or v_receipt->>'systemId' is distinct from v_system::text
      or v_receipt->'request'->>'draftHash' is distinct from p_input->>'draftHash' or v_receipt->>'tenantId' is not null then raise exception 'publishing_receipt_conflict'; end if;
    return jsonb_build_object('receiptId',v_receipt->>'id','verified',true);
  end if;
  if public.workspace_exit_completed(v_workspace) or exists(select 1 from public.systems where id=v_system and lifecycle='paused')
    or exists(select 1 from public.connected_sites c where c.business_workspace_id=v_workspace and c.status='revoked'
      and public.system_origin_id(v_workspace,'connected_site',c.id::text)=v_system) then raise exception 'publishing_paused'; end if;
  select * into v_current from public.workspace_collection_entries where workspace_id=v_workspace and system_id=v_system and type=v_type and slug=v_slug for update;
  v_baseline := case when found then jsonb_build_object('status',v_current.status,'data',v_current.data) else 'null'::jsonb end;
  if v_baseline is distinct from p_input->'before' then raise exception 'publishing_baseline_changed'; end if;
  insert into public.workspace_collection_entries(workspace_id,system_id,type,slug,status,data) values(v_workspace,v_system,v_type,v_slug,v_status,p_input->'data')
    on conflict(workspace_id,system_id,type,slug) do update set status=excluded.status,data=excluded.data,updated_at=clock_timestamp();
  v_receipt := public.record_outside_write_receipt(jsonb_build_object('commandKey',v_key,'workspaceId',v_workspace,'systemId',v_system,
    'provider','strelva_content','writeKind','content_publish','subject',case when v_status='published' then 'Published ' else 'Unpublished ' end||v_type||': '||v_slug,
    'request',jsonb_build_object('type',v_type,'slug',v_slug,'data',p_input->'data','status',v_status,'draftHash',p_input->>'draftHash','approvalRef',p_input->>'eventId'),
    'beforeState',v_baseline,'acceptance','accepted','providerRef','/api/workspace/publishing/content?workspaceId='||v_workspace||'&systemId='||v_system,
    'readback','matched','readbackDetail','Workspace content snapshot saved. External website rendering has not been checked.',
    'undo','not_available','undoLabel','Restore or unpublish through a new approval.','actor',p_input->>'actor'));
  return jsonb_build_object('receiptId',v_receipt->>'id','verified',true);
end; $$;

create function public.read_native_workspace_collection_receipts(p_workspace_id uuid,p_system_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.native_publishing_require_system(p_workspace_id,p_system_id,'website');
  return coalesce((select jsonb_agg(public.outside_write_receipt_row(r.id) order by r.created_at desc) from
    (select id,created_at from public.outside_write_receipts where workspace_id=p_workspace_id and system_id=p_system_id and tenant_id is null
      and command_key like 'workspace-collection:%' order by created_at desc limit 100) r),'[]');
end; $$;

alter table public.workspace_newsletter_issues alter column tenant_id drop not null;
-- Retain the integrated sender implementation under a private helper. Its
-- audience, unsubscribe and mail gates are tenant-only. Native approval must
-- never enter its bounded queue or acquire a delivery claim.
alter function public.workspace_newsletter_sender(text,uuid,jsonb) rename to workspace_newsletter_sender_legacy_target;
revoke all on function public.workspace_newsletter_sender_legacy_target(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.workspace_newsletter_sender(p_action text,p_id uuid default null,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_action='list' then
    return coalesce((select jsonb_agg(id) from (select n.id from public.workspace_newsletter_issues n
      where n.tenant_id is not null
      and not public.workspace_exit_completed(n.workspace_id)
      and not exists(select 1 from public.systems s where s.id=n.system_id and s.lifecycle='paused')
      and (not exists(select 1 from public.workspace_newsletter_deliveries d where d.issue_id=n.id)
        or exists(select 1 from public.workspace_newsletter_batches x where x.issue_id=n.id
          and (x.state='pending' or x.state='gated' and x.next_attempt_at<=clock_timestamp() or x.state='claimed' and x.claim_until<=clock_timestamp())))
      order by n.approved_at,n.id limit 20) q),'[]');
  elsif p_action='claim' and exists(select 1 from public.workspace_newsletter_issues where id=p_id and tenant_id is null) then
    return null;
  elsif p_action='begin' and exists(select 1 from public.workspace_newsletter_batches b join public.workspace_newsletter_issues i on i.id=b.issue_id where b.id=p_id and i.tenant_id is null) then
    return null;
  end if;
  return public.workspace_newsletter_sender_legacy_target(p_action,p_id,p_input);
end; $$;
revoke all on function public.workspace_newsletter_sender(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_newsletter_sender(text,uuid,jsonb) to service_role;

create function public.approve_native_workspace_newsletter_issue(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.workspace_newsletter_issues%rowtype; v_workspace uuid := (p_input->>'workspaceId')::uuid; v_system uuid := (p_input->>'systemId')::uuid;
begin
  perform public.native_publishing_require_system(v_workspace,v_system,'newsletter');
  if p_input->>'tenantId' is distinct from 'workspace-'||v_workspace then raise exception 'publishing_scope_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsletter-issue:'||(p_input->>'eventId'),0));
  select * into v_row from public.workspace_newsletter_issues where event_id=p_input->>'eventId';
  if found then
    if v_row.workspace_id<>v_workspace or v_row.system_id<>v_system or v_row.tenant_id is not null or v_row.draft_hash is distinct from p_input->>'draftHash'
      or v_row.subject is distinct from p_input->>'subject' or v_row.body is distinct from p_input->>'body' then raise exception 'newsletter_issue_conflict'; end if;
  else
    if public.workspace_exit_completed(v_workspace) or exists(select 1 from public.systems where id=v_system and lifecycle='paused') then raise exception 'publishing_paused'; end if;
    insert into public.workspace_newsletter_issues(workspace_id,system_id,event_id,draft_hash,subject,body,approved_by,suppressed_count)
      values(v_workspace,v_system,p_input->>'eventId',p_input->>'draftHash',p_input->>'subject',p_input->>'body',p_input->>'actor',0) returning * into v_row;
  end if;
  return jsonb_build_object('receiptId',v_row.id,'verified',true);
end; $$;
create function public.read_native_workspace_newsletter_issues(p_workspace_id uuid,p_system_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.native_publishing_require_system(p_workspace_id,p_system_id,'newsletter');
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.approved_at desc) from
    (select * from public.workspace_newsletter_issues where workspace_id=p_workspace_id and system_id=p_system_id and tenant_id is null order by approved_at desc limit 100) r),'[]');
end; $$;
create function public.read_native_workspace_google_binding(p_workspace_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select public.account_binding_json(b,true) from public.workspace_account_bindings b join public.workspaces w on w.id=b.workspace_id
    where b.workspace_id=p_workspace_id and w.kind='customer' and b.provider='google' and b.origin_tenant_stable_id is null;
$$;
revoke all on function public.native_publishing_require_system(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.read_native_workspace_collection(uuid,uuid),public.publish_native_workspace_collection(jsonb),public.read_native_workspace_collection_receipts(uuid,uuid),public.approve_native_workspace_newsletter_issue(jsonb),public.read_native_workspace_newsletter_issues(uuid,uuid),public.read_native_workspace_google_binding(uuid) from public,anon,authenticated;
grant execute on function public.read_native_workspace_collection(uuid,uuid),public.publish_native_workspace_collection(jsonb),public.read_native_workspace_collection_receipts(uuid,uuid),public.approve_native_workspace_newsletter_issue(jsonb),public.read_native_workspace_newsletter_issues(uuid,uuid),public.read_native_workspace_google_binding(uuid) to service_role;
commit;
