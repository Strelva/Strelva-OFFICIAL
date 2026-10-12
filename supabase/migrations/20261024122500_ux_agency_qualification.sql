-- Local preparation only. Every agency submits evidence; an independent
-- operator records availability per effect. No client content is approved here.
begin;
set local lock_timeout = '3s';
-- Save precisely the function bodies being replaced; rollback refuses later drift.
create schema ux_agency_qualification_rollback;
revoke all on schema ux_agency_qualification_rollback from public,anon,authenticated,service_role;
create table ux_agency_qualification_rollback.functions(signature text primary key,before_definition text not null,after_hash text);
insert into ux_agency_qualification_rollback.functions(signature,before_definition)
  select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
    'public.record_agency_verification(text,uuid,text,text,jsonb,text)',
    'public.agency_effect_allowed(uuid,text)',
    'public.agency_verification_state(uuid)']) signature;
create table public.agency_qualification_submissions (
  id uuid primary key,
  sequence bigint generated always as identity unique,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  effect text not null check (effect in ('publish','google','email','payments')),
  submitted_by uuid not null references public.users(id) on delete restrict,
  evidence_url text not null check (char_length(evidence_url) between 9 and 2000 and evidence_url ~ '^https://[^[:space:]]+$'),
  evidence text not null check (char_length(btrim(evidence)) between 20 and 6000),
  submitted_at timestamptz not null default clock_timestamp()
);
create index agency_qualification_latest_idx on public.agency_qualification_submissions(agency_workspace_id,effect,sequence desc);
create table public.agency_qualification_decisions (
  sequence bigint generated always as identity primary key,
  submission_id uuid not null references public.agency_qualification_submissions(id) on delete cascade,
  decision text not null check (decision in ('verified','changes_requested','unavailable')),
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  decided_by uuid not null references public.users(id) on delete restrict,
  verification_id uuid not null references public.agency_verifications(id) on delete cascade,
  decided_at timestamptz not null default clock_timestamp()
);
alter table public.agency_qualification_submissions enable row level security;
alter table public.agency_qualification_decisions enable row level security;
revoke all on public.agency_qualification_submissions, public.agency_qualification_decisions from public,anon,authenticated,service_role;

create function public.agency_qualification_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    if tg_table_name='agency_qualification_submissions' then
      if not exists(select 1 from public.workspaces where id=old.agency_workspace_id) then return old; end if;
    else
      if not exists(select 1 from public.agency_qualification_submissions s join public.workspaces w on w.id=s.agency_workspace_id where s.id=old.submission_id) then return old; end if;
    end if;
  end if;
  raise exception 'agency_qualification_immutable';
end; $$;
create trigger agency_qualification_immutable before update or delete on public.agency_qualification_submissions for each row execute function public.agency_qualification_immutable();
create trigger agency_qualification_immutable before update or delete on public.agency_qualification_decisions for each row execute function public.agency_qualification_immutable();
revoke all on function public.agency_qualification_immutable() from public,anon,authenticated,service_role;

create function public.agency_qualification_records(p_agency_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'workspaceId',s.agency_workspace_id,'agencyName',w.name,
    'effect',s.effect,'evidenceUrl',s.evidence_url,'evidence',s.evidence,'submittedBy',s.submitted_by,'submittedAt',s.submitted_at,
    'decision',d.decision,'reason',d.reason,'decidedAt',d.decided_at,'decidedBy',d.decided_by) order by s.sequence desc),'[]'::jsonb)
  from public.agency_qualification_submissions s join public.workspaces w on w.id=s.agency_workspace_id
  left join lateral (select * from public.agency_qualification_decisions x where x.submission_id=s.id order by x.sequence desc limit 1) d on true
  where p_agency_workspace_id is null or s.agency_workspace_id=p_agency_workspace_id
