-- Ask proposes exact business-record patches; only Needs you resolves them.
begin;
set local lock_timeout = '3s';
create table public.ask_business_record_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_id uuid,
  expected_revision bigint not null check (expected_revision >= 0),
  patch jsonb not null check (jsonb_typeof(patch) = 'object' and patch <> '{}'::jsonb),
  summary text not null check (char_length(summary) between 1 and 200 and summary = btrim(summary)),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  receipt jsonb,
  unique(workspace_id, idempotency_key)
);
alter table public.ask_business_record_drafts enable row level security;
revoke all on public.ask_business_record_drafts from public, anon, authenticated;
revoke all on public.ask_business_record_drafts from service_role;

create function public.ask_business_draft_json(p public.ask_business_record_drafts) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
select jsonb_build_object('id',p.id,'workspaceId',p.workspace_id,'systemId',p.system_id,
 'expectedRevision',p.expected_revision,'patch',p.patch,'summary',p.summary,'status',p.status,
 'createdAt',p.created_at,'receipt',p.receipt);
$$;

create function public.save_ask_business_draft(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_system_id uuid,p_expected_revision bigint,p_patch jsonb,p_summary text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.ask_business_record_drafts%rowtype; r bigint; actor_role text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 actor_role := public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,false);
 -- Drafting is allowed to direct members; delegation is read-only in Ask.
 if actor_role not in ('owner','admin','member') then raise exception 'business_record_access_denied'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
   or (p_patch - array['facts','services','people']::text[]) <> '{}'::jsonb
   or length(p_patch::text) > 900 then raise exception 'business_record_patch_invalid'; end if;
 if p_system_id is not null and not exists(select 1 from public.systems where id=p_system_id and business_workspace_id=p_workspace_id)
 then raise exception 'business_record_access_denied'; end if;
 select * into d from public.ask_business_record_drafts where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key for update;
 if found then
   if d.patch <> p_patch or d.expected_revision <> p_expected_revision or d.summary <> p_summary
     or d.system_id is distinct from p_system_id or d.created_by <> p_user_id then raise exception 'business_record_idempotency_conflict'; end if;
   return public.ask_business_draft_json(d);
 end if;
 select revision into r from public.business_records where workspace_id=p_workspace_id for update;
 if p_expected_revision is null or coalesce(r,0) <> p_expected_revision then raise exception 'business_record_revision_conflict'; end if;
 insert into public.ask_business_record_drafts(workspace_id,system_id,expected_revision,patch,summary,idempotency_key,created_by)
 values(p_workspace_id,p_system_id,p_expected_revision,p_patch,p_summary,p_idempotency_key,p_user_id) returning * into d;
 return public.ask_business_draft_json(d);
end;
$$;

create function public.list_ask_business_drafts(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
 perform public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,false);
 return coalesce((select jsonb_agg(public.ask_business_draft_json(d) order by d.created_at desc)
 from public.ask_business_record_drafts d where d.workspace_id=p_workspace_id), '[]'::jsonb);
end;
$$;

create function public.resolve_ask_business_draft(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_draft_id uuid,p_decision text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.ask_business_record_drafts%rowtype; result jsonb; actor_role text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 actor_role := public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 if actor_role not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
 select * into d from public.ask_business_record_drafts where workspace_id=p_workspace_id and id=p_draft_id for update;
 if not found then raise exception 'business_record_entity_not_found'; end if;
 if p_decision not in ('approve','not_yet') or p_decision is null then raise exception 'business_record_patch_invalid'; end if;
 if d.status <> 'pending' then return public.ask_business_draft_json(d); end if;
 if p_decision = 'approve' then
   result := public.patch_business_record(p_workspace_id,p_user_id,p_verified_email,'agent',d.expected_revision,d.patch,d.id,
     encode(digest(convert_to(d.patch::text || ':' || d.expected_revision::text,'UTF8'),'sha256'),'hex'));
   update public.ask_business_record_drafts set status='approved',receipt=jsonb_build_object('sequence',result->'sequence','revision',result->'revision')
     where id=d.id returning * into d;
 else
   update public.ask_business_record_drafts set status='declined' where id=d.id returning * into d;
 end if;
 return public.ask_business_draft_json(d);
end;
$$;
revoke all on function public.ask_business_draft_json(public.ask_business_record_drafts) from public,anon,authenticated,service_role;
revoke all on function public.save_ask_business_draft(uuid,uuid,text,uuid,bigint,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.list_ask_business_drafts(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.resolve_ask_business_draft(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.save_ask_business_draft(uuid,uuid,text,uuid,bigint,jsonb,text,text) to service_role;
grant execute on function public.list_ask_business_drafts(uuid,uuid,text) to service_role;
grant execute on function public.resolve_ask_business_draft(uuid,uuid,text,uuid,text) to service_role;
commit;
