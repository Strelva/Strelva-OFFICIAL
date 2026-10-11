begin;
set local lock_timeout='3s';
-- An owner's Ask approval confirms only the entities written by that exact
-- draft receipt. Provider edits elsewhere in the working record stay pending.
create function public.confirm_ask_business_draft_entities(p_workspace_id uuid, p_draft_id uuid, p_decision_id uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.ask_business_record_drafts; r public.business_record_revisions; c jsonb;
begin
 select * into d from public.ask_business_record_drafts where workspace_id=p_workspace_id and id=p_draft_id;
 if not found or d.status <> 'approved' or d.receipt is null then raise exception 'business_facts_owner_approval_required'; end if;
 select * into r from public.business_record_revisions where workspace_id=p_workspace_id
   and sequence=(d.receipt->>'sequence')::bigint and command_id=p_draft_id;
 if not found then raise exception 'business_facts_changed'; end if;
 for c in select value from jsonb_array_elements(r.changes) loop
   if c->>'entity' not in ('fact','service') then continue; end if;
   if c->'after' is null or c->'after'='null'::jsonb then
     delete from public.business_record_confirmed where workspace_id=p_workspace_id and entity=c->>'entity' and entity_id=c->>'id';
   else
     insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind,decision_id,revision_sequence)
       values(p_workspace_id,c->>'entity',c->>'id',c->'after',case when p_decision_id is null then 'owner_write' else 'owner_decision' end,p_decision_id,r.sequence)
       on conflict(workspace_id,entity,entity_id) do update set state=excluded.state,confirmed_by_kind=excluded.confirmed_by_kind,
         decision_id=excluded.decision_id,revision_sequence=excluded.revision_sequence,confirmed_at=clock_timestamp();
   end if;
 end loop;
end $$;
revoke all on function public.confirm_ask_business_draft_entities(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.resolve_ask_business_draft(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
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
     encode(sha256(convert_to(d.patch::text || ':' || d.expected_revision::text,'UTF8')),'hex'));
   update public.ask_business_record_drafts set status='approved',receipt=jsonb_build_object('sequence',result->'sequence','revision',result->'revision')
     where id=d.id returning * into d;
   if actor_role='owner' then perform public.confirm_ask_business_draft_entities(p_workspace_id,d.id); end if;
 else
   update public.ask_business_record_drafts set status='declined' where id=d.id returning * into d;
 end if;
 return public.ask_business_draft_json(d);
end;
$$;
create or replace function public.resolve_ask_business_draft_by_owner_link(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_draft_id uuid,p_decision text,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; session_row public.strelva_service_actions; result jsonb; was_pending boolean;
begin
 item:=public.assert_owner_decision_link(p_workspace_id,p_session_id,p_decision_id,p_revision_hash,p_recipient);
 session_row:=public.strelva_service_session(p_workspace_id,p_session_id,'owner_decision_link');
 if session_row.on_behalf_user_id is distinct from p_user_id or item.source_lifecycle<>'business_record_draft'
   or item.source_id is distinct from p_draft_id::text or item.change_kind<>'fact.inferred'
   or p_decision is null or p_decision not in ('approve','not_yet')
   or item.state is distinct from (case p_decision when 'approve' then 'approved' else 'declined' end)
   or not exists(select 1 from public.strelva_service_actions where session_id=p_session_id and action='run') then
   raise exception 'strelva_service_access_denied';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 select status='pending' into was_pending from public.ask_business_record_drafts where workspace_id=p_workspace_id and id=p_draft_id;
 result:=public.resolve_ask_business_draft(p_workspace_id,p_user_id,p_verified_email,p_draft_id,p_decision);
 if p_decision='approve' and was_pending and result->>'status'='approved' then
   perform public.confirm_ask_business_draft_entities(p_workspace_id,p_draft_id,p_decision_id);
 end if;
 return result;
end $$;
commit;
