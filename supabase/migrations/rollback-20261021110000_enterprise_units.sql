begin;
set local lock_timeout='5s';
do $$ begin if exists(select 1 from public.enterprise_units) or exists(select 1 from public.enterprise_unit_audit) then raise exception 'enterprise_units_rollback_retained_history'; end if; end; $$;
create or replace function public.access_review_units(p_workspace_id uuid,p_user_id uuid,p_organization boolean)
returns setof uuid language sql stable security definer set search_path=public,pg_temp as $$
 select p_workspace_id
 union
 select r.customer_workspace_id from public.customer_relationships r
 join public.workspace_memberships m on m.workspace_id=r.customer_workspace_id and m.user_id=p_user_id
 where p_organization and r.organization_workspace_id=p_workspace_id and r.status='active' and r.customer_workspace_id is not null
$$;
create or replace function public.read_access_review(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_organization boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor_role text; result jsonb; missing integer;
begin
 actor_role:=public.access_review_reader(p_workspace_id,p_user_id,p_verified_email);
 if p_organization and actor_role not in ('owner','admin') then raise exception 'access_review_denied'; end if;
 -- No IDs, names or private access details from inaccessible mapped units.
 select count(distinct r.customer_workspace_id) into missing from public.customer_relationships r
 where p_organization and r.organization_workspace_id=p_workspace_id and r.status='active' and r.customer_workspace_id is not null
 and not exists(select 1 from public.workspace_memberships m where m.workspace_id=r.customer_workspace_id and m.user_id=p_user_id);
 with units as (select w.id,w.name,m.role from public.access_review_units(p_workspace_id,p_user_id,p_organization) ids
 join public.workspaces w on w.id=ids join public.workspace_memberships m on m.workspace_id=w.id and m.user_id=p_user_id),
 entries as (
 select u.id business_id,'member'::text kind,m.user_id id,p.email label,m.role status,null::timestamptz last_used_at,
 u.role='owner' and m.role<>'owner' and m.user_id<>p_user_id can_revoke from units u join public.workspace_memberships m on m.workspace_id=u.id join public.users p on p.id=m.user_id
 union all select u.id,'delegation',d.id,a.name,d.status,null,u.role in ('owner','admin') and d.status='active'
 from units u join public.workspace_delegations d on d.customer_workspace_id=u.id join public.workspaces a on a.id=d.agency_workspace_id
 union all select u.id,'operational_assignment',a.id,a.assignee_email,
 case when a.status in ('offered','accepted') and a.expires_at<=statement_timestamp() then 'expired' else a.status end,null,
 u.role='owner' and a.status in ('offered','accepted') and a.expires_at>statement_timestamp()
 from units u join public.operational_assignments a on a.workspace_id=u.id
 union all select u.id,'agency_assignment',a.id,p.email||' · '||w.name,a.status,null,u.role='owner' and a.status='active'
 from units u join public.agency_client_staff a on a.customer_workspace_id=u.id join public.users p on p.id=a.user_id join public.workspaces w on w.id=a.agency_workspace_id
 union all select u.id,'provider',p.id,w.name,p.status,null,u.role='owner' and p.status='active'
 and not exists(select 1 from public.provider_change_policy)
 and not exists(select 1 from public.provider_change_requests q where q.business_workspace_id=u.id and q.status in ('awaiting_policy','awaiting_notice','notified'))
 from units u join public.workspace_providers p on p.customer_workspace_id=u.id join public.workspaces w on w.id=p.provider_workspace_id
 union all select u.id,'provider_seat',s.id,w.name,s.status,null,u.role='owner' and s.status='active'
 from units u join public.provider_seats s on s.customer_workspace_id=u.id join public.workspaces w on w.id=s.agency_workspace_id
 union all select u.id,'agent_token',t.id,t.agent_label||' · '||t.issuer_email,'live',
 (select max(e.occurred_at) from public.workspace_agent_access_events e where e.token_id=t.id and e.action in ('read','propose')),
 u.role in ('owner','admin') from units u join public.saved_product_work w on w.workspace_id=u.id
 join public.workspace_agent_access_tokens t on t.work_id=w.id where public.access_review_token_live(t.id)
 ) select coalesce(jsonb_agg(jsonb_build_object('workspaceId',u.id,'name',u.name,'role',u.role,'entries',
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'label',e.label,'status',e.status,'lastUsedAt',e.last_used_at,'canRevoke',e.can_revoke) order by e.kind,e.label,e.id) from entries e where e.business_id=u.id),'[]'::jsonb)) order by u.name,u.id),'[]'::jsonb) into result from units u;
 return jsonb_build_object('workspaceId',p_workspace_id,'actorUserId',p_user_id,'organization',p_organization,'inaccessibleUnits',missing,'units',result);
