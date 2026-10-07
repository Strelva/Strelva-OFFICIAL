-- Additive publishing outputs. Approvals stay in tenant events / owner_decisions.
begin;
set local lock_timeout = '2s';

create table public.workspace_newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  tenant_id text not null references public.tenants(id),
  system_id uuid not null,
  event_id text not null unique,
  draft_hash text not null check (draft_hash ~ '^[a-f0-9]{64}$'),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) between 1 and 12000),
  approved_by text not null check (char_length(approved_by) between 1 and 200),
  approved_at timestamptz not null default clock_timestamp(),
  state text not null default 'approved_sending_paused' check (state = 'approved_sending_paused'),
  accepted_count integer not null default 0 check (accepted_count = 0),
  suppressed_count integer not null check (suppressed_count >= 0),
  failure_count integer not null default 0 check (failure_count = 0)
);
create index workspace_newsletter_issues_business_idx on public.workspace_newsletter_issues(workspace_id, approved_at desc);
alter table public.workspace_newsletter_issues enable row level security;
revoke all on public.workspace_newsletter_issues from public, anon, authenticated;

create function public.workspace_newsletter_issue_immutable() returns trigger language plpgsql as $$
begin raise exception 'newsletter_issue_is_immutable'; end; $$;
create trigger workspace_newsletter_issue_immutable before update or delete on public.workspace_newsletter_issues
for each row execute function public.workspace_newsletter_issue_immutable();

create function public.publishing_require_tenant(p_workspace_id uuid, p_tenant_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
    where l.workspace_id=p_workspace_id and t.id=p_tenant_id) then raise exception 'publishing_tenant_not_linked'; end if;
  if exists (select 1 from public.workspaces where id=p_workspace_id and kind<>'customer') then raise exception 'publishing_business_required'; end if;
end; $$;

create function public.approve_workspace_newsletter_issue(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.workspace_newsletter_issues%rowtype; v_workspace uuid := (p_input->>'workspaceId')::uuid;
begin
  perform public.publishing_require_tenant(v_workspace, p_input->>'tenantId');
  if public.workspace_exit_completed(v_workspace) or exists(select 1 from public.systems where id=(p_input->>'systemId')::uuid and lifecycle='paused') then raise exception 'publishing_paused'; end if;
  perform pg_advisory_xact_lock(hashtextextended('newsletter-issue:' || (p_input->>'eventId'),0));
  select * into v_row from public.workspace_newsletter_issues where event_id=p_input->>'eventId';
  if found then
    if v_row.workspace_id<>v_workspace or v_row.tenant_id<>p_input->>'tenantId' or v_row.system_id<>(p_input->>'systemId')::uuid
      or v_row.draft_hash<>p_input->>'draftHash' or v_row.subject<>p_input->>'subject' or v_row.body<>p_input->>'body' then
      raise exception 'newsletter_issue_conflict'; end if;
  else
    insert into public.workspace_newsletter_issues(workspace_id,tenant_id,system_id,event_id,draft_hash,subject,body,approved_by,suppressed_count)
      values(v_workspace,p_input->>'tenantId',(p_input->>'systemId')::uuid,p_input->>'eventId',p_input->>'draftHash',p_input->>'subject',p_input->>'body',p_input->>'actor',(select count(*) from public.newsletter_subscribers where tenant_id=p_input->>'tenantId' and status='active')) returning * into v_row;
  end if;
  return jsonb_build_object('receiptId',v_row.id,'verified',true);
end; $$;

create function public.read_workspace_newsletter_issues(p_workspace_id uuid,p_tenant_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.publishing_require_tenant(p_workspace_id,p_tenant_id);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.approved_at desc) from
    (select * from public.workspace_newsletter_issues where workspace_id=p_workspace_id and tenant_id=p_tenant_id order by approved_at desc limit 100) r),'[]'::jsonb);
end; $$;

