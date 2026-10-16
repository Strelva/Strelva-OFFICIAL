-- Access review: say since when an agency of record has worked on a business (XA · R4).
-- Adds an optional 'since' to provider entries only; every other entry is unchanged.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
begin;
set local lock_timeout='3s';

create or replace function public.read_access_review(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_organization boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor_role text; result jsonb; missing integer;
begin
 actor_role:=public.access_review_reader(p_workspace_id,p_user_id,p_verified_email);
 if p_organization and actor_role not in ('owner','admin') then raise exception 'access_review_denied'; end if;
 -- No IDs, names or private access details from inaccessible mapped units.
 select count(*) into missing from (
  select r.customer_workspace_id business from public.customer_relationships r where p_organization and r.organization_workspace_id=p_workspace_id and r.status='active' and r.customer_workspace_id is not null
  union select e.business_workspace_id from public.enterprise_units e where p_organization and e.organization_workspace_id=p_workspace_id and e.status='active'
 ) x where not exists(select 1 from public.workspace_memberships m where m.workspace_id=x.business and m.user_id=p_user_id);
 with units as (select w.id,w.name,m.role from public.access_review_units(p_workspace_id,p_user_id,p_organization) ids
 join public.workspaces w on w.id=ids join public.workspace_memberships m on m.workspace_id=w.id and m.user_id=p_user_id),
 entries as (
 select u.id business_id,'member'::text kind,m.user_id id,p.email label,m.role status,null::timestamptz last_used_at,null::timestamptz since,
 u.role='owner' and m.role<>'owner' and m.user_id<>p_user_id can_revoke from units u join public.workspace_memberships m on m.workspace_id=u.id join public.users p on p.id=m.user_id
 union all select u.id,'delegation',d.id,a.name,d.status,null,null,u.role in ('owner','admin') and d.status='active'
 from units u join public.workspace_delegations d on d.customer_workspace_id=u.id join public.workspaces a on a.id=d.agency_workspace_id
 union all select u.id,'operational_assignment',a.id,a.assignee_email,
 case when a.status in ('offered','accepted') and a.expires_at<=statement_timestamp() then 'expired' else a.status end,null,null,
 u.role='owner' and a.status in ('offered','accepted') and a.expires_at>statement_timestamp()
 from units u join public.operational_assignments a on a.workspace_id=u.id
 union all select u.id,'agency_assignment',a.id,p.email||' · '||w.name,a.status,null,null,u.role='owner' and a.status='active'
 from units u join public.agency_client_staff a on a.customer_workspace_id=u.id join public.users p on p.id=a.user_id join public.workspaces w on w.id=a.agency_workspace_id
 union all select u.id,'provider',p.id,w.name,p.status,null,p.started_at,u.role='owner' and p.status='active'
 and not exists(select 1 from public.provider_change_policy)
 and not exists(select 1 from public.provider_change_requests q where q.business_workspace_id=u.id and q.status in ('awaiting_policy','awaiting_notice','notified'))
 from units u join public.workspace_providers p on p.customer_workspace_id=u.id join public.workspaces w on w.id=p.provider_workspace_id
 union all select u.id,'provider_seat',s.id,w.name,s.status,null,null,u.role='owner' and s.status='active'
 from units u join public.provider_seats s on s.customer_workspace_id=u.id join public.workspaces w on w.id=s.agency_workspace_id
 union all select u.id,'agent_token',t.id,t.agent_label||' · '||t.issuer_email,'live',
 (select max(e.occurred_at) from public.workspace_agent_access_events e where e.token_id=t.id and e.action in ('read','propose')),null,
 u.role in ('owner','admin') from units u join public.saved_product_work w on w.workspace_id=u.id
 join public.workspace_agent_access_tokens t on t.work_id=w.id where public.access_review_token_live(t.id)
 ) select coalesce(jsonb_agg(jsonb_build_object('workspaceId',u.id,'name',u.name,'role',u.role,'entries',
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'label',e.label,'status',e.status,'lastUsedAt',e.last_used_at,'canRevoke',e.can_revoke)||case when e.since is null then '{}'::jsonb else jsonb_build_object('since',e.since) end order by e.kind,e.label,e.id) from entries e where e.business_id=u.id),'[]'::jsonb)) order by u.name,u.id),'[]'::jsonb) into result from units u;
 return jsonb_build_object('workspaceId',p_workspace_id,'actorUserId',p_user_id,'organization',p_organization,'inaccessibleUnits',missing,'units',result);
end;$$;

commit;
