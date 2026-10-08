-- Restore the previous owner-link implementation before adoption.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
alter function public.strelva_service_session(uuid,uuid,text) stable;
-- Pre-adoption only: serialize concurrent admission before inspecting sessions.
lock table public.owner_decision_link_sessions in access exclusive mode;
do $$ begin
  if exists(select 1 from public.owner_decision_link_sessions) then
    raise exception 'owner_decision_effects_rollback_requires_data_preservation';
  end if;
end $$;
create or replace function public.strelva_owner_decision_link_session(p_workspace_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; recipient jsonb; reader record; creator uuid; session_id uuid; provider uuid;
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
  provider := public.platform_serving_provider(p_workspace_id, public.platform_service_effect('owner_decision_link'));
  if provider is null then return null; end if;
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
  insert into public.strelva_service_actions(workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,detail,provider_workspace_id)
    values(p_workspace_id,'owner_decision_link','session',reader.user_id,reader.role,'owner_decision:'||item.id,
      'Signed routine owner decision; unchanged member identity.',provider) returning id into session_id;
  insert into public.owner_decision_link_sessions(session_id,workspace_id,decision_id,revision_hash,recipient,website_revision,website_hash)
    values(session_id,p_workspace_id,item.id,p_revision_hash,lower(btrim(p_recipient)),document_head.revision,document_hash);
  return jsonb_build_object('sessionId',session_id,'workspaceId',p_workspace_id,'purpose','owner_decision_link','label','Strelva (system)',
    'role',reader.role,'userId',reader.user_id,'verifiedEmail',reader.email,'decisionId',item.id,'revisionHash',p_revision_hash,'recipient',lower(btrim(p_recipient)),'providerWorkspaceId',provider);
end $$;

create or replace function public.assert_owner_decision_link(p_workspace_id uuid,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns public.owner_decisions
language plpgsql security definer set search_path=public,pg_temp as $$
declare session_row public.strelva_service_actions; link public.owner_decision_link_sessions; item public.owner_decisions; recipient jsonb;
begin
  session_row:=public.strelva_service_session(p_workspace_id,p_session_id,'owner_decision_link');
  select s.* into link from public.owner_decision_link_sessions s where s.session_id=p_session_id and s.workspace_id=p_workspace_id
    and s.decision_id=p_decision_id and s.revision_hash=p_revision_hash and s.recipient=lower(btrim(p_recipient));
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

create or replace function public.assert_website_owner_link(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,
  p_revision integer,p_content_hash text,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; session_row public.strelva_service_actions; link public.owner_decision_link_sessions; head public.website_document_heads;
begin
  item:=public.assert_owner_decision_link(p_workspace_id,p_session_id,p_decision_id,p_revision_hash,p_recipient);
  session_row:=public.strelva_service_session(p_workspace_id,p_session_id,'owner_decision_link');
  if session_row.on_behalf_user_id is distinct from p_user_id or item.state<>'approved' or item.source_lifecycle<>'website_document'
    or item.source_id is distinct from p_work_id::text||':launch'
    or not exists(select 1 from public.strelva_service_actions where session_id=p_session_id and action='run') then
    raise exception 'strelva_service_access_denied';
  end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  select * into link from public.owner_decision_link_sessions where session_id=p_session_id;
  select * into head from public.website_document_heads where website_work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or head.revision is distinct from p_revision or head.approved_revision is distinct from p_revision
    or head.approved_hash is distinct from p_content_hash or link.website_revision is distinct from p_revision
    or link.website_hash is distinct from p_content_hash then raise exception 'website_approval_required'; end if;
end $$;
revoke all on function public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create or replace function public.platform_service_session_holds(p_session public.strelva_service_actions) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p_session.action = 'session'
    and p_session.created_at > clock_timestamp() - interval '30 minutes'
    and public.platform_serving_provider(p_session.workspace_id, public.platform_service_effect(p_session.purpose))
      = p_session.provider_workspace_id
    and public.platform_service_identity_holds(p_session.workspace_id, p_session.provider_workspace_id,
      p_session.on_behalf_user_id, p_session.on_behalf_role), false)
$$;

create or replace function public.platform_service_effect(p_purpose text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_purpose
    when 'needs_you_sync' then 'email'
    when 'make_real_resume' then 'publish'
    when 'make_real_link' then 'publish'
    when 'owner_decision_link' then 'email' end
$$;
drop function public.strelva_owner_decision_link_session(uuid,uuid,text,text,text);
drop function public.owner_decision_provider_holds(uuid,uuid,text[]);
drop function public.owner_decision_execution_effects(text,text,text);
alter table public.owner_decision_link_sessions drop column intended_decision;
alter table public.owner_decision_link_sessions drop column provider_assignment_id;
commit;