$$;
create function public.read_agency_qualification(p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_role text;
begin
  select m.role into v_role from public.workspace_memberships m join public.users u on u.id=m.user_id
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    where m.workspace_id=p_agency_workspace_id and u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email));
  if not found then raise exception 'agency_qualification_access_denied'; end if;
  return jsonb_build_object('workspaceId',p_agency_workspace_id,'canSubmit',v_role in ('owner','admin'),
    'submissions',public.agency_qualification_records(p_agency_workspace_id),
    'effects',(select jsonb_agg(jsonb_build_object('effect',e,'available',public.agency_effect_allowed(p_agency_workspace_id,e))) from unnest(public.agency_effect_names()) e));
end; $$;
create function public.submit_agency_qualification(p_user_id uuid,p_verified_email text,p_agency_workspace_id uuid,p_request_id uuid,p_effect text,p_evidence_url text,p_evidence text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.agency_qualification_submissions;
begin
  perform 1 from public.workspaces where id=p_agency_workspace_id and kind='agency' for update;
  if not found then raise exception 'agency_qualification_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=p_agency_workspace_id and m.role in ('owner','admin') and u.id=p_user_id
    and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email)) for share of m,u;
  if not found then raise exception 'agency_qualification_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-verification:'||p_agency_workspace_id::text,0));
  select * into v_existing from public.agency_qualification_submissions where id=p_request_id;
  if found then
    if v_existing.agency_workspace_id<>p_agency_workspace_id or v_existing.effect<>p_effect or v_existing.submitted_by<>p_user_id
      or v_existing.evidence_url<>p_evidence_url or v_existing.evidence<>btrim(p_evidence) then raise exception 'agency_qualification_request_conflict'; end if;
    return public.read_agency_qualification(p_user_id,p_verified_email,p_agency_workspace_id);
  end if;
  if exists (select 1 from public.agency_qualification_submissions s where s.agency_workspace_id=p_agency_workspace_id and s.effect=p_effect
    and not exists(select 1 from public.agency_qualification_decisions d where d.submission_id=s.id)) then raise exception 'agency_qualification_pending'; end if;
  insert into public.agency_qualification_submissions(id,agency_workspace_id,effect,submitted_by,evidence_url,evidence)
    values(p_request_id,p_agency_workspace_id,p_effect,p_user_id,p_evidence_url,btrim(p_evidence));
  return public.read_agency_qualification(p_user_id,p_verified_email,p_agency_workspace_id);
end; $$;
create function public.read_agency_qualification_desk(p_operator_email text) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
begin
  perform public.tenant_conversion_assert_operator(p_operator_email);
  return public.agency_qualification_records(null);
