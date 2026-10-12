-- Current authority for the regular inquiry message review executor. Events
-- stay Redis-authoritative; the caller also verifies their immutable binding.
begin;
set local lock_timeout='3s';
create function public.authorize_inquiry_operator_actor(p_tenant_id text,p_actor_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u join public.super_admins a on a.user_id=u.id
    where u.id=p_actor_id and u.verified_at is not null and lower(a.email)=lower(u.email) for share of u,a;
  if not found then return false; end if;
  perform 1 from public.memberships m join public.tenants t on t.stable_id=m.tenant_stable_id
    where t.id=p_tenant_id and m.user_id=p_actor_id for share of m,t;
  return found;
end $$;
revoke all on function public.authorize_inquiry_operator_actor(text,uuid) from public,anon,authenticated;
grant execute on function public.authorize_inquiry_operator_actor(text,uuid) to service_role;

-- Worker read of the owner's standing stricter message policy, scoped through
-- the canonical tenant/workspace link and the exact inquiry business snapshot.
create function public.read_inquiry_message_owner_policy(p_tenant_id text,p_business_id text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_workspace uuid; v_inquiry_workspace uuid;
begin
  select l.workspace_id,w.id into v_workspace,v_inquiry_workspace from public.tenants t
    join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    join public.inquiry_workspaces w on w.tenant_stable_id=t.stable_id and w.business_id=p_business_id
    where t.id=p_tenant_id;
  if not found then return null; end if;
  return jsonb_build_object('workspaceId',v_workspace,'inquiryWorkspaceId',v_inquiry_workspace,
    'policies',coalesce((select jsonb_agg(jsonb_build_object('layer',p.layer,'kind',p.change_kind,'systemId',case when p.system_key='*' then null else p.system_key end,'route',p.route))
      from public.decision_policies p where p.workspace_id=v_workspace and p.layer='owner' and p.change_kind='customer.message'),'[]'::jsonb));
end $$;
revoke all on function public.read_inquiry_message_owner_policy(text,text) from public,anon,authenticated;
grant execute on function public.read_inquiry_message_owner_policy(text,text) to service_role;

-- Publication is the business owner's decision, independently of a generic
-- operator's permission to process other tenant events.
create function public.authorize_inquiry_publication_actor(p_tenant_id text,p_actor_id uuid,p_claim_id uuid,p_event_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.inquiry_publication_claims c join public.tenants t on t.stable_id=c.tenant_stable_id
    join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    join public.users u on u.id=p_actor_id and u.verified_at is not null
    join public.memberships m on m.user_id=u.id and m.tenant_stable_id=t.stable_id and m.role='owner'
    join public.workspace_memberships wm on wm.workspace_id=l.workspace_id and wm.user_id=u.id and wm.role='owner'
    where t.id=p_tenant_id and c.id=p_claim_id and c.governance_event_id=p_event_id and c.actor_id=p_actor_id::text
    for share of c,u,m,wm;
  return found;
end $$;
create function public.authorize_inquiry_owner_link_publication(p_tenant_id text,p_event_id text,p_revision text,p_recipient text,p_claim_id uuid,p_action text default 'approved') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.owner_decisions d join public.tenant_workspace_links l on l.workspace_id=d.workspace_id
    join public.tenants t on t.stable_id=l.tenant_stable_id
    join public.inquiry_publication_claims c on c.tenant_stable_id=t.stable_id and c.id=p_claim_id and c.governance_event_id=p_event_id
    where t.id=p_tenant_id and d.source_lifecycle='tenant_event' and d.source_id=p_tenant_id||':'||p_event_id
      and d.revision_hash=p_revision and p_action in ('approved','dismissed') and d.state=case when p_action='approved' then 'approved' else 'declined' end and d.route='owner_decides'
      and d.change_kind=case when c.action='make_live' then 'system.go_live' else 'system.change_live' end
      and not d.sign_in_required and d.decided_by_kind='owner_link' and d.decided_by=lower(btrim(p_recipient))
      and lower(public.resolve_business_owner_recipient(d.workspace_id)->>'email')=lower(btrim(p_recipient)))
$$;
revoke all on function public.authorize_inquiry_publication_actor(text,uuid,uuid,text),public.authorize_inquiry_owner_link_publication(text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_inquiry_publication_actor(text,uuid,uuid,text),public.authorize_inquiry_owner_link_publication(text,text,text,text,uuid,text) to service_role;

-- The signed Not yet decision closes its event without granting send authority.
create function public.authorize_inquiry_owner_link_message_action(p_tenant_id text,p_event_id text,p_revision text,p_recipient text,p_action text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.owner_decisions d join public.tenant_workspace_links l on l.workspace_id=d.workspace_id
    join public.tenants t on t.stable_id=l.tenant_stable_id
    where t.id=p_tenant_id and d.source_lifecycle='tenant_event' and d.source_id=p_tenant_id||':'||p_event_id
      and d.revision_hash=p_revision and p_action in ('approved','dismissed')
      and d.state=case when p_action='approved' then 'approved' else 'declined' end and d.route='owner_decides'
      and d.change_kind in ('customer.message','customer.commitment') and not d.sign_in_required
      and d.decided_by_kind='owner_link' and d.decided_by=lower(btrim(p_recipient))
      and lower(public.resolve_business_owner_recipient(d.workspace_id)->>'email')=lower(btrim(p_recipient)))
$$;
revoke all on function public.authorize_inquiry_owner_link_message_action(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.authorize_inquiry_owner_link_message_action(text,text,text,text,text) to service_role;
commit;
