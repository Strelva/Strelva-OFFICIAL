-- #560: authorization follows the bound source action, never email transport.
-- Local preparation only; activation and production migration need approval.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

-- This write-authority entry point now takes revocation locks through its
-- session predicate. It must use the caller's read/write transaction snapshot.
alter function public.strelva_service_session(uuid,uuid,text) volatile;

-- Existing sessions have no assignment binding and fail closed; never infer
-- new authority for an old link after an agency relationship changes.
alter table public.owner_decision_link_sessions add column provider_assignment_id uuid references public.workspace_providers(id);

alter table public.owner_decision_link_sessions add column intended_decision text not null default 'approve'
  check (intended_decision in ('approve','not_yet'));

-- Owner decisions have no universal effect. Only the bound source resolves it;
-- generic service admission cannot substitute email for execution authority.
create or replace function public.platform_service_effect(p_purpose text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select case p_purpose when 'needs_you_sync' then 'email'
    when 'make_real_resume' then 'publish' when 'make_real_link' then 'publish' end
$$;

-- Empty means an internal approval. Unknown or ambiguous source actions fail
-- closed; a kind cannot relabel publication as an internal fact confirmation.
create function public.owner_decision_execution_effects(p_kind text,p_lifecycle text,p_source_id text) returns text[]
language plpgsql immutable set search_path=public,pg_temp as $$
declare stage text:=split_part(p_source_id,':',2);
begin
  if p_lifecycle is null or p_lifecycle not in ('service_request','website_document','provider_delivery','standing_responsibility',
    'work_responsibility','application_release','work_plan','version_release','business_record_draft')
    or nullif(btrim(p_source_id),'') is null then raise exception 'owner_decision_effect_unknown'; end if;
  if p_kind in ('access.grant','money','exit','suggestion','health.owner_action') then
    raise exception 'strelva_service_access_denied';
  end if;
  if p_lifecycle='website_document' then
    if stage='launch' and p_kind in ('system.go_live','system.change_live','copy.routine','copy.marketing','structure','system.pause','health.fix','verify.failed') then
      return array['publish']::text[];
    elsif stage='approve' and p_kind in ('system.go_live','system.change_live') then
      return '{}'::text[];
    elsif (stage like 'fact.%' or stage like 'copy.%') and p_kind in ('fact.owner_stated','fact.inferred') then
      return '{}'::text[];
    end if;
    raise exception 'owner_decision_effect_unknown';
  elsif p_lifecycle in ('application_release','version_release') then
    if p_kind not in ('system.go_live','system.change_live','system.pause','health.fix','verify.failed')
      or (p_lifecycle='application_release' and (split_part(p_source_id,':',1) not in ('native','custom') or stage='')) then
      raise exception 'owner_decision_effect_unknown';
    end if;
    return array['publish']::text[];
  end if;
  if p_kind in ('system.pause','health.fix','verify.failed') then raise exception 'owner_decision_effect_unknown'; end if;
  if p_kind in ('system.go_live','system.change_live','copy.routine','copy.marketing','structure') then return array['publish']::text[]; end if;
  if p_kind in ('google.post','google.photo','review.reply','review.reply_critical') then return array['google']::text[]; end if;
  if p_kind in ('customer.message','customer.commitment','customer.broadcast') then return array['email']::text[]; end if;
  if p_kind in ('fact.owner_stated','fact.inferred','request.scope','running.approve') then return '{}'::text[]; end if;
  raise exception 'owner_decision_effect_unknown';
end $$;
revoke all on function public.owner_decision_execution_effects(text,text,text) from public,anon,authenticated,service_role;

create function public.owner_decision_provider_holds(p_workspace_id uuid,p_provider_id uuid,p_effects text[]) returns boolean
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare effect text;
begin
  if p_effects is null or p_provider_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  perform 1 from public.workspace_providers p
    join public.workspaces w on w.id=p.customer_workspace_id and w.kind='customer'
    where p.customer_workspace_id=p_workspace_id and p.provider_workspace_id=p_provider_id and p.status='active'
    for share of p,w;
  if not found then return false; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('agency-verification:'||p_provider_id::text,0));
  foreach effect in array p_effects loop
    if not public.agency_effect_allowed(p_provider_id,effect) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.owner_decision_provider_holds(uuid,uuid,text[]) from public,anon,authenticated,service_role;

create or replace function public.platform_service_session_holds(p_session public.strelva_service_actions) returns boolean
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare link public.owner_decision_link_sessions; item public.owner_decisions; effects text[];
begin
  if p_session.purpose<>'owner_decision_link' then
    return coalesce(p_session.action='session' and p_session.created_at>clock_timestamp()-interval '30 minutes'
      and public.platform_serving_provider(p_session.workspace_id,public.platform_service_effect(p_session.purpose))=p_session.provider_workspace_id
      and public.platform_service_identity_holds(p_session.workspace_id,p_session.provider_workspace_id,p_session.on_behalf_user_id,p_session.on_behalf_role),false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session.workspace_id::text,7415));
  select * into link from public.owner_decision_link_sessions where session_id=p_session.id and workspace_id=p_session.workspace_id;
  if not found or link.provider_assignment_id is null then return false; end if;
  -- Take the decision write lock first: parallel run attempts serialize here
  -- rather than deadlocking while upgrading shared locks to authorize a run.
  select * into item from public.owner_decisions where id=link.decision_id and workspace_id=link.workspace_id for update;
  if not found then return false; end if;
  perform 1 from public.workspace_providers where id=link.provider_assignment_id
    and customer_workspace_id=p_session.workspace_id and provider_workspace_id=p_session.provider_workspace_id and status='active' for share;
  if not found then return false; end if;
  -- Routine links never gain execution identity from a provider seat alone.
  perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=p_session.workspace_id and m.user_id=p_session.on_behalf_user_id
      and m.role=p_session.on_behalf_role and m.role in ('owner','admin') and u.verified_at is not null
    for share of m,u;
  if not found then return false; end if;
  if item.revision_hash is distinct from link.revision_hash or item.sign_in_required
    or item.source_lifecycle in ('application_release','version_release')
    or item.state not in ('open','approved','declined') or item.outcome is not null
    or (item.state<>'open' and item.state is distinct from (case link.intended_decision when 'approve' then 'approved' else 'declined' end)) then return false; end if;
  effects:=public.owner_decision_execution_effects(item.change_kind,item.source_lifecycle,item.source_id);
  if link.intended_decision='not_yet' then effects:='{}'::text[]; end if;
  return coalesce(p_session.action='session' and p_session.subject='owner_decision:'||item.id
    and p_session.created_at>clock_timestamp()-interval '30 minutes'
    and public.owner_decision_provider_holds(p_session.workspace_id,p_session.provider_workspace_id,effects)
    and public.platform_service_identity_holds(p_session.workspace_id,p_session.provider_workspace_id,p_session.on_behalf_user_id,p_session.on_behalf_role),false);