end; $$;
create function public.decide_agency_qualification(p_operator_email text,p_submission_id uuid,p_decision text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_operator uuid; s public.agency_qualification_submissions; v_verification uuid; v_latest public.agency_qualification_decisions;
begin
  v_operator:=public.tenant_conversion_assert_operator(p_operator_email);
  select * into s from public.agency_qualification_submissions where id=p_submission_id;
  if not found then raise exception 'agency_qualification_stale'; end if;
  perform 1 from public.workspaces where id=s.agency_workspace_id and kind='agency' for update;
  if not found then raise exception 'agency_qualification_stale'; end if;
  -- Lock the current confirmed operator, including revocation, through the write.
  -- The earlier generic operator lookup holds only KEY SHARE on users.
  select u.id into v_operator from public.users u join public.super_admins sa on sa.user_id=u.id and sa.revoked_at is null
    where lower(u.email)=lower(btrim(p_operator_email)) and u.verified_at is not null for share of u,sa;
  if not found then raise exception 'tenant_conversion_operator_required'; end if;
  -- Workspace UPDATE also serializes agency invitation acceptance (workspace SHARE),
  -- so a new self-membership cannot be added between its check and the decision.
  perform pg_advisory_xact_lock(hashtextextended('agency-verification:'||s.agency_workspace_id::text,0));
  if s.id is distinct from (select id from public.agency_qualification_submissions where agency_workspace_id=s.agency_workspace_id and effect=s.effect order by sequence desc limit 1)
    then raise exception 'agency_qualification_stale'; end if;
  if p_decision is null or p_decision not in ('verified','changes_requested','unavailable') or p_reason is null or char_length(btrim(p_reason)) not between 10 and 500
    then raise exception 'agency_verification_invalid'; end if;
  -- Independent review: no agency, including Strelva Agency, approves itself.
  if exists(select 1 from public.workspace_memberships where workspace_id=s.agency_workspace_id and user_id=v_operator)
    then raise exception 'agency_qualification_self_verification'; end if;
  select * into v_latest from public.agency_qualification_decisions where submission_id=s.id order by sequence desc limit 1;
  if found and v_latest.decision=p_decision and v_latest.reason=btrim(p_reason) then return public.agency_qualification_records(s.agency_workspace_id); end if;
  insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,reason,verified_by,verifier_is_agency_member)
    values(s.agency_workspace_id,s.effect,case when p_decision='verified' then 'verified' else 'unverified' end,
      jsonb_build_object('submissionId',s.id,'evidenceUrl',s.evidence_url,'submittedBy',s.submitted_by),btrim(p_reason),v_operator,false) returning id into v_verification;
  insert into public.agency_qualification_decisions(submission_id,decision,reason,decided_by,verification_id)
    values(s.id,p_decision,btrim(p_reason),v_operator,v_verification);
  return public.agency_qualification_records(s.agency_workspace_id);
end; $$;
-- Retire the API-only shortcut, including operator self-verification.
create or replace function public.record_agency_verification(p_operator_email text,p_agency_workspace_id uuid,p_effect text,p_status text,p_evidence jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.tenant_conversion_assert_operator(p_operator_email);
  raise exception 'agency_qualification_submission_required';
end; $$;
-- Historical self-verification must not unlock outside effects.
create or replace function public.agency_effect_allowed(p_agency_workspace_id uuid,p_effect text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_effect is null or not(p_effect=any(public.agency_effect_names())) then raise exception 'agency_effect_unknown'; end if;
  return coalesce((select v.status='verified' and not v.verifier_is_agency_member from public.agency_verifications v
    join public.workspaces w on w.id=v.agency_workspace_id and w.kind='agency'
    where v.agency_workspace_id=p_agency_workspace_id and v.effect=p_effect order by v.sequence desc limit 1),false);
end; $$;
revoke all on function public.agency_qualification_records(uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_agency_qualification(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.submit_agency_qualification(uuid,text,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.read_agency_qualification_desk(text) from public,anon,authenticated;
revoke all on function public.decide_agency_qualification(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_agency_qualification(uuid,text,uuid) to service_role;
grant execute on function public.submit_agency_qualification(uuid,text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.read_agency_qualification_desk(text) to service_role;
grant execute on function public.decide_agency_qualification(text,uuid,text,text) to service_role;

-- Onboarding and the gate report the same availability, even for historical self-review.
create or replace function public.agency_verification_state(p_agency_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('agencyWorkspaceId',p_agency_workspace_id,'effects',jsonb_agg(jsonb_build_object(
    'effect',e.effect,'status',case when public.agency_effect_allowed(p_agency_workspace_id,e.effect) then 'verified' else 'unverified' end,
    'recorded',v.id is not null,'recordedAt',case when v.id is not null then to_char(v.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'reason',v.reason,'verifierIsAgencyMember',v.verifier_is_agency_member) order by e.ordinality))
  from unnest(public.agency_effect_names()) with ordinality e(effect,ordinality)
  left join lateral(select * from public.agency_verifications x where x.agency_workspace_id=p_agency_workspace_id and x.effect=e.effect order by x.sequence desc limit 1) v on true
$$;

update ux_agency_qualification_rollback.functions set after_hash=md5(pg_get_functiondef(signature::regprocedure));
commit;
