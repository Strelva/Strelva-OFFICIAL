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