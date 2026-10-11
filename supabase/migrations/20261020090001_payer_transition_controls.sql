drop function public.workspace_payer_transition_snapshot(uuid,uuid,text);
create function public.workspace_payer_transition_snapshot(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_verified_email text
) returns table (
  id uuid, workspace_id uuid, successor_user_id uuid, successor_email text, status text,
  proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamptz,
  resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text, can_respond boolean
) language plpgsql security definer set search_path = public, pg_temp as $$
declare is_owner boolean;
begin
  perform 1 from public.users u where u.id=p_actor_id
    and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  is_owner := exists(select 1 from public.workspace_memberships m
    where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role='owner');
  if not is_owner and not exists(select 1 from public.workspace_payer_transitions x where x.workspace_id=p_workspace_id
      and ((x.successor_user_id=p_actor_id and x.successor_email=lower(btrim(p_verified_email)))
        or exists(select 1 from public.workspace_memberships am where am.workspace_id=x.successor_workspace_id
          and am.user_id=p_actor_id and am.role in ('owner','admin')))) then
    raise exception 'payer_transition_workspace_denied';
  end if;
  return query select t.id,t.workspace_id,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name, case when t.successor_kind='user' then t.successor_user_id=p_actor_id when t.successor_kind='agency' then public.work_payer_can_sign('agency',t.successor_workspace_id,t.workspace_id,null,p_actor_id) else exists(select 1 from public.workspace_memberships bm where bm.workspace_id=t.workspace_id and bm.user_id=p_actor_id and bm.role='owner') end
    from public.workspace_payer_transitions t join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where t.workspace_id=p_workspace_id and (
      is_owner
      or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    ) order by t.proposed_at desc;
end $$;
revoke all on function public.workspace_payer_transition_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.workspace_payer_transition_snapshot(uuid,uuid,text) to service_role;

drop function public.workspace_payer_transition_inbox(uuid,text);
create function public.workspace_payer_transition_inbox(p_actor_id uuid,p_verified_email text)
returns table (
  id uuid, workspace_id uuid, workspace_name text, successor_user_id uuid,
  successor_email text, status text, proposed_by uuid, proposer_email text,
  resolved_by uuid, proposed_at timestamptz, resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text, can_respond boolean
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  return query select t.id,t.workspace_id,w.name,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name, case when t.successor_kind='user' then t.successor_user_id=p_actor_id when t.successor_kind='agency' then public.work_payer_can_sign('agency',t.successor_workspace_id,t.workspace_id,null,p_actor_id) else exists(select 1 from public.workspace_memberships bm where bm.workspace_id=t.workspace_id and bm.user_id=p_actor_id and bm.role='owner') end
    from public.workspace_payer_transitions t
    join public.workspaces w on w.id=t.workspace_id
    join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where (t.successor_kind='business' and exists(select 1 from public.workspace_memberships bm where bm.workspace_id=t.workspace_id and bm.user_id=p_actor_id and bm.role='owner')) or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    order by t.proposed_at desc;
end $$;
revoke all on function public.workspace_payer_transition_inbox(uuid,text) from public,anon,authenticated;
grant execute on function public.workspace_payer_transition_inbox(uuid,text) to service_role;