-- The live collection and its accepted receipt commit together. Existing direct
-- tenant writes lock the same entry row; compare the baseline after taking it.
create function public.publish_workspace_collection(p_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace uuid := (p_input->>'workspaceId')::uuid;
  v_tenant text := p_input->>'tenantId'; v_type text := p_input->>'type'; v_slug text := p_input->>'slug';
  v_key text := 'workspace-collection:' || (p_input->>'eventId');
  v_current public.collection_entries%rowtype; v_receipt jsonb; v_baseline jsonb;
begin
  perform public.publishing_require_tenant(v_workspace,v_tenant);
  if public.workspace_exit_completed(v_workspace) or exists(select 1 from public.systems where id=(p_input->>'systemId')::uuid and lifecycle='paused') then raise exception 'publishing_paused'; end if;
  if v_type not in ('blog','video','product') or v_slug !~ '^[a-z0-9-]{1,80}$' or jsonb_typeof(p_input->'data')<>'object'
    or octet_length((p_input->'data')::text)>14000 then raise exception 'publishing_entry_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('collection:'||v_tenant||':'||v_type||':'||v_slug,0));
  select public.outside_write_receipt_row(id) into v_receipt from public.outside_write_receipts where command_key=v_key;
  if found then
    if v_receipt->>'workspaceId'<>v_workspace::text or v_receipt->>'tenantId'<>v_tenant or v_receipt->'request'->>'draftHash'<>p_input->>'draftHash' then
      raise exception 'publishing_receipt_conflict'; end if;
    return jsonb_build_object('receiptId',v_receipt->>'id','verified',true);
  end if;
  select * into v_current from public.collection_entries where tenant_id=v_tenant and type=v_type and slug=v_slug for update;
  v_baseline := case when found then jsonb_build_object('status',v_current.status,'data',v_current.data) else 'null'::jsonb end;
  if v_baseline is distinct from p_input->'before' then raise exception 'publishing_baseline_changed'; end if;
  if v_current.id is null then
    -- A concurrent legacy insert wins and aborts this transaction rather than
    -- being overwritten by an upsert after an empty baseline read.
    insert into public.collection_entries(tenant_id,type,slug,status,data) values(v_tenant,v_type,v_slug,'published',p_input->'data');
  else
    update public.collection_entries set status='published',data=p_input->'data',updated_at=clock_timestamp() where id=v_current.id;
  end if;
  v_receipt := public.record_outside_write_receipt(jsonb_build_object(
    'commandKey',v_key,'tenantId',v_tenant,'workspaceId',v_workspace,'systemId',p_input->>'systemId',
    'provider','strelva_content','writeKind','content_publish','subject','Published '||v_type||': '||v_slug,
    'request',jsonb_build_object('type',v_type,'slug',v_slug,'data',p_input->'data','draftHash',p_input->>'draftHash','approvalRef',p_input->>'eventId'),
    'beforeState',v_baseline,'acceptance','accepted','providerRef','/api/v1/collections/'||v_tenant||'/'||v_type||'/'||v_slug,
    'readback','matched','readbackDetail','Published collection snapshot saved in the website content store. Live site rendering has not been checked.',
    'undo','not_available','undoLabel','Prepare a new approval to restore the prior entry.','actor',p_input->>'actor'));
  return jsonb_build_object('receiptId',v_receipt->>'id','verified',true);
end; $$;

create function public.read_workspace_collection_receipts(p_workspace_id uuid,p_tenant_id text,p_system_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.publishing_require_tenant(p_workspace_id,p_tenant_id);
  return coalesce((select jsonb_agg(public.outside_write_receipt_row(r.id) order by r.created_at desc) from
    (select id,created_at from public.outside_write_receipts where workspace_id=p_workspace_id and tenant_id=p_tenant_id and system_id=p_system_id
      and command_key like 'workspace-collection:%' order by created_at desc limit 100) r),'[]'::jsonb);
end; $$;

revoke all on function public.publishing_require_tenant(uuid,text),public.approve_workspace_newsletter_issue(jsonb),public.read_workspace_newsletter_issues(uuid,text),public.publish_workspace_collection(jsonb),public.workspace_newsletter_issue_immutable(),public.read_workspace_collection_receipts(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.approve_workspace_newsletter_issue(jsonb),public.read_workspace_newsletter_issues(uuid,text),public.publish_workspace_collection(jsonb),public.read_workspace_collection_receipts(uuid,text,uuid) to service_role;
commit;
