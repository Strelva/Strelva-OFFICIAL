-- Website-derived suggestions are owner decisions, never accepted facts.
-- Local preparation only. All RPCs remain service-role-only and app gated.
begin;
set local lock_timeout = '3s';
create table public.inquiry_business_fact_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  fact_key text not null,
  fact_value jsonb not null,
  baseline jsonb,
  provenance text not null check (char_length(provenance) between 1 and 2200),
  revision_hash text not null check (revision_hash ~ '^[a-f0-9]{64}$'),
  proposed_by uuid not null references public.users(id) on delete restrict,
  decision_id uuid references public.owner_decisions(id) on delete restrict,
  state text not null default 'pending' check (state in ('pending','confirmed','superseded')),
  created_at timestamptz not null default clock_timestamp(),
  check (public.business_record_fact_valid(fact_key, fact_value))
);
create unique index inquiry_business_fact_one_pending on public.inquiry_business_fact_proposals(workspace_id,fact_key) where state='pending';
alter table public.inquiry_business_fact_proposals enable row level security;
revoke all on public.inquiry_business_fact_proposals from public, anon, authenticated, service_role;

create function public.stage_inquiry_business_fact(p_workspace_id uuid,p_user_id uuid,p_key text,p_value jsonb,p_provenance text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare email text; prior public.inquiry_business_fact_proposals%rowtype; base jsonb; created uuid; hash text;
begin
  select lower(u.email) into email from public.users u where u.id=p_user_id and u.verified_at is not null;
  perform public.business_record_assert_actor(p_workspace_id,p_user_id,email,true);
  if p_key not in ('display_name','links') or not public.business_record_fact_valid(p_key,p_value)
    or p_provenance is null or char_length(p_provenance) not between 1 and 2200 then raise exception 'inquiry_fact_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('inquiry-fact:'||p_workspace_id::text||':'||p_key,0));
  base:=public.business_record_entity_state(p_workspace_id,'fact',p_key);
  if p_key='links' then
    p_value:=coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(base->'value','[]'::jsonb)) where value->>'kind'<>'website'),'[]'::jsonb)||p_value;
  end if;
  -- A page read never overwrites any current detail or a pending owner's edit.
  if base->'value'=p_value then return null; end if;
  select * into prior from public.inquiry_business_fact_proposals where workspace_id=p_workspace_id and fact_key=p_key and state='pending' for update;
  if prior.id is not null and prior.fact_value=p_value and prior.baseline is not distinct from base then return prior.id; end if;
  if prior.id is not null then update public.inquiry_business_fact_proposals set state='superseded' where id=prior.id; end if;
  created:=gen_random_uuid();
  hash:=encode(sha256(convert_to(jsonb_build_object('id',created,'key',p_key,'value',p_value,'baseline',base,'source',p_provenance)::text,'UTF8')),'hex');
  insert into public.inquiry_business_fact_proposals(id,workspace_id,fact_key,fact_value,baseline,provenance,revision_hash,proposed_by)
    values(created,p_workspace_id,p_key,p_value,base,p_provenance,hash,p_user_id);
  return created;
end; $$;

create function public.read_inquiry_business_facts(p_workspace_id uuid,p_user_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare email text;
begin
  select lower(u.email) into email from public.users u where u.id=p_user_id and u.verified_at is not null;
  perform public.business_record_assert_actor(p_workspace_id,p_user_id,email,false);
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'workspaceId',p.workspace_id,'key',p.fact_key,'value',p.fact_value,'provenance',p.provenance,'revisionHash',p.revision_hash) order by p.created_at,p.id)
    from public.inquiry_business_fact_proposals p where p.workspace_id=p_workspace_id and p.state='pending'
      and p.baseline is not distinct from public.business_record_entity_state(p_workspace_id,'fact',p.fact_key)), '[]'::jsonb);
end; $$;

create function public.inquiry_business_fact_revision(p_workspace_id uuid,p_proposal_id uuid) returns text
language sql security definer set search_path=public,pg_temp as $$
  select p.revision_hash from public.inquiry_business_fact_proposals p where p.workspace_id=p_workspace_id and p.id=p_proposal_id and p.state='pending'
    and p.baseline is not distinct from public.business_record_entity_state(p_workspace_id,'fact',p.fact_key)
$$;