end $$;

create or replace function public.strelva_owner_decision_link_session(p_workspace_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text,p_decision text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; recipient jsonb; reader record; creator uuid; session_id uuid; provider uuid;
  document_head public.website_document_heads; document_hash text; effects text[]; assignment uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  select * into item from public.owner_decisions where workspace_id=p_workspace_id and id=p_decision_id for update;
  if p_decision is null or p_decision not in ('approve','not_yet') or not found or item.state<>'open' or item.expires_at<=clock_timestamp() or item.route<>'owner_decides'
    or item.sign_in_required or item.change_kind in ('access.grant','money','exit')
    or item.source_lifecycle in ('application_release','version_release')
    or item.revision_hash is distinct from p_revision_hash
    or item.source_lifecycle not in ('service_request','website_document','provider_delivery','standing_responsibility',
      'work_responsibility','application_release','work_plan','version_release','business_record_draft') then
    raise exception 'strelva_service_access_denied';
  end if;
  if to_regclass('public.business_owner_recipient_trust') is not null then
    perform 1 from public.business_owner_recipient_trust where workspace_id=p_workspace_id for share;
  end if;
  recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or nullif(lower(btrim(p_recipient)),'') is null or lower(btrim(recipient->>'email'))<>lower(btrim(p_recipient)) then
    raise exception 'owner_decision_recipient_not_owner';
  end if;
  if public.needs_you_owner_actor(p_workspace_id,p_recipient) is not null then raise exception 'strelva_service_owner_has_account'; end if;
  effects:=public.owner_decision_execution_effects(item.change_kind,item.source_lifecycle,item.source_id);
  if p_decision='not_yet' then effects:='{}'::text[]; end if;
  select id,provider_workspace_id into assignment,provider from public.workspace_providers where customer_workspace_id=p_workspace_id and status='active' for share;
  if not public.owner_decision_provider_holds(p_workspace_id,provider,effects) then return null; end if;
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
    order by case m.role when 'owner' then 0 else 1 end,m.created_at,m.user_id limit 1 for share of m,u;
  if not found then return null; end if;
  if item.source_lifecycle='website_document' then
    select * into document_head from public.website_document_heads where website_work_id::text=split_part(item.source_id,':',1) and workspace_id=p_workspace_id;
    if not found then raise exception 'strelva_service_access_denied'; end if;
    select content_hash into document_hash from public.website_documents where website_work_id=document_head.website_work_id and revision=document_head.revision;
  end if;
  insert into public.strelva_service_actions(workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,detail,provider_workspace_id)
    values(p_workspace_id,'owner_decision_link','session',reader.user_id,reader.role,'owner_decision:'||item.id,
      'Signed routine owner decision; unchanged member identity.',provider) returning id into session_id;
  insert into public.owner_decision_link_sessions(session_id,workspace_id,decision_id,revision_hash,recipient,website_revision,website_hash,intended_decision,provider_assignment_id)
    values(session_id,p_workspace_id,item.id,p_revision_hash,lower(btrim(p_recipient)),document_head.revision,document_hash,p_decision,assignment);
  return jsonb_build_object('sessionId',session_id,'workspaceId',p_workspace_id,'purpose','owner_decision_link','label','Strelva (system)',
    'role',reader.role,'userId',reader.user_id,'verifiedEmail',reader.email,'decisionId',item.id,'revisionHash',p_revision_hash,'recipient',lower(btrim(p_recipient)),'providerWorkspaceId',provider);
end $$;

create or replace function public.strelva_owner_decision_link_session(p_workspace_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.strelva_owner_decision_link_session(p_workspace_id,p_decision_id,p_revision_hash,p_recipient,'approve')
$$;
revoke all on function public.strelva_owner_decision_link_session(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.strelva_owner_decision_link_session(uuid,uuid,text,text,text) to service_role;

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
  if to_regclass('public.business_owner_recipient_trust') is not null then
    perform 1 from public.business_owner_recipient_trust where workspace_id=p_workspace_id for share;
  end if;
  recipient:=public.resolve_business_owner_recipient(p_workspace_id);
  if recipient is null or lower(btrim(recipient->>'email')) is distinct from link.recipient then raise exception 'owner_decision_recipient_not_owner'; end if;
  if not exists(select 1 from public.workspace_memberships m
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
  -- Native reserve and publish each recheck publish, even after run authorization.
  if not public.owner_decision_provider_holds(p_workspace_id,session_row.provider_workspace_id,array['publish']) then
    raise exception 'strelva_service_access_denied'; end if;
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

commit;
