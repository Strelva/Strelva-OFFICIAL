-- Account-free routine decisions. No membership is created or elevated.
-- The link/session binds one item, recipient and revision; every real write
-- still goes through its lifecycle resolver. Env flag is off by default.
begin;
set local lock_timeout = '3s';

alter table public.strelva_service_actions drop constraint strelva_service_actions_purpose_check;
alter table public.strelva_service_actions add constraint strelva_service_actions_purpose_check
  check (purpose in ('needs_you_sync','make_real_resume','make_real_link','owner_decision_link')) not valid;
alter table public.strelva_service_actions validate constraint strelva_service_actions_purpose_check;

create table public.owner_decision_link_sessions (
  session_id uuid primary key references public.strelva_service_actions(id),
  workspace_id uuid not null references public.workspaces(id),
  decision_id uuid not null references public.owner_decisions(id),
  revision_hash text not null check (revision_hash ~ '^[a-f0-9]{64}$'),
  recipient text not null,
  website_revision integer,
  website_hash text,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.owner_decision_link_sessions enable row level security;
revoke all on public.owner_decision_link_sessions from public, anon, authenticated, service_role;
create trigger owner_decision_link_sessions_immutable before update or delete on public.owner_decision_link_sessions
  for each row execute function public.strelva_service_actions_immutable();

create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path=public,pg_temp as $$
  select array['owner_entry','inquiries','website_rebuild','systems',
    'make_real_live:hosted_website','make_real_live:tenant_content','make_real_live:inquiry_form',
    'make_real_live:booking_page','make_real_live:internal_app','connected_sites','make_real_owner_link','owner_decision_links']::text[]
$$;
revoke all on function public.workspace_release_flag_names() from public,anon,authenticated;

create function public.strelva_owner_decision_link_session(p_workspace_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; recipient jsonb; reader record; creator uuid; session_id uuid;
  document_head public.website_document_heads; document_hash text;
begin
  select * into item from public.owner_decisions where workspace_id=p_workspace_id and id=p_decision_id;
  if not found or item.state<>'open' or item.expires_at<=clock_timestamp() or item.route<>'owner_decides'
    or item.sign_in_required or item.change_kind in ('access.grant','money','exit')
    or item.revision_hash is distinct from p_revision_hash
    or item.source_lifecycle not in ('service_request','website_document','provider_delivery','standing_responsibility',
      'work_responsibility','application_release','work_plan','version_release','business_record_draft') then
    raise exception 'strelva_service_access_denied';
  end if;
  recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or nullif(lower(btrim(p_recipient)),'') is null or lower(btrim(recipient->>'email'))<>lower(btrim(p_recipient)) then
    raise exception 'owner_decision_recipient_not_owner';
  end if;
  if public.needs_you_owner_actor(p_workspace_id,p_recipient) is not null then raise exception 'strelva_service_owner_has_account'; end if;
  if not public.strelva_runs_business(p_workspace_id) then return null; end if;
  -- Creator-only lifecycles retain their real creator identity and authority.
  -- The owner approves the item; the creator is only the execution identity.
  if item.source_lifecycle='standing_responsibility' then
    select owner_id into creator from public.standing_responsibilities where id::text=item.source_id and workspace_id=p_workspace_id;
  elsif item.source_lifecycle='work_responsibility' then
    select (payload->>'ownerId')::uuid into creator from public.saved_product_work where id::text=item.source_id
      and workspace_id=p_workspace_id and product_id='operations' and resource_kind='responsibility';
  end if;
  select u.id as user_id,lower(u.email) as email,m.role into reader from public.workspace_memberships m
    join public.users u on u.id=m.user_id and u.verified_at is not null
    where m.workspace_id=p_workspace_id and m.role in ('owner','admin') and (creator is null or m.user_id=creator)
    order by case m.role when 'owner' then 0 else 1 end,m.created_at,m.user_id limit 1;
  if not found then return null; end if;
  if item.source_lifecycle='website_document' then
    select * into document_head from public.website_document_heads where website_work_id::text=split_part(item.source_id,':',1) and workspace_id=p_workspace_id;
    if not found then raise exception 'strelva_service_access_denied'; end if;
    select content_hash into document_hash from public.website_documents where website_work_id=document_head.website_work_id and revision=document_head.revision;
  end if;
  insert into public.strelva_service_actions(workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,detail)
    values(p_workspace_id,'owner_decision_link','session',reader.user_id,reader.role,'owner_decision:'||item.id,
      'Signed routine owner decision; unchanged member identity.') returning id into session_id;
  insert into public.owner_decision_link_sessions(session_id,workspace_id,decision_id,revision_hash,recipient,website_revision,website_hash)
    values(session_id,p_workspace_id,item.id,p_revision_hash,lower(btrim(p_recipient)),document_head.revision,document_hash);
  return jsonb_build_object('sessionId',session_id,'workspaceId',p_workspace_id,'purpose','owner_decision_link','label','Strelva (system)',
    'role',reader.role,'userId',reader.user_id,'verifiedEmail',reader.email,'decisionId',item.id,'revisionHash',p_revision_hash,'recipient',lower(btrim(p_recipient)));
end $$;

-- Private assertion reused by the narrow website reserve/publish RPCs. Each
-- call rechecks recipient, link claim, revision, current membership and expiry.
create function public.assert_owner_decision_link(p_workspace_id uuid,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns public.owner_decisions
language plpgsql security definer set search_path=public,pg_temp as $$
declare session_row public.strelva_service_actions; link public.owner_decision_link_sessions; item public.owner_decisions; recipient jsonb;
begin
  session_row:=public.strelva_service_session(p_workspace_id,p_session_id,'owner_decision_link');
  select * into link from public.owner_decision_link_sessions where session_id=p_session_id and workspace_id=p_workspace_id
    and decision_id=p_decision_id and revision_hash=p_revision_hash and recipient=lower(btrim(p_recipient));
  if not found then raise exception 'strelva_service_access_denied'; end if;
  select * into item from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id for update;
  if not found or item.revision_hash is distinct from p_revision_hash or item.state not in ('approved','declined')
    or item.decided_by_kind is distinct from 'owner_link' or item.decided_by is distinct from link.recipient
    or item.outcome is not null or item.sign_in_required or item.change_kind in ('access.grant','money','exit') then
    raise exception 'strelva_service_access_denied';
  end if;
  recipient:=public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or lower(btrim(recipient->>'email')) is distinct from link.recipient then raise exception 'owner_decision_recipient_not_owner'; end if;
  if not public.strelva_runs_business(p_workspace_id) or not exists(select 1 from public.workspace_memberships m
    join public.users u on u.id=m.user_id and u.verified_at is not null
    where m.workspace_id=p_workspace_id and m.user_id=session_row.on_behalf_user_id and m.role=session_row.on_behalf_role) then
    raise exception 'strelva_service_access_denied';
  end if;
  return item;
end $$;

create function public.authorize_owner_decision_link_run(p_workspace_id uuid,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions;
begin
  item:=public.assert_owner_decision_link(p_workspace_id,p_session_id,p_decision_id,p_revision_hash,p_recipient);
  -- Item lock serializes attempts even across different sessions. Once a run
  -- is recorded it cannot be retried, including when a provider accepted it.
  if exists(select 1 from public.strelva_service_actions where workspace_id=p_workspace_id and purpose='owner_decision_link'
    and action='run' and subject='owner_decision:'||item.id) then raise exception 'strelva_service_access_denied'; end if;
  insert into public.strelva_service_actions(workspace_id,purpose,action,session_id,subject,detail)
    values(p_workspace_id,'owner_decision_link','run',p_session_id,'owner_decision:'||item.id,'Owner link claimed; source resolver authorized.');
end $$;
revoke all on function public.strelva_owner_decision_link_session(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.assert_owner_decision_link(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.authorize_owner_decision_link_run(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.strelva_owner_decision_link_session(uuid,uuid,text,text) to service_role;
grant execute on function public.authorize_owner_decision_link_run(uuid,uuid,uuid,text,text) to service_role;

commit;
