begin;
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
 else
   update public.ask_business_record_drafts set status='declined' where id=d.id returning * into d;
 end if;
 return public.ask_business_draft_json(d);
end;
$$;
create or replace function public.resolve_ask_business_draft_by_owner_link(p_workspace_id uuid,p_user_id uuid,p_verified_email text,
 p_draft_id uuid,p_decision text,p_session_id uuid,p_decision_id uuid,p_revision_hash text,p_recipient text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.owner_decisions; session_row public.strelva_service_actions;
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
 return public.resolve_ask_business_draft(p_workspace_id,p_user_id,p_verified_email,p_draft_id,p_decision);
end $$;
drop function public.confirm_ask_business_draft_entities(uuid,uuid,uuid);
commit;