end;$$;
create or replace function public.revoke_access_review_entry(p_workspace_id uuid,p_business_id uuid,p_user_id uuid,p_verified_email text,p_organization boolean,p_kind text,p_record_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; changed boolean:=false; token_row public.workspace_agent_access_tokens; work_row public.saved_product_work; provider_row public.workspace_providers;
begin
 perform public.access_review_require(p_workspace_id,p_user_id,p_verified_email);
 if p_workspace_id<>p_business_id then
  if not p_organization then raise exception 'access_review_denied'; end if;
  perform 1 from public.customer_relationships where organization_workspace_id=p_workspace_id and customer_workspace_id=p_business_id and status='active' for share;
  if not found then raise exception 'access_review_denied'; end if;
 end if;
 actor_role:=public.access_review_require(p_business_id,p_user_id,p_verified_email);
 if p_kind not in ('member','delegation','operational_assignment','agency_assignment','provider','provider_seat','agent_token') or p_kind is null then raise exception 'access_review_invalid'; end if;
 if p_kind not in ('delegation','agent_token') and actor_role<>'owner' then raise exception 'access_review_denied'; end if;
 if p_kind='member' then
  -- Owners are protected, including the last owner. Ownership transfer stays
  -- in its existing protocol; a review never removes or demotes an owner.
  if p_record_id=p_user_id then raise exception 'access_review_protected'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_record_id and role<>'owner' for update;
  if not found then raise exception 'access_review_protected'; end if;
  delete from public.workspace_memberships where workspace_id=p_business_id and user_id=p_record_id and role<>'owner'; changed:=found;
 elsif p_kind='delegation' then
  update public.workspace_delegations set status='revoked',revoked_at=clock_timestamp(),revoked_by=p_user_id where id=p_record_id and customer_workspace_id=p_business_id and status='active'; changed:=found;
 elsif p_kind='operational_assignment' then
  perform 1 from public.operational_assignments where id=p_record_id and workspace_id=p_business_id and status in ('offered','accepted') and expires_at>clock_timestamp() for update;
  if found then perform public.revoke_operational_assignment(p_user_id,p_verified_email,p_record_id); changed:=true; end if;
 elsif p_kind='agency_assignment' then
  update public.agency_client_staff set status='ended',ended_at=clock_timestamp(),ended_by=p_user_id where id=p_record_id and customer_workspace_id=p_business_id and status='active'; changed:=found;
 elsif p_kind='provider_seat' then
  update public.provider_seats set status='ended',ended_at=clock_timestamp(),ended_by=p_user_id,end_reason='Access review revocation' where id=p_record_id and customer_workspace_id=p_business_id and status='active'; changed:=found;
 elsif p_kind='provider' then
  select * into provider_row from public.workspace_providers where id=p_record_id and customer_workspace_id=p_business_id and status='active' for update;
  if found then perform public.end_business_provider(p_user_id,p_verified_email,p_business_id,'Access review revocation'); changed:=true; end if;
 else
  -- Work-first order matches native grant writers. Revoking this credential
  -- does not remove its shared participation grant or another credential.
  select w.* into work_row from public.saved_product_work w join public.workspace_agent_access_tokens t on t.work_id=w.id where t.id=p_record_id and w.workspace_id=p_business_id for update of w;
  if not found then raise exception 'access_review_denied'; end if;
  select * into token_row from public.workspace_agent_access_tokens where id=p_record_id for update;
  if token_row.revoked_at is null then
   update public.workspace_agent_access_tokens set revoked_at=clock_timestamp(),revoked_by=p_user_id where id=p_record_id;
   insert into public.workspace_agent_access_events(event_key,token_id,issuer_user_id,work_id,grant_id,action)
   values('revoked:'||p_record_id,p_record_id,token_row.issuer_user_id,token_row.work_id,token_row.grant_id,'revoked') on conflict(event_key) do nothing;
   changed:=true;
  end if;
 end if;
 if changed then
  insert into public.customer_mapping_audit(organization_workspace_id,record_type,record_id,action,record_version,actor_id,evidence_reference)
  values(p_workspace_id,p_kind,p_record_id,'revoked',1,p_user_id,'access-review:'||p_business_id);
 end if;
 return jsonb_build_object('ok',true,'changed',changed);
end;$$;
drop function public.read_enterprise_unit_versions(uuid,uuid,uuid,text);
drop function public.change_enterprise_unit(uuid,text,jsonb);
drop function public.read_enterprise_units(uuid,uuid,text);
drop function public.enterprise_read_require(uuid,uuid,text);
drop function public.enterprise_require(uuid,uuid,text,boolean);
drop table public.enterprise_unit_audit,public.enterprise_unit_versions,public.enterprise_units;

notify pgrst,'reload schema';
commit;