create function public.confirm_inquiry_business_fact(p_workspace_id uuid,p_proposal_id uuid,p_decision_id uuid,p_revision_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare proposal public.inquiry_business_fact_proposals%rowtype; item public.owner_decisions%rowtype; owner jsonb; reader uuid; result jsonb;
begin
  select * into item from public.owner_decisions where workspace_id=p_workspace_id and id=p_decision_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not found or item.source_lifecycle<>'inquiry_fact' or item.source_id<>p_proposal_id::text or item.revision_hash<>p_revision_hash
    or item.change_kind<>'fact.inferred' or item.route<>'owner_decides' or item.state<>'approved' or item.decided_by_kind not in ('owner_link','session') then raise exception 'inquiry_access_denied'; end if;
  if item.decided_by_kind='owner_link' then
    owner:=public.resolve_business_owner_recipient(p_workspace_id);
    if owner is null or lower(owner->>'email')<>lower(item.decided_by) then raise exception 'inquiry_access_denied'; end if;
    -- The owner's email is the approver in owner_decisions. A verified member
    -- supplies only the identity required by the existing business history.
    select u.id into reader from public.workspace_memberships m join public.users u on u.id=m.user_id and u.verified_at is not null
      where m.workspace_id=p_workspace_id and m.role in ('owner','admin') order by case m.role when 'owner' then 0 else 1 end,m.created_at,u.id limit 1;
  else
    select m.user_id into reader from public.workspace_memberships m join public.users u on u.id=m.user_id and u.verified_at is not null
      where m.workspace_id=p_workspace_id and m.role='owner' and m.user_id::text=item.decided_by;
  end if;
  if reader is null then raise exception 'inquiry_access_denied'; end if;
  select * into proposal from public.inquiry_business_fact_proposals where workspace_id=p_workspace_id and id=p_proposal_id for update;
  if not found or proposal.revision_hash<>p_revision_hash then raise exception 'inquiry_fact_changed'; end if;
  if proposal.state='confirmed' and proposal.decision_id=p_decision_id then return jsonb_build_object('confirmed',true,'replayed',true); end if;
  if proposal.state<>'pending' then raise exception 'inquiry_fact_changed'; end if;
  perform 1 from public.business_records where workspace_id=p_workspace_id for update;
  if proposal.baseline is distinct from public.business_record_entity_state(p_workspace_id,'fact',proposal.fact_key) then raise exception 'inquiry_fact_changed'; end if;
  result:=public.business_record_apply(p_workspace_id,reader,'member','owner',jsonb_build_object('facts',jsonb_build_object(proposal.fact_key,jsonb_build_object('value',proposal.fact_value,'verified',true))),null,null,proposal.id,proposal.revision_hash);
  update public.inquiry_business_fact_proposals set state='confirmed',decision_id=p_decision_id where id=proposal.id;
  return result;
end; $$;

create function public.correct_inquiry_business_fact(p_workspace_id uuid,p_user_id uuid,p_key text,p_value jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare email text; access text; source text; revision bigint; patch jsonb; command uuid:=gen_random_uuid();
begin
  select lower(u.email) into email from public.users u where u.id=p_user_id and u.verified_at is not null;
  access:=public.business_record_assert_actor(p_workspace_id,p_user_id,email,true);
  source:=case when exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null) then 'operator' else 'owner' end;
  if access<>'owner' and source<>'operator' then raise exception 'inquiry_access_denied'; end if;
  if p_key not in ('display_name','links') or not public.business_record_fact_valid(p_key,p_value) then raise exception 'inquiry_fact_invalid'; end if;
  -- Changing the website entry preserves other links in the one record.
  if p_key='links' then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into patch from jsonb_array_elements(coalesce(public.business_record_entity_state(p_workspace_id,'fact','links')->'value','[]'::jsonb)) where value->>'kind'<>'website';
    p_value:=patch||p_value;
  end if;
  select coalesce((select r.revision from public.business_records r where r.workspace_id=p_workspace_id),0) into revision;
  patch:=jsonb_build_object('facts',jsonb_build_object(p_key,jsonb_build_object('value',p_value,'verified',true)));
  return public.patch_business_record(p_workspace_id,p_user_id,email,source,revision,patch,command,encode(sha256(convert_to(patch::text,'UTF8')),'hex'));
end; $$;
revoke all on function public.stage_inquiry_business_fact(uuid,uuid,text,jsonb,text),public.read_inquiry_business_facts(uuid,uuid),public.inquiry_business_fact_revision(uuid,uuid),public.confirm_inquiry_business_fact(uuid,uuid,uuid,text),public.correct_inquiry_business_fact(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.stage_inquiry_business_fact(uuid,uuid,text,jsonb,text),public.read_inquiry_business_facts(uuid,uuid),public.inquiry_business_fact_revision(uuid,uuid),public.confirm_inquiry_business_fact(uuid,uuid,uuid,text),public.correct_inquiry_business_fact(uuid,uuid,text,jsonb) to service_role;
commit;
