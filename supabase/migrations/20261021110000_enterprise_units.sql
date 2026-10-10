begin;
set local lock_timeout='5s';
-- A Unit is explicit structure, not a membership, provider or customer grant.
create table public.enterprise_units (
 id uuid primary key, organization_workspace_id uuid not null references public.workspaces(id),
 business_workspace_id uuid not null references public.workspaces(id), parent_id uuid,
 name text not null check (name=btrim(name) and length(name) between 1 and 160),
 kind text not null check (kind in ('business','location','division','franchise')),
 status text not null default 'active' check (status in ('active','archived')),
 row_revision bigint not null default 1 check (row_revision>0),
 created_by uuid not null references public.users(id), created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(), unique(id,organization_workspace_id),
 foreign key(parent_id,organization_workspace_id) references public.enterprise_units(id,organization_workspace_id), check(parent_id is distinct from id)
);
create table public.enterprise_unit_versions (
 unit_id uuid not null references public.enterprise_units(id), version_id uuid not null unique references public.system_versions(id),
 bound_by uuid not null references public.users(id), bound_at timestamptz not null default clock_timestamp(), primary key(unit_id,version_id)
);
create table public.enterprise_unit_audit (
 id bigint generated always as identity primary key, organization_workspace_id uuid not null references public.workspaces(id),
 unit_id uuid not null references public.enterprise_units(id), action text not null check(action in ('put','archive','bind_version')),
 row_revision bigint not null, actor_id uuid not null references public.users(id), occurred_at timestamptz not null default clock_timestamp(), detail jsonb not null
);
alter table public.enterprise_units enable row level security;
alter table public.enterprise_unit_versions enable row level security;
alter table public.enterprise_unit_audit enable row level security;
revoke all on public.enterprise_units,public.enterprise_unit_versions,public.enterprise_unit_audit from public,anon,authenticated,service_role;
create function public.enterprise_require(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare role text;
begin
 if p_write then
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
  if not found then raise exception 'enterprise_denied'; end if;
  select m.role into role from public.workspace_memberships m where workspace_id=p_workspace_id and user_id=p_user_id for share;
 else
  select m.role into role from public.workspace_memberships m join public.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and m.user_id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
 end if;
 if role is null or (p_write and role not in ('owner','admin')) then raise exception 'enterprise_denied'; end if;
 if p_write and public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 return role;
end;$$;
-- Snapshot authority for STABLE readers. Structure never inherits provider seats.
create function public.enterprise_read_require(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare role text;
begin
 select m.role into role from public.workspace_memberships m join public.users u on u.id=m.user_id
 where m.workspace_id=p_workspace_id and m.user_id=p_user_id
 and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
 if role is null then raise exception 'enterprise_denied'; end if;
 return role;
end;$$;
revoke all on function public.enterprise_read_require(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_enterprise_units(p_organization_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; inaccessible integer;
begin
 perform public.enterprise_read_require(p_organization_id,p_user_id,p_verified_email);
 select count(*) into inaccessible from public.enterprise_units e where e.organization_workspace_id=p_organization_id and not exists(select 1 from public.workspace_memberships m where m.workspace_id=e.business_workspace_id and m.user_id=p_user_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'organizationId',e.organization_workspace_id,'businessId',e.business_workspace_id,
  'parentId',case when exists(select 1 from public.enterprise_units p join public.workspace_memberships m on m.workspace_id=p.business_workspace_id and m.user_id=p_user_id where p.id=e.parent_id) then e.parent_id else null end,
  'name',e.name,'kind',e.kind,'status',e.status,'revision',e.row_revision,'versionIds',coalesce((select jsonb_agg(v.version_id order by v.version_id) from public.enterprise_unit_versions v where v.unit_id=e.id),'[]'::jsonb)) order by e.name,e.id),'[]'::jsonb) into result
 from public.enterprise_units e join public.workspace_memberships m on m.workspace_id=e.business_workspace_id and m.user_id=p_user_id where e.organization_workspace_id=p_organization_id;
 return jsonb_build_object('organizationId',p_organization_id,'units',result,'inaccessibleUnits',inaccessible);
end;$$;
create function public.change_enterprise_unit(p_user_id uuid,p_verified_email text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; unit uuid:=(p_input->>'id')::uuid; action text:=p_input->>'action'; e public.enterprise_units; parent public.enterprise_units; business uuid; expected bigint:=(p_input->>'expectedRevision')::bigint; version public.system_versions;
begin
 if action not in ('put','archive','bind_version') or action is null or expected is null or expected<0 or org is null or unit is null then raise exception 'enterprise_input_invalid'; end if;
 -- Lock the organization row before structure; serialize hierarchy changes.
 perform 1 from public.workspaces where id=org for update;
 perform public.enterprise_require(org,p_user_id,p_verified_email,true);
 select * into e from public.enterprise_units where id=unit for update;
 if found and e.organization_workspace_id<>org then raise exception 'enterprise_denied'; end if;
 if action='put' and expected=0 and e.row_revision=1 and e.created_by=p_user_id
  and e.business_workspace_id=(p_input->>'businessId')::uuid and e.parent_id is not distinct from (p_input->>'parentId')::uuid
  and e.name=p_input->>'name' and e.kind=p_input->>'kind' and e.status='active' then
  perform public.enterprise_require(e.business_workspace_id,p_user_id,p_verified_email,true);
  return jsonb_build_object('ok',true,'id',unit,'revision',1);
 end if;
 if coalesce(e.row_revision,0)<>expected then raise exception 'enterprise_stale'; end if;
 business:=coalesce(e.business_workspace_id,(p_input->>'businessId')::uuid);
 perform public.enterprise_require(business,p_user_id,p_verified_email,true);
 if e.status='archived' then raise exception 'enterprise_archived'; end if;
 if action='put' then
  if e.id is not null and (p_input->>'businessId')::uuid<>business then raise exception 'enterprise_identity'; end if;
  if (p_input->>'parentId')::uuid is not null then
   select * into parent from public.enterprise_units where id=(p_input->>'parentId')::uuid and organization_workspace_id=org and status='active';
   if not found then raise exception 'enterprise_parent'; end if;
   perform public.enterprise_require(parent.business_workspace_id,p_user_id,p_verified_email,true);
   if exists(with recursive ancestors as (select parent.id id,parent.parent_id parent_id union all select u.id,u.parent_id from public.enterprise_units u join ancestors a on u.id=a.parent_id) select 1 from ancestors where id=unit) then raise exception 'enterprise_cycle'; end if;
  end if;
  insert into public.enterprise_units(id,organization_workspace_id,business_workspace_id,parent_id,name,kind,created_by)
   values(unit,org,business,(p_input->>'parentId')::uuid,p_input->>'name',p_input->>'kind',p_user_id)
   on conflict(id) do update set parent_id=excluded.parent_id,name=excluded.name,kind=excluded.kind,row_revision=enterprise_units.row_revision+1,updated_at=clock_timestamp() returning * into e;
 elsif action='archive' then
  if e.id is null then raise exception 'enterprise_denied'; end if;
  if exists(select 1 from public.enterprise_units where parent_id=unit and status='active') then raise exception 'enterprise_children'; end if;
  update public.enterprise_units set status='archived',row_revision=row_revision+1,updated_at=clock_timestamp() where id=unit returning * into e;
 else
  if e.id is null then raise exception 'enterprise_denied'; end if;
  select * into version from public.system_versions where id=(p_input->>'versionId')::uuid and business_workspace_id=business for update;
  if not found then raise exception 'enterprise_version'; end if;
  insert into public.enterprise_unit_versions(unit_id,version_id,bound_by) values(unit,version.id,p_user_id) on conflict(version_id) do nothing;
  if not found then raise exception 'enterprise_version'; end if;
  update public.enterprise_units set row_revision=row_revision+1,updated_at=clock_timestamp() where id=unit returning * into e;
 end if;
 insert into public.enterprise_unit_audit(organization_workspace_id,unit_id,action,row_revision,actor_id,detail) values(org,unit,action,e.row_revision,p_user_id,p_input-'organizationId'-'id'-'businessId');
 return jsonb_build_object('ok',true,'id',unit,'revision',e.row_revision);
end;$$;
revoke all on function public.enterprise_require(uuid,uuid,text,boolean),public.read_enterprise_units(uuid,uuid,text),public.change_enterprise_unit(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.read_enterprise_units(uuid,uuid,text),public.change_enterprise_unit(uuid,text,jsonb) to service_role;
-- Access review now includes explicit Units as well as preexisting mapped businesses.
create or replace function public.access_review_units(p_workspace_id uuid,p_user_id uuid,p_organization boolean)
returns setof uuid language sql stable security definer set search_path=public,pg_temp as $$
 select p_workspace_id union
 select r.customer_workspace_id from public.customer_relationships r join public.workspace_memberships m on m.workspace_id=r.customer_workspace_id and m.user_id=p_user_id
 where p_organization and r.organization_workspace_id=p_workspace_id and r.status='active' and r.customer_workspace_id is not null union
 select e.business_workspace_id from public.enterprise_units e join public.workspace_memberships m on m.workspace_id=e.business_workspace_id and m.user_id=p_user_id
 where p_organization and e.organization_workspace_id=p_workspace_id and e.status='active'
$$;
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
  if not found then
   perform 1 from public.enterprise_units where organization_workspace_id=p_workspace_id and business_workspace_id=p_business_id and status='active' for share;
   if not found then raise exception 'access_review_denied'; end if;
  end if;
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
create function public.read_enterprise_unit_versions(p_organization_id uuid,p_unit_id uuid,p_user_id uuid,p_verified_email text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e public.enterprise_units; result jsonb;
begin
 perform public.enterprise_read_require(p_organization_id,p_user_id,p_verified_email);
 select * into e from public.enterprise_units where id=p_unit_id and organization_workspace_id=p_organization_id;
 if not found then raise exception 'enterprise_denied'; end if;
 perform public.enterprise_read_require(e.business_workspace_id,p_user_id,p_verified_email);
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',s.name,'context',v.context_label,'baselineRevision',v.baseline_revision,'assigned',exists(select 1 from public.enterprise_unit_versions a where a.version_id=v.id)) order by s.name,v.id),'[]'::jsonb) into result from public.system_versions v join public.systems s on s.id=v.version_system_id where v.business_workspace_id=e.business_workspace_id;
 return jsonb_build_object('unitId',e.id,'businessId',e.business_workspace_id,'versions',result);
end;$$;
revoke all on function public.read_enterprise_unit_versions(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_enterprise_unit_versions(uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
